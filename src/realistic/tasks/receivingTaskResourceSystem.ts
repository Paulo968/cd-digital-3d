import type {
  KernelCommand,
  KernelStepContext,
  KernelSystem,
} from '../core/livingWorldKernel'
import type {
  ReceivingPallet,
  ReceivingScenarioConfig,
  ReceivingSimulationState,
} from '../../realistic-v2/receivingSimulation'

export type ReceivingTaskStatus =
  | 'created'
  | 'waiting-resources'
  | 'assigned'
  | 'executing'
  | 'completed'
  | 'cancelled'

export type ReceivingResourceStatus = 'available' | 'reserved' | 'busy'

export interface ReceivingTask {
  id: string
  sequence: number
  type: 'unload-to-staging'
  palletId: string
  batch: number
  source: string
  destinationSlot: number | null
  assignedResourceId: string | null
  status: ReceivingTaskStatus
  waitReason: string | null
  createdTick: number
  updatedTick: number
  completedTick: number | null
}

export interface ReceivingResource {
  id: 'RX20-REC'
  kind: 'counterbalance-forklift'
  status: ReceivingResourceStatus
  taskId: string | null
}

export interface ReceivingOperationsTelemetry {
  tasks: ReceivingTask[]
  activeTask: ReceivingTask | null
  queued: number
  executing: number
  completed: number
  reservedSlots: number[]
  resource: ReceivingResource
}

interface ReceivingTaskResourceSnapshot {
  version: 1
  taskSequence: number
  tasks: ReceivingTask[]
  resource: ReceivingResource
}

const TASK_HISTORY_LIMIT = 240

function cloneTask(task: ReceivingTask): ReceivingTask {
  return { ...task }
}

function cloneResource(resource: ReceivingResource): ReceivingResource {
  return { ...resource }
}

function batchFromPalletId(palletId: string, fallback: number): number {
  const match = palletId.match(/-(\d+)-\d+$/)
  if (!match) return fallback
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function assertSnapshot(value: unknown): ReceivingTaskResourceSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('snapshot de tarefas do recebimento inválido')
  }
  const candidate = value as Partial<ReceivingTaskResourceSnapshot>
  if (
    candidate.version !== 1 ||
    !Number.isInteger(candidate.taskSequence) ||
    (candidate.taskSequence ?? -1) < 0 ||
    !Array.isArray(candidate.tasks) ||
    !candidate.resource
  ) {
    throw new Error('snapshot de tarefas do recebimento incompatível')
  }
  return candidate as ReceivingTaskResourceSnapshot
}

export class ReceivingTaskResourceSystem implements KernelSystem {
  readonly id = 'receiving-operations'

  private readonly tasks = new Map<string, ReceivingTask>()
  private readonly resource: ReceivingResource = {
    id: 'RX20-REC',
    kind: 'counterbalance-forklift',
    status: 'available',
    taskId: null,
  }
  private taskSequence = 0

  constructor(
    private readonly readReceivingState: () => Readonly<ReceivingSimulationState>,
    private readonly config: ReceivingScenarioConfig,
  ) {}

  step(context: KernelStepContext): void {
    const state = this.readReceivingState()
    this.createMissingTasks(state, context)
    this.reconcileTaskStates(state, context)
    this.reserveDestinations(state, context)
    this.assignNextTask(state, context)
    this.trimHistory()
  }

  handleCommand(command: KernelCommand, context: KernelStepContext): void {
    if (command.type !== 'receiving.reset') return
    this.tasks.clear()
    this.taskSequence = 0
    this.releaseResource(context, 'reset')
    context.emit({
      type: 'receiving.operations.reset',
      payload: { scenarioId: this.config.id },
    })
  }

  telemetry(): ReceivingOperationsTelemetry {
    const tasks = [...this.tasks.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneTask)
    const activeTask = this.resource.taskId
      ? tasks.find((task) => task.id === this.resource.taskId) ?? null
      : null

    return {
      tasks,
      activeTask: activeTask ? cloneTask(activeTask) : null,
      queued: tasks.filter((task) =>
        ['created', 'waiting-resources', 'assigned'].includes(task.status),
      ).length,
      executing: tasks.filter((task) => task.status === 'executing').length,
      completed: tasks.filter((task) => task.status === 'completed').length,
      reservedSlots: tasks
        .filter(
          (task) =>
            task.destinationSlot !== null &&
            task.status !== 'completed' &&
            task.status !== 'cancelled',
        )
        .map((task) => task.destinationSlot as number)
        .sort((left, right) => left - right),
      resource: cloneResource(this.resource),
    }
  }

  snapshot(): ReceivingTaskResourceSnapshot {
    return {
      version: 1,
      taskSequence: this.taskSequence,
      tasks: [...this.tasks.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map(cloneTask),
      resource: cloneResource(this.resource),
    }
  }

  restore(value: unknown): void {
    const snapshot = assertSnapshot(value)
    this.taskSequence = snapshot.taskSequence
    this.tasks.clear()
    for (const task of snapshot.tasks) {
      this.tasks.set(task.palletId, cloneTask(task))
    }
    Object.assign(this.resource, cloneResource(snapshot.resource))
  }

  private createMissingTasks(
    state: Readonly<ReceivingSimulationState>,
    context: KernelStepContext,
  ): void {
    const orderedPallets = [...state.pallets].sort((left, right) =>
      left.id.localeCompare(right.id),
    )

    for (const pallet of orderedPallets) {
      if (this.tasks.has(pallet.id)) continue
      this.taskSequence += 1
      const batch = batchFromPalletId(pallet.id, state.batch)
      const task: ReceivingTask = {
        id: `receiving-task-${String(this.taskSequence).padStart(6, '0')}`,
        sequence: this.taskSequence,
        type: 'unload-to-staging',
        palletId: pallet.id,
        batch,
        source: `truck:${String(batch).padStart(3, '0')}:pallet:${pallet.index + 1}`,
        destinationSlot: pallet.stagedSlot,
        assignedResourceId: null,
        status:
          pallet.phase === 'staged'
            ? 'completed'
            : pallet.phase === 'carried'
              ? 'executing'
              : 'created',
        waitReason: null,
        createdTick: context.tick,
        updatedTick: context.tick,
        completedTick: pallet.phase === 'staged' ? context.tick : null,
      }
      this.tasks.set(pallet.id, task)
      context.emit({
        type: 'task.created',
        payload: {
          taskId: task.id,
          taskType: task.type,
          palletId: task.palletId,
          batch: task.batch,
        },
      })
    }
  }

  private reconcileTaskStates(
    state: Readonly<ReceivingSimulationState>,
    context: KernelStepContext,
  ): void {
    const pallets = new Map(state.pallets.map((pallet) => [pallet.id, pallet]))

    for (const task of this.tasks.values()) {
      const pallet = pallets.get(task.palletId)
      if (!pallet) {
        if (task.status !== 'completed' && task.status !== 'cancelled') {
          task.status = 'cancelled'
          task.waitReason = 'pallet-not-found'
          task.updatedTick = context.tick
          context.emit({
            type: 'task.cancelled',
            payload: {
              taskId: task.id,
              palletId: task.palletId,
              reason: task.waitReason,
            },
          })
          if (this.resource.taskId === task.id) {
            this.releaseResource(context, 'task-cancelled')
          }
        }
        continue
      }

      if (pallet.phase === 'staged') {
        this.completeTask(task, pallet, context)
        continue
      }

      if (pallet.phase === 'carried') {
        this.startTask(task, context)
      }
    }
  }

  private reserveDestinations(
    state: Readonly<ReceivingSimulationState>,
    context: KernelStepContext,
  ): void {
    const occupied = new Set(
      state.pallets
        .filter((pallet) => pallet.phase === 'staged' && pallet.stagedSlot !== null)
        .map((pallet) => pallet.stagedSlot as number),
    )
    for (const task of this.tasks.values()) {
      if (
        task.destinationSlot !== null &&
        task.status !== 'completed' &&
        task.status !== 'cancelled'
      ) {
        occupied.add(task.destinationSlot)
      }
    }

    const waiting = [...this.tasks.values()]
      .filter(
        (task) =>
          task.destinationSlot === null &&
          task.status !== 'completed' &&
          task.status !== 'cancelled',
      )
      .sort((left, right) => left.sequence - right.sequence)

    for (const task of waiting) {
      const slot = this.firstAvailableSlot(occupied)
      if (slot === null) {
        if (task.status !== 'waiting-resources' || task.waitReason !== 'staging-full') {
          task.status = 'waiting-resources'
          task.waitReason = 'staging-full'
          task.updatedTick = context.tick
          context.emit({
            type: 'task.waiting',
            payload: {
              taskId: task.id,
              palletId: task.palletId,
              reason: task.waitReason,
            },
          })
        }
        continue
      }

      occupied.add(slot)
      task.destinationSlot = slot
      task.waitReason = null
      task.updatedTick = context.tick
      context.emit({
        type: 'reservation.created',
        payload: {
          taskId: task.id,
          palletId: task.palletId,
          reservationType: 'staging-slot',
          slot,
        },
      })
    }
  }

  private assignNextTask(
    state: Readonly<ReceivingSimulationState>,
    context: KernelStepContext,
  ): void {
    if (this.resource.taskId || state.fault || state.truck.phase !== 'docked') return

    const pallets = new Map(state.pallets.map((pallet) => [pallet.id, pallet]))
    const next = [...this.tasks.values()]
      .filter((task) => {
        const pallet = pallets.get(task.palletId)
        return (
          pallet?.phase === 'truck' &&
          task.destinationSlot !== null &&
          task.status !== 'completed' &&
          task.status !== 'cancelled'
        )
      })
      .sort((left, right) => left.sequence - right.sequence)[0]

    if (!next) return

    next.status = 'assigned'
    next.assignedResourceId = this.resource.id
    next.waitReason = null
    next.updatedTick = context.tick
    this.resource.status = 'reserved'
    this.resource.taskId = next.id

    context.emit({
      type: 'resource.reserved',
      payload: {
        resourceId: this.resource.id,
        taskId: next.id,
      },
    })
    context.emit({
      type: 'task.assigned',
      payload: {
        taskId: next.id,
        palletId: next.palletId,
        resourceId: this.resource.id,
        destinationSlot: next.destinationSlot,
      },
    })
  }

  private startTask(task: ReceivingTask, context: KernelStepContext): void {
    if (this.resource.taskId && this.resource.taskId !== task.id) {
      const previous = [...this.tasks.values()].find(
        (candidate) => candidate.id === this.resource.taskId,
      )
      if (previous && previous.status !== 'completed') {
        previous.status = 'waiting-resources'
        previous.assignedResourceId = null
        previous.waitReason = 'resource-reassigned-by-observed-operation'
        previous.updatedTick = context.tick
      }
    }

    const wasExecuting = task.status === 'executing'
    task.status = 'executing'
    task.assignedResourceId = this.resource.id
    task.waitReason = null
    task.updatedTick = context.tick
    this.resource.status = 'busy'
    this.resource.taskId = task.id

    if (!wasExecuting) {
      context.emit({
        type: 'task.started',
        payload: {
          taskId: task.id,
          palletId: task.palletId,
          resourceId: this.resource.id,
          destinationSlot: task.destinationSlot,
        },
      })
    }
  }

  private completeTask(
    task: ReceivingTask,
    pallet: ReceivingPallet,
    context: KernelStepContext,
  ): void {
    if (
      pallet.stagedSlot !== null &&
      task.destinationSlot !== pallet.stagedSlot
    ) {
      const previousSlot = task.destinationSlot
      task.destinationSlot = pallet.stagedSlot
      context.emit({
        type: 'task.destination.reconciled',
        payload: {
          taskId: task.id,
          palletId: task.palletId,
          fromSlot: previousSlot,
          toSlot: pallet.stagedSlot,
        },
      })
    }

    if (task.status === 'completed') return
    task.status = 'completed'
    task.assignedResourceId = null
    task.waitReason = null
    task.updatedTick = context.tick
    task.completedTick = context.tick

    context.emit({
      type: 'task.completed',
      payload: {
        taskId: task.id,
        palletId: task.palletId,
        destinationSlot: task.destinationSlot,
        cycleTicks: context.tick - task.createdTick,
      },
    })

    if (this.resource.taskId === task.id) {
      this.releaseResource(context, 'task-completed')
    }
  }

  private releaseResource(context: KernelStepContext, reason: string): void {
    const previousTaskId = this.resource.taskId
    this.resource.status = 'available'
    this.resource.taskId = null
    if (!previousTaskId) return
    context.emit({
      type: 'resource.released',
      payload: {
        resourceId: this.resource.id,
        taskId: previousTaskId,
        reason,
      },
    })
  }

  private firstAvailableSlot(occupied: Set<number>): number | null {
    for (let slot = 0; slot < this.config.stagingCapacity; slot += 1) {
      if (!occupied.has(slot)) return slot
    }
    return null
  }

  private trimHistory(): void {
    const completed = [...this.tasks.values()]
      .filter((task) => task.status === 'completed' || task.status === 'cancelled')
      .sort((left, right) => left.sequence - right.sequence)
    const overflow = completed.length - TASK_HISTORY_LIMIT
    if (overflow <= 0) return
    for (const task of completed.slice(0, overflow)) {
      this.tasks.delete(task.palletId)
    }
  }
}
