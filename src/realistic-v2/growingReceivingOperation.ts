import './receivingPathRefinement'
import {
  RECEIVING_V2,
  ReceivingSimulation,
  type Point2,
  type ReceivingPallet,
  type ReceivingSimulationState,
} from './receivingSimulation'

export const GROWING_STAGING = {
  columnsPerRow: 4,
  columnXs: [12, 17, 22, 27] as const,
  firstRowZ: -46,
  rowSpacing: 4.4,
  rowsPerBank: 10,
  bankSpacingX: 22,
  maximumBanks: 2,
  approachZ: -1.5,
  forkliftLaneCenterX: 0,
  forkliftLaneWidth: 7,
  futureTranspalletLaneCenterX: 6.2,
  futureTranspalletLaneWidth: 4.8,
  futureTranspalletEntryZ: -56,
} as const

export const EMPTY_WAREHOUSE_V3 = {
  partitionZ: -56,
  backWallZ: -116,
  rackStartZ: -66,
  rackEndZ: -106,
  rackRowXs: [-36, -24, -12, 0, 12, 24] as const,
  aisleNames: ['RUA A', 'RUA B', 'RUA C', 'RUA D', 'RUA E'] as const,
  transpalletDoorX: 6.2,
  transpalletDoorWidth: 6,
  pedestrianDoorX: -45,
  pedestrianDoorWidth: 2.2,
} as const

const TOTAL_DYNAMIC_SLOTS =
  GROWING_STAGING.columnsPerRow *
  GROWING_STAGING.rowsPerBank *
  GROWING_STAGING.maximumBanks

export function growingStagingPoint(index: number): Point2 {
  if (!Number.isInteger(index) || index < 0 || index >= TOTAL_DYNAMIC_SLOTS) {
    throw new Error(`Posição dinâmica de staging inexistente: ${index}`)
  }

  const slotsPerBank =
    GROWING_STAGING.columnsPerRow * GROWING_STAGING.rowsPerBank
  const bank = Math.floor(index / slotsPerBank)
  const localIndex = index % slotsPerBank
  const row = Math.floor(localIndex / GROWING_STAGING.columnsPerRow)
  const column = localIndex % GROWING_STAGING.columnsPerRow

  return {
    x:
      GROWING_STAGING.columnXs[column] +
      bank * GROWING_STAGING.bankSpacingX,
    z: GROWING_STAGING.firstRowZ + row * GROWING_STAGING.rowSpacing,
  }
}

Object.defineProperties(RECEIVING_V2, {
  floorWidth: { configurable: true, enumerable: true, value: 112 },
  floorDepth: { configurable: true, enumerable: true, value: 280 },
  stagingApproachZ: {
    configurable: true,
    enumerable: true,
    value: GROWING_STAGING.approachZ,
  },
  forwardSpeed: { configurable: true, enumerable: true, value: 4.45 },
  loadedSpeed: { configurable: true, enumerable: true, value: 3.35 },
  reverseSpeed: { configurable: true, enumerable: true, value: 3.05 },
  angularSpeed: { configurable: true, enumerable: true, value: 2.35 },
  acceleration: { configurable: true, enumerable: true, value: 5.1 },
  braking: { configurable: true, enumerable: true, value: 7.2 },
  truckSpeed: { configurable: true, enumerable: true, value: 18 },
})

let resolvingBatchCoordinates = false
let batchSlotOffset = 0
let activeResolvedStageIndex = 0
const stageXs = RECEIVING_V2.stageXs as unknown as number[]

for (let index = 0; index < TOTAL_DYNAMIC_SLOTS; index += 1) {
  Object.defineProperty(stageXs, index, {
    configurable: true,
    enumerable: true,
    get() {
      const resolvedIndex =
        resolvingBatchCoordinates && index < 6
          ? batchSlotOffset + index
          : index
      activeResolvedStageIndex = resolvedIndex
      return growingStagingPoint(resolvedIndex).x
    },
  })
}

Object.defineProperty(RECEIVING_V2, 'stagingZ', {
  configurable: true,
  enumerable: true,
  get() {
    return growingStagingPoint(activeResolvedStageIndex).z
  },
})

interface InternalAction {
  kind: string
  label?: string
  stageIndex?: number
  control1?: Point2
  control2?: Point2
  [key: string]: unknown
}

interface InternalReceivingSimulation {
  state: ReceivingSimulationState
  queue: InternalAction[]
}

interface InternalPrototype {
  enqueueBatchActions(this: InternalReceivingSimulation): void
  processImmediate(
    this: InternalReceivingSimulation,
    action: InternalAction,
  ): boolean
  beginAction(this: InternalReceivingSimulation, action: InternalAction): void
}

const prototype = ReceivingSimulation.prototype as unknown as InternalPrototype
const originalEnqueueBatchActions = prototype.enqueueBatchActions
const originalProcessImmediate = prototype.processImmediate
const originalBeginAction = prototype.beginAction

prototype.enqueueBatchActions = function enqueueGrowingBatch(): void {
  batchSlotOffset = this.state.pallets.filter(
    (pallet) => pallet.phase === 'staged',
  ).length

  if (batchSlotOffset + 6 > TOTAL_DYNAMIC_SLOTS) {
    this.state.fault = 'capacidade temporária do staging atingida'
    this.state.forklift.phase = 'fault'
    this.state.forklift.speed = 0
    this.state.label =
      'STAGING TEMPORARIAMENTE CHEIO · AGUARDANDO FUTURA TRANSPALETEIRA'
    this.state.revision += 1
    return
  }

  const queueStart = this.queue.length
  resolvingBatchCoordinates = true
  try {
    originalEnqueueBatchActions.call(this)
  } finally {
    resolvingBatchCoordinates = false
  }

  for (let index = queueStart; index < this.queue.length; index += 1) {
    const action = this.queue[index]
    if (action.kind === 'detach' && typeof action.stageIndex === 'number') {
      action.stageIndex += batchSlotOffset
    }
  }
}

prototype.processImmediate = function processGrowingImmediate(
  action: InternalAction,
): boolean {
  if (action.kind !== 'reset-batch') {
    return originalProcessImmediate.call(this, action)
  }

  const stagedPallets = this.state.pallets
    .filter((pallet) => pallet.phase === 'staged')
    .map((pallet): ReceivingPallet => ({ ...pallet }))

  const processed = originalProcessImmediate.call(this, action)
  const incomingPallets = this.state.pallets.map(
    (pallet): ReceivingPallet => ({ ...pallet }),
  )

  this.state.pallets = [...incomingPallets, ...stagedPallets]
  this.state.revision += 1
  return processed
}

prototype.beginAction = function beginGrowingAction(
  action: InternalAction,
): void {
  const isReturnHome =
    action.kind === 'move-curve' &&
    action.label?.includes('RX20 RETORNANDO À VAGA')

  const refined = isReturnHome
    ? {
        ...action,
        control1: {
          x: this.state.forklift.position.x,
          z: 6,
        },
        control2: {
          x: -22,
          z: 4,
        },
      }
    : action

  originalBeginAction.call(this, refined)
}
