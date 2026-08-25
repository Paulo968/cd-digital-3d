import type {
  KernelCommand,
  KernelStepContext,
  KernelSystem,
} from '../core/livingWorldKernel'
import type { ReceivingOperationsTelemetry } from '../tasks/receivingTaskResourceSystem'

export type PutawayUnitStatus =
  | 'waiting-tp-in'
  | 'moving-to-buffer'
  | 'buffered'
  | 'moving-to-rack'
  | 'stored'

export interface PutawayUnit {
  id: string
  sequence: number
  palletId: string
  unloadTaskId: string
  stagingSlot: number
  bufferSlot: number | null
  rackAddress: string | null
  status: PutawayUnitStatus
  createdTick: number
  updatedTick: number
  storedTick: number | null
}

export interface PutawayResource {
  id: 'TP-IN' | 'REACH-PUT'
  kind: 'electric-pallet-truck' | 'reach-truck'
  status: 'available' | 'busy'
  palletId: string | null
  completeAtTick: number | null
}

export interface WarehousePutawayTelemetry {
  units: PutawayUnit[]
  waitingTransfer: number
  movingToBuffer: number
  buffered: number
  movingToRack: number
  storedTotal: number
  bufferOccupancy: number
  bufferCapacity: number
  tpIn: PutawayResource
  reach: PutawayResource
}

interface WarehousePutawaySnapshot {
  version: 1
  unitSequence: number
  rackSequence: number
  storedTotal: number
  bufferBlocked: boolean
  units: PutawayUnit[]
  tpIn: PutawayResource
  reach: PutawayResource
}

export interface WarehousePutawayFlowOptions {
  bufferCapacity?: number
  tpInTravelTicks?: number
  reachTravelTicks?: number
  historyCapacity?: number
}

const DEFAULT_BUFFER_CAPACITY = 4
const DEFAULT_TP_IN_TRAVEL_TICKS = 75
const DEFAULT_REACH_TRAVEL_TICKS = 105
const DEFAULT_HISTORY_CAPACITY = 240

function cloneUnit(unit: PutawayUnit): PutawayUnit {
  return { ...unit }
}

function cloneResource(resource: PutawayResource): PutawayResource {
  return { ...resource }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} deve ser um inteiro positivo`)
  }
}

function assertSnapshot(value: unknown): WarehousePutawaySnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('snapshot do putaway inválido')
  }
  const candidate = value as Partial<WarehousePutawaySnapshot>
  if (
    candidate.version !== 1 ||
    !Number.isInteger(candidate.unitSequence) ||
    !Number.isInteger(candidate.rackSequence) ||
    !Number.isInteger(candidate.storedTotal) ||
    typeof candidate.bufferBlocked !== 'boolean' ||
    !Array.isArray(candidate.units) ||
    !candidate.tpIn ||
    !candidate.reach
  ) {
    throw new Error('snapshot do putaway incompatível')
  }
  return candidate as WarehousePutawaySnapshot
}

function rackAddress(sequence: number): string {
  const bay = Math.floor(sequence / 4) + 1
  const level = (sequence % 4) + 1
  return `A-${String(bay).padStart(2, '0')}-${String(level).padStart(2, '0')}`
}

export class WarehousePutawayFlowSystem implements KernelSystem {
  readonly id = 'warehouse-putaway'

  private readonly units = new Map<string, PutawayUnit>()
  private readonly tpIn: PutawayResource = {
    id: 'TP-IN',
    kind: 'electric-pallet-truck',
    status: 'available',
    palletId: null,
    completeAtTick: null,
  }
  private readonly reach: PutawayResource = {
    id: 'REACH-PUT',
    kind: 'reach-truck',
    status: 'available',
    palletId: null,
    completeAtTick: null,
  }

  private readonly bufferCapacity: number
  private readonly tpInTravelTicks: number
  private readonly reachTravelTicks: number
  private readonly historyCapacity: number
  private unitSequence = 0
  private rackSequence = 0
  private storedTotal = 0
  private bufferBlocked = false

  constructor(
    private readonly readReceivingOperations: () => ReceivingOperationsTelemetry,
    options: WarehousePutawayFlowOptions = {},
  ) {
    this.bufferCapacity = options.bufferCapacity ?? DEFAULT_BUFFER_CAPACITY
    this.tpInTravelTicks =
      options.tpInTravelTicks ?? DEFAULT_TP_IN_TRAVEL_TICKS
    this.reachTravelTicks =
      options.reachTravelTicks ?? DEFAULT_REACH_TRAVEL_TICKS
    this.historyCapacity = options.historyCapacity ?? DEFAULT_HISTORY_CAPACITY

    assertPositiveInteger(this.bufferCapacity, 'bufferCapacity')
    assertPositiveInteger(this.tpInTravelTicks, 'tpInTravelTicks')
    assertPositiveInteger(this.reachTravelTicks, 'reachTravelTicks')
    assertPositiveInteger(this.historyCapacity, 'historyCapacity')
  }

  step(context: KernelStepContext): void {
    this.createMissingUnits(context)
    this.completeTpInIfDue(context)
    this.completeReachIfDue(context)
    this.assignReach(context)
    this.assignTpIn(context)
    this.trimHistory()
  }

  handleCommand(command: KernelCommand, context: KernelStepContext): void {
    if (command.type !== 'receiving.reset') return
    this.units.clear()
    this.unitSequence = 0
    this.rackSequence = 0
    this.storedTotal = 0
    this.bufferBlocked = false
    this.resetResource(this.tpIn)
    this.resetResource(this.reach)
    context.emit({ type: 'warehouse.putaway.reset' })
  }

  telemetry(): WarehousePutawayTelemetry {
    const units = [...this.units.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneUnit)

    return {
      units,
      waitingTransfer: units.filter((unit) => unit.status === 'waiting-tp-in')
        .length,
      movingToBuffer: units.filter((unit) => unit.status === 'moving-to-buffer')
        .length,
      buffered: units.filter((unit) => unit.status === 'buffered').length,
      movingToRack: units.filter((unit) => unit.status === 'moving-to-rack')
        .length,
      storedTotal: this.storedTotal,
      bufferOccupancy: units.filter(
        (unit) =>
          unit.bufferSlot !== null &&
          unit.status !== 'stored',
      ).length,
      bufferCapacity: this.bufferCapacity,
      tpIn: cloneResource(this.tpIn),
      reach: cloneResource(this.reach),
    }
  }

  snapshot(): WarehousePutawaySnapshot {
    return {
      version: 1,
      unitSequence: this.unitSequence,
      rackSequence: this.rackSequence,
      storedTotal: this.storedTotal,
      bufferBlocked: this.bufferBlocked,
      units: [...this.units.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map(cloneUnit),
      tpIn: cloneResource(this.tpIn),
      reach: cloneResource(this.reach),
    }
  }

  restore(value: unknown): void {
    const snapshot = assertSnapshot(value)
    this.unitSequence = snapshot.unitSequence
    this.rackSequence = snapshot.rackSequence
    this.storedTotal = snapshot.storedTotal
    this.bufferBlocked = snapshot.bufferBlocked
    this.units.clear()
    for (const unit of snapshot.units) {
      this.units.set(unit.palletId, cloneUnit(unit))
    }
    Object.assign(this.tpIn, cloneResource(snapshot.tpIn))
    Object.assign(this.reach, cloneResource(snapshot.reach))
  }

  private createMissingUnits(context: KernelStepContext): void {
    const completedTasks = this.readReceivingOperations()
      .tasks.filter(
        (task) =>
          task.status === 'completed' &&
          task.destinationSlot !== null &&
          !this.units.has(task.palletId),
      )
      .sort((left, right) => left.sequence - right.sequence)

    for (const task of completedTasks) {
      this.unitSequence += 1
      const unit: PutawayUnit = {
        id: `putaway-${String(this.unitSequence).padStart(6, '0')}`,
        sequence: this.unitSequence,
        palletId: task.palletId,
        unloadTaskId: task.id,
        stagingSlot: task.destinationSlot as number,
        bufferSlot: null,
        rackAddress: null,
        status: 'waiting-tp-in',
        createdTick: context.tick,
        updatedTick: context.tick,
        storedTick: null,
      }
      this.units.set(unit.palletId, unit)
      context.emit({
        type: 'putaway.task.created',
        payload: {
          putawayId: unit.id,
          palletId: unit.palletId,
          stagingSlot: unit.stagingSlot,
        },
      })
    }
  }

  private assignTpIn(context: KernelStepContext): void {
    if (this.tpIn.status !== 'available') return

    const next = [...this.units.values()]
      .filter((unit) => unit.status === 'waiting-tp-in')
      .sort((left, right) => left.sequence - right.sequence)[0]
    if (!next) {
      this.bufferBlocked = false
      return
    }

    const bufferSlot = this.firstAvailableBufferSlot()
    if (bufferSlot === null) {
      if (!this.bufferBlocked) {
        this.bufferBlocked = true
        context.emit({
          type: 'putaway.buffer.blocked',
          payload: {
            capacity: this.bufferCapacity,
            waitingPalletId: next.palletId,
          },
        })
      }
      return
    }

    if (this.bufferBlocked) {
      this.bufferBlocked = false
      context.emit({ type: 'putaway.buffer.released' })
    }

    next.bufferSlot = bufferSlot
    next.status = 'moving-to-buffer'
    next.updatedTick = context.tick
    this.tpIn.status = 'busy'
    this.tpIn.palletId = next.palletId
    this.tpIn.completeAtTick = context.tick + this.tpInTravelTicks

    context.emit({
      type: 'tp-in.task.started',
      payload: {
        palletId: next.palletId,
        stagingSlot: next.stagingSlot,
        bufferSlot,
        completeAtTick: this.tpIn.completeAtTick,
      },
    })
  }

  private completeTpInIfDue(context: KernelStepContext): void {
    if (
      this.tpIn.status !== 'busy' ||
      this.tpIn.completeAtTick === null ||
      context.tick < this.tpIn.completeAtTick
    ) {
      return
    }

    const palletId = this.tpIn.palletId
    const unit = palletId ? this.units.get(palletId) : undefined
    if (!unit) throw new Error('TP-IN concluiu movimento sem unidade válida')

    unit.status = 'buffered'
    unit.updatedTick = context.tick
    context.emit({
      type: 'tp-in.task.completed',
      payload: {
        palletId: unit.palletId,
        bufferSlot: unit.bufferSlot,
      },
    })
    this.resetResource(this.tpIn)
  }

  private assignReach(context: KernelStepContext): void {
    if (this.reach.status !== 'available') return

    const next = [...this.units.values()]
      .filter((unit) => unit.status === 'buffered')
      .sort((left, right) => left.sequence - right.sequence)[0]
    if (!next) return

    next.rackAddress = rackAddress(this.rackSequence)
    this.rackSequence += 1
    next.status = 'moving-to-rack'
    next.updatedTick = context.tick
    this.reach.status = 'busy'
    this.reach.palletId = next.palletId
    this.reach.completeAtTick = context.tick + this.reachTravelTicks

    context.emit({
      type: 'reach-put.task.started',
      payload: {
        palletId: next.palletId,
        bufferSlot: next.bufferSlot,
        rackAddress: next.rackAddress,
        completeAtTick: this.reach.completeAtTick,
      },
    })
  }

  private completeReachIfDue(context: KernelStepContext): void {
    if (
      this.reach.status !== 'busy' ||
      this.reach.completeAtTick === null ||
      context.tick < this.reach.completeAtTick
    ) {
      return
    }

    const palletId = this.reach.palletId
    const unit = palletId ? this.units.get(palletId) : undefined
    if (!unit) throw new Error('retrátil concluiu movimento sem unidade válida')

    unit.status = 'stored'
    unit.updatedTick = context.tick
    unit.storedTick = context.tick
    this.storedTotal += 1
    context.emit({
      type: 'putaway.completed',
      payload: {
        palletId: unit.palletId,
        rackAddress: unit.rackAddress,
        cycleTicks: context.tick - unit.createdTick,
      },
    })
    this.resetResource(this.reach)
  }

  private firstAvailableBufferSlot(): number | null {
    const occupied = new Set(
      [...this.units.values()]
        .filter(
          (unit) =>
            unit.bufferSlot !== null &&
            unit.status !== 'stored',
        )
        .map((unit) => unit.bufferSlot as number),
    )
    for (let slot = 0; slot < this.bufferCapacity; slot += 1) {
      if (!occupied.has(slot)) return slot
    }
    return null
  }

  private resetResource(resource: PutawayResource): void {
    resource.status = 'available'
    resource.palletId = null
    resource.completeAtTick = null
  }

  private trimHistory(): void {
    const stored = [...this.units.values()]
      .filter((unit) => unit.status === 'stored')
      .sort((left, right) => left.sequence - right.sequence)
    const overflow = stored.length - this.historyCapacity
    if (overflow <= 0) return
    for (const unit of stored.slice(0, overflow)) {
      this.units.delete(unit.palletId)
    }
  }
}
