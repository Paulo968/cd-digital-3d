import { createReceivingKernelRuntime } from '../realistic/receiving/receivingKernelRuntime'
import {
  RECEIVING_V2,
  type Point2,
  type ReceivingScenarioConfig,
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

export const TOTAL_DYNAMIC_STAGING_SLOTS =
  GROWING_STAGING.columnsPerRow *
  GROWING_STAGING.rowsPerBank *
  GROWING_STAGING.maximumBanks

export function growingStagingPoint(index: number): Point2 {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= TOTAL_DYNAMIC_STAGING_SLOTS
  ) {
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

/**
 * Cenário explícito do recebimento crescente.
 *
 * A geometria e a dinâmica ficam na configuração. O avanço temporal, os
 * comandos, os eventos e os snapshots são responsabilidade do kernel vivo.
 */
export const GROWING_RECEIVING_CONFIG: ReceivingScenarioConfig = {
  ...RECEIVING_V2,
  id: 'receiving-growing-v4',
  palletIdPrefix: 'REC-V4',
  floorWidth: 112,
  floorDepth: 280,
  stagingApproachZ: GROWING_STAGING.approachZ,
  stagingZ: GROWING_STAGING.firstRowZ,
  stageXs: GROWING_STAGING.columnXs,
  stagingCapacity: TOTAL_DYNAMIC_STAGING_SLOTS,
  preserveStagedPallets: true,
  forwardSpeed: 4.45,
  loadedSpeed: 3.35,
  reverseSpeed: 3.05,
  angularSpeed: 2.35,
  acceleration: 5.1,
  braking: 7.2,
  truckSpeed: 18,
  resolveStagingPoint: growingStagingPoint,
  resolveDockApproachControl: (current) => ({
    x: current.x,
    z: Math.max(current.z + 10, 1),
  }),
  resolveReturnHomeCurve: (current) => ({
    control1: {
      x: current.x,
      z: 6,
    },
    control2: {
      x: -22,
      z: 4,
    },
  }),
}

export function createGrowingReceivingSimulation() {
  return createReceivingKernelRuntime(GROWING_RECEIVING_CONFIG)
}
