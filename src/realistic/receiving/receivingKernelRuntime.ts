import {
  LivingWorldKernel,
  type KernelCommand,
  type KernelEvent,
  type KernelStepContext,
  type KernelSystem,
  type KernelTelemetry,
  type LivingWorldKernelSnapshot,
} from '../core/livingWorldKernel'
import {
  receivingExecutionPermit,
  type ReceivingExecutionPermit,
} from '../tasks/receivingExecutionAuthority'
import {
  ReceivingTaskResourceSystem,
  type ReceivingOperationsTelemetry,
} from '../tasks/receivingTaskResourceSystem'
import {
  ReceivingSimulation,
  type ReceivingPallet,
  type ReceivingScenarioConfig,
  type ReceivingSimulationState,
} from '../../realistic-v2/receivingSimulation'

interface ReceivingSystemSnapshot {
  version: 2
  stepsSinceReset: number
  lastBlockedReason: string | null
  state: ReceivingSimulationState
}

export interface ReceivingKernelRuntimeOptions {
  fixedDelta?: number
  eventCapacity?: number
}

function clonePallet(pallet: ReceivingPallet): ReceivingPallet {
  return { ...pallet }
}

function assertReceivingSnapshot(value: unknown): ReceivingSystemSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('snapshot do recebimento inválido')
  }
  const candidate = value as Partial<ReceivingSystemSnapshot>
  if (
    candidate.version !== 2 ||
    !Number.isInteger(candidate.stepsSinceReset) ||
    (candidate.stepsSinceReset ?? -1) < 0 ||
    !candidate.state ||
    (candidate.lastBlockedReason !== null &&
      typeof candidate.lastBlockedReason !== 'string')
  ) {
    throw new Error('snapshot do recebimento incompatível')
  }
  return candidate as ReceivingSystemSnapshot
}

function statesMatch(
  rebuilt: ReceivingSimulationState,
  expected: ReceivingSimulationState,
): boolean {
  return JSON.stringify(rebuilt) === JSON.stringify(expected)
}

class ReceivingKernelSystem implements KernelSystem {
  readonly id = 'receiving'

  private engine: ReceivingSimulation
  private previous: ReceivingSimulationState
  private stepsSinceReset = 0
  private lastBlockedReason: string | null = null

  constructor(
    private readonly config: ReceivingScenarioConfig,
    private readonly fixedDelta: number,
    private readonly executionPermit: () => ReceivingExecutionPermit,
  ) {
    this.engine = new ReceivingSimulation(config)
    this.previous = this.engine.snapshot()
  }

  step(context: KernelStepContext): void {
    const permit = this.executionPermit()
    if (!permit.allowed) {
      if (this.lastBlockedReason !== permit.reason) {
        context.emit({
          type: 'receiving.execution.blocked',
          payload: {
            reason: permit.reason,
            taskId: permit.taskId,
            palletId: permit.palletId,
            destinationSlot: permit.destinationSlot,
          },
        })
      }
      this.lastBlockedReason = permit.reason
      return
    }

    if (this.lastBlockedReason) {
      context.emit({
        type: 'receiving.execution.resumed',
        payload: {
          previousReason: this.lastBlockedReason,
          permitReason: permit.reason,
          taskId: permit.taskId,
          palletId: permit.palletId,
          destinationSlot: permit.destinationSlot,
        },
      })
      this.lastBlockedReason = null
    }

    this.engine.step(context.delta)
    this.stepsSinceReset += 1
    const current = this.engine.snapshot()
    this.publishTransitions(this.previous, current, context)
    this.previous = current
  }

  handleCommand(command: KernelCommand, context: KernelStepContext): void {
    if (command.type !== 'receiving.reset') return
    this.engine = new ReceivingSimulation(this.config)
    this.previous = this.engine.snapshot()
    this.stepsSinceReset = 0
    this.lastBlockedReason = null
    context.emit({
      type: 'receiving.reset',
      payload: { scenarioId: this.config.id },
    })
  }

  read(): Readonly<ReceivingSimulationState> {
    return this.engine.read()
  }

  receivingSnapshot(): ReceivingSimulationState {
    return this.engine.snapshot()
  }

  snapshot(): ReceivingSystemSnapshot {
    return {
      version: 2,
      stepsSinceReset: this.stepsSinceReset,
      lastBlockedReason: this.lastBlockedReason,
      state: this.engine.snapshot(),
    }
  }

  restore(value: unknown): void {
    const snapshot = assertReceivingSnapshot(value)
    const rebuilt = new ReceivingSimulation(this.config)
    for (let index = 0; index < snapshot.stepsSinceReset; index += 1) {
      rebuilt.step(this.fixedDelta)
    }
    const rebuiltState = rebuilt.snapshot()
    if (!statesMatch(rebuiltState, snapshot.state)) {
      throw new Error(
        'recebimento não pôde ser reconstruído deterministicamente pelo snapshot',
      )
    }
    this.engine = rebuilt
    this.previous = rebuiltState
    this.stepsSinceReset = snapshot.stepsSinceReset
    this.lastBlockedReason = snapshot.lastBlockedReason
  }

  private publishTransitions(
    previous: ReceivingSimulationState,
    current: ReceivingSimulationState,
    context: KernelStepContext,
  ): void {
    if (previous.label !== current.label) {
      context.emit({
        type: 'receiving.transition',
        payload: {
          label: current.label,
          forkliftPhase: current.forklift.phase,
          truckPhase: current.truck.phase,
        },
      })
    }

    if (previous.truck.phase !== current.truck.phase) {
      context.emit({
        type: 'truck.phase.changed',
        payload: {
          from: previous.truck.phase,
          to: current.truck.phase,
          batch: current.batch,
        },
      })
    }

    if (previous.batch !== current.batch) {
      context.emit({
        type: 'receiving.batch.started',
        payload: { batch: current.batch },
      })
    }

    if (previous.completedTrucks !== current.completedTrucks) {
      context.emit({
        type: 'truck.receiving.completed',
        payload: {
          completedTrucks: current.completedTrucks,
          completedBatch: current.batch - 1,
        },
      })
    }

    const previousPallets = new Map(
      previous.pallets.map((pallet) => [pallet.id, clonePallet(pallet)]),
    )
    const currentIds = new Set(current.pallets.map((pallet) => pallet.id))

    for (const pallet of current.pallets) {
      const before = previousPallets.get(pallet.id)
      if (!before) {
        context.emit({
          type: 'pallet.registered',
          payload: {
            palletId: pallet.id,
            phase: pallet.phase,
            batch: current.batch,
          },
        })
        continue
      }
      if (before.phase === pallet.phase && before.stagedSlot === pallet.stagedSlot) {
        continue
      }

      const type =
        pallet.phase === 'carried'
          ? 'pallet.picked'
          : pallet.phase === 'staged'
            ? 'pallet.staged'
            : 'pallet.phase.changed'
      context.emit({
        type,
        payload: {
          palletId: pallet.id,
          from: before.phase,
          to: pallet.phase,
          stagedSlot: pallet.stagedSlot,
        },
      })
    }

    for (const pallet of previous.pallets) {
      if (currentIds.has(pallet.id)) continue
      context.emit({
        type: 'pallet.removed',
        payload: { palletId: pallet.id, previousPhase: pallet.phase },
      })
    }

    if (!previous.fault && current.fault) {
      context.emit({
        type: 'safety.fault.activated',
        payload: { reason: current.fault },
      })
    }
  }
}

export class ReceivingKernelRuntime {
  readonly kernel: LivingWorldKernel

  private readonly system: ReceivingKernelSystem
  private readonly operationsSystem: ReceivingTaskResourceSystem

  constructor(
    config: ReceivingScenarioConfig,
    options: ReceivingKernelRuntimeOptions = {},
  ) {
    const fixedDelta = options.fixedDelta ?? 1 / 30
    this.kernel = new LivingWorldKernel({
      fixedDelta,
      eventCapacity: options.eventCapacity ?? 1_500,
      maximumSubSteps: 12,
    })

    const bridge: { current: ReceivingKernelSystem | null } = { current: null }
    const readReceivingState = (): Readonly<ReceivingSimulationState> => {
      if (!bridge.current) throw new Error('motor de recebimento ainda não inicializado')
      return bridge.current.read()
    }
    const operationsSystem = new ReceivingTaskResourceSystem(
      readReceivingState,
      config,
    )
    const receivingSystem = new ReceivingKernelSystem(config, fixedDelta, () =>
      receivingExecutionPermit(
        readReceivingState(),
        operationsSystem.telemetry(),
      ),
    )
    bridge.current = receivingSystem

    this.system = receivingSystem
    this.operationsSystem = operationsSystem

    // A camada operacional decide primeiro; o motor só avança depois da licença.
    this.kernel.registerSystem(this.operationsSystem)
    this.kernel.registerSystem(this.system)
  }

  step(frameDelta: number): void {
    this.kernel.advance(frameDelta)
  }

  read(): Readonly<ReceivingSimulationState> {
    return this.system.read()
  }

  snapshot(): ReceivingSimulationState {
    return this.system.receivingSnapshot()
  }

  checkpoint(): LivingWorldKernelSnapshot {
    return this.kernel.snapshot()
  }

  restore(checkpoint: LivingWorldKernelSnapshot): void {
    this.kernel.restore(checkpoint)
  }

  reset(): void {
    this.kernel.enqueueCommand({
      type: 'receiving.reset',
    })
    this.kernel.stepOnce()
  }

  pause(): void {
    this.kernel.pause()
  }

  resume(): void {
    this.kernel.resume()
  }

  stepOnce(): void {
    this.kernel.stepOnce()
  }

  setTimeScale(scale: number): void {
    this.kernel.setTimeScale(scale)
  }

  telemetry(): KernelTelemetry {
    return this.kernel.telemetry()
  }

  operations(): ReceivingOperationsTelemetry {
    return this.operationsSystem.telemetry()
  }

  executionPermit(): ReceivingExecutionPermit {
    return receivingExecutionPermit(this.system.read(), this.operationsSystem.telemetry())
  }

  events(limit = 50): KernelEvent[] {
    return this.kernel.events(limit)
  }
}

export function createReceivingKernelRuntime(
  config: ReceivingScenarioConfig,
  options?: ReceivingKernelRuntimeOptions,
): ReceivingKernelRuntime {
  return new ReceivingKernelRuntime(config, options)
}
