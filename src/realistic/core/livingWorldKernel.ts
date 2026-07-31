export type KernelPayload = Record<string, unknown>

export interface KernelEventInput {
  type: string
  payload?: KernelPayload
}

export interface KernelEvent {
  id: string
  sequence: number
  type: string
  source: string
  time: number
  tick: number
  payload: KernelPayload
}

export interface KernelCommandInput {
  type: string
  target?: string
  executeAt?: number
  payload?: KernelPayload
}

export interface KernelCommand {
  id: string
  sequence: number
  type: string
  target?: string
  executeAt: number
  payload: KernelPayload
}

export interface KernelStepContext {
  delta: number
  time: number
  tick: number
  emit: (event: KernelEventInput) => void
}

export interface KernelSystem {
  readonly id: string
  step(context: KernelStepContext): void
  handleCommand?(command: KernelCommand, context: KernelStepContext): void
  snapshot(): unknown
  restore(snapshot: unknown): void
}

export interface LivingWorldKernelOptions {
  fixedDelta?: number
  maximumFrameDelta?: number
  maximumSubSteps?: number
  eventCapacity?: number
}

export interface LivingWorldKernelSnapshot {
  version: 1
  fixedDelta: number
  clock: {
    time: number
    tick: number
    accumulator: number
    paused: boolean
    timeScale: number
  }
  sequences: {
    event: number
    command: number
  }
  pendingCommands: KernelCommand[]
  events: KernelEvent[]
  systems: Record<string, unknown>
}

export interface KernelTelemetry {
  time: number
  tick: number
  paused: boolean
  timeScale: number
  pendingCommands: number
  eventCount: number
  lastEvent: KernelEvent | null
}

const EPSILON = 1e-9

function cloneSerializable<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser um número positivo e finito`)
  }
}

export class LivingWorldKernel {
  readonly fixedDelta: number

  private readonly maximumFrameDelta: number
  private readonly maximumSubSteps: number
  private readonly eventCapacity: number
  private readonly systems = new Map<string, KernelSystem>()
  private readonly pendingCommands: KernelCommand[] = []
  private readonly eventLog: KernelEvent[] = []

  private accumulator = 0
  private time = 0
  private tick = 0
  private paused = false
  private timeScale = 1
  private eventSequence = 0
  private commandSequence = 0

  constructor(options: LivingWorldKernelOptions = {}) {
    this.fixedDelta = options.fixedDelta ?? 1 / 30
    this.maximumFrameDelta = options.maximumFrameDelta ?? 0.25
    this.maximumSubSteps = options.maximumSubSteps ?? 12
    this.eventCapacity = options.eventCapacity ?? 1_000

    assertPositiveFinite(this.fixedDelta, 'fixedDelta')
    assertPositiveFinite(this.maximumFrameDelta, 'maximumFrameDelta')
    if (!Number.isInteger(this.maximumSubSteps) || this.maximumSubSteps <= 0) {
      throw new Error('maximumSubSteps deve ser um inteiro positivo')
    }
    if (!Number.isInteger(this.eventCapacity) || this.eventCapacity <= 0) {
      throw new Error('eventCapacity deve ser um inteiro positivo')
    }
  }

  registerSystem(system: KernelSystem): void {
    if (!system.id.trim()) throw new Error('sistema sem identificador')
    if (this.systems.has(system.id)) {
      throw new Error(`sistema já registrado: ${system.id}`)
    }
    this.systems.set(system.id, system)
    this.recordEvent('kernel', {
      type: 'kernel.system.registered',
      payload: { systemId: system.id },
    })
  }

  enqueueCommand(input: KernelCommandInput): KernelCommand {
    if (!input.type.trim()) throw new Error('comando sem tipo')
    const executeAt = input.executeAt ?? this.time
    if (!Number.isFinite(executeAt) || executeAt < 0) {
      throw new Error('executeAt deve ser um tempo válido')
    }

    this.commandSequence += 1
    const command: KernelCommand = {
      id: `command-${String(this.commandSequence).padStart(6, '0')}`,
      sequence: this.commandSequence,
      type: input.type,
      target: input.target,
      executeAt,
      payload: cloneSerializable(input.payload ?? {}),
    }
    this.pendingCommands.push(command)
    this.pendingCommands.sort(
      (left, right) =>
        left.executeAt - right.executeAt || left.sequence - right.sequence,
    )
    this.recordEvent('kernel', {
      type: 'kernel.command.queued',
      payload: {
        commandId: command.id,
        commandType: command.type,
        target: command.target ?? null,
        executeAt: command.executeAt,
      },
    })
    return cloneSerializable(command)
  }

  advance(frameDelta: number): number {
    if (this.paused) return 0
    if (!Number.isFinite(frameDelta) || frameDelta < 0) {
      throw new Error('frameDelta deve ser um número não negativo e finito')
    }

    const admitted = Math.min(frameDelta, this.maximumFrameDelta) * this.timeScale
    this.accumulator += admitted
    let steps = 0

    while (
      this.accumulator + EPSILON >= this.fixedDelta &&
      steps < this.maximumSubSteps
    ) {
      this.accumulator = Math.max(0, this.accumulator - this.fixedDelta)
      this.runFixedStep()
      steps += 1
    }

    if (this.accumulator + EPSILON >= this.fixedDelta) {
      const retained = this.accumulator % this.fixedDelta
      const dropped = this.accumulator - retained
      this.accumulator = retained
      this.recordEvent('kernel', {
        type: 'kernel.time.dropped',
        payload: { droppedSeconds: dropped },
      })
    }

    return steps
  }

  stepOnce(): void {
    this.runFixedStep()
  }

  pause(): void {
    if (this.paused) return
    this.paused = true
    this.recordEvent('kernel', { type: 'kernel.paused' })
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.recordEvent('kernel', { type: 'kernel.resumed' })
  }

  setTimeScale(scale: number): void {
    assertPositiveFinite(scale, 'timeScale')
    this.timeScale = scale
    this.recordEvent('kernel', {
      type: 'kernel.time-scale.changed',
      payload: { timeScale: scale },
    })
  }

  telemetry(): KernelTelemetry {
    return {
      time: this.time,
      tick: this.tick,
      paused: this.paused,
      timeScale: this.timeScale,
      pendingCommands: this.pendingCommands.length,
      eventCount: this.eventLog.length,
      lastEvent: this.eventLog.length
        ? cloneSerializable(this.eventLog[this.eventLog.length - 1])
        : null,
    }
  }

  events(limit = this.eventCapacity): KernelEvent[] {
    const safeLimit = Math.max(0, Math.floor(limit))
    return cloneSerializable(this.eventLog.slice(-safeLimit))
  }

  snapshot(): LivingWorldKernelSnapshot {
    const systems: Record<string, unknown> = {}
    for (const [id, system] of this.systems) {
      systems[id] = cloneSerializable(system.snapshot())
    }

    return {
      version: 1,
      fixedDelta: this.fixedDelta,
      clock: {
        time: this.time,
        tick: this.tick,
        accumulator: this.accumulator,
        paused: this.paused,
        timeScale: this.timeScale,
      },
      sequences: {
        event: this.eventSequence,
        command: this.commandSequence,
      },
      pendingCommands: cloneSerializable(this.pendingCommands),
      events: cloneSerializable(this.eventLog),
      systems,
    }
  }

  restore(snapshot: LivingWorldKernelSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(`versão de snapshot não suportada: ${snapshot.version}`)
    }
    if (Math.abs(snapshot.fixedDelta - this.fixedDelta) > EPSILON) {
      throw new Error('snapshot usa passo fixo incompatível')
    }

    const registeredIds = [...this.systems.keys()].sort()
    const snapshotIds = Object.keys(snapshot.systems).sort()
    if (registeredIds.join('|') !== snapshotIds.join('|')) {
      throw new Error('snapshot possui conjunto de sistemas incompatível')
    }

    for (const [id, system] of this.systems) {
      system.restore(cloneSerializable(snapshot.systems[id]))
    }

    this.time = snapshot.clock.time
    this.tick = snapshot.clock.tick
    this.accumulator = snapshot.clock.accumulator
    this.paused = snapshot.clock.paused
    this.timeScale = snapshot.clock.timeScale
    this.eventSequence = snapshot.sequences.event
    this.commandSequence = snapshot.sequences.command

    this.pendingCommands.splice(
      0,
      this.pendingCommands.length,
      ...cloneSerializable(snapshot.pendingCommands),
    )
    this.eventLog.splice(
      0,
      this.eventLog.length,
      ...cloneSerializable(snapshot.events).slice(-this.eventCapacity),
    )
  }

  private runFixedStep(): void {
    this.tick += 1
    this.time = this.tick * this.fixedDelta
    this.executeDueCommands()

    for (const system of this.systems.values()) {
      system.step(this.contextFor(system.id))
    }
  }

  private executeDueCommands(): void {
    while (
      this.pendingCommands.length > 0 &&
      this.pendingCommands[0].executeAt <= this.time + EPSILON
    ) {
      const command = this.pendingCommands.shift()!
      const recipients = command.target
        ? [this.systems.get(command.target)].filter(
            (system): system is KernelSystem => Boolean(system),
          )
        : [...this.systems.values()]

      if (command.target && recipients.length === 0) {
        this.recordEvent('kernel', {
          type: 'kernel.command.rejected',
          payload: {
            commandId: command.id,
            commandType: command.type,
            reason: 'target-not-found',
            target: command.target,
          },
        })
        continue
      }

      for (const system of recipients) {
        system.handleCommand?.(command, this.contextFor(system.id))
      }
      this.recordEvent('kernel', {
        type: 'kernel.command.executed',
        payload: {
          commandId: command.id,
          commandType: command.type,
          target: command.target ?? 'broadcast',
        },
      })
    }
  }

  private contextFor(source: string): KernelStepContext {
    return {
      delta: this.fixedDelta,
      time: this.time,
      tick: this.tick,
      emit: (event) => this.recordEvent(source, event),
    }
  }

  private recordEvent(source: string, input: KernelEventInput): void {
    this.eventSequence += 1
    const event: KernelEvent = {
      id: `event-${String(this.eventSequence).padStart(8, '0')}`,
      sequence: this.eventSequence,
      type: input.type,
      source,
      time: this.time,
      tick: this.tick,
      payload: cloneSerializable(input.payload ?? {}),
    }
    this.eventLog.push(event)
    if (this.eventLog.length > this.eventCapacity) {
      this.eventLog.splice(0, this.eventLog.length - this.eventCapacity)
    }
  }
}
