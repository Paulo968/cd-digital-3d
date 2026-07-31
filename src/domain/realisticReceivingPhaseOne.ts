import type { WarehouseLayout } from './layout'
import type { WorldPoint } from './routePlanning'

export const RECEIVING_PALLETS_PER_TRUCK = 6

export type ReceivingForkliftPhase =
  | 'waiting-truck'
  | 'go-to-lane'
  | 'align-at-mouth'
  | 'enter-trailer'
  | 'pick-pallet'
  | 'reverse-out'
  | 'clear-trailer'
  | 'turn-to-staging'
  | 'go-to-staging'
  | 'drop-pallet'
  | 'reverse-from-staging'
  | 'return-home'

export interface ReceivingCellGeometry {
  dockX: number
  mouthZ: number
  truckCenter: WorldPoint
  truckSpawn: WorldPoint
  forkliftHome: WorldPoint
  clearPoint: WorldPoint
  truckPallets: WorldPoint[]
  stagingSlots: WorldPoint[]
}

function point(x: number, z: number, y = 0.2): WorldPoint {
  return { x, y, z }
}

/**
 * A célula fica na frente do recebimento e usa coordenadas próprias. O caminhão
 * permanece fora do piso principal; apenas a boca da carroceria encosta na doca.
 * A área entre a boca e os slots é mantida livre para a RX sair de ré antes de
 * iniciar qualquer giro.
 */
export function buildReceivingCellGeometry(
  layout: WarehouseLayout,
): ReceivingCellGeometry {
  const receiving = layout.zones.find((zone) => zone.type === 'receiving')
  const dockX = receiving?.origin.x ?? -layout.floor.width * 0.28
  const mouthZ = layout.floor.depth / 2 - 3.8
  const truckCenter = point(dockX, mouthZ + 6.2)
  const truckSpawn = point(dockX, mouthZ + 24)
  const forkliftHome = point(dockX - 8.5, mouthZ - 8.5)
  const clearPoint = point(dockX, mouthZ - 5.4)

  const truckPallets = [2.25, 4.85, 7.45].flatMap((depth) => [
    point(dockX - 1.05, mouthZ + depth, 0.62),
    point(dockX + 1.05, mouthZ + depth, 0.62),
  ])

  const stagingSlots = [-4.2, 0, 4.2].flatMap((offsetX) => [
    point(dockX + offsetX, mouthZ - 12.5, 0.25),
    point(dockX + offsetX, mouthZ - 16, 0.25),
  ])

  return {
    dockX,
    mouthZ,
    truckCenter,
    truckSpawn,
    forkliftHome,
    clearPoint,
    truckPallets,
    stagingSlots,
  }
}

export function receivingCellHasSafeSpacing(
  geometry: ReceivingCellGeometry,
): boolean {
  const minimumSlotSpacing = geometry.stagingSlots.every((slot, index) =>
    geometry.stagingSlots.slice(index + 1).every(
      (other) => Math.hypot(slot.x - other.x, slot.z - other.z) >= 3.4,
    ),
  )
  const clearDistance = Math.hypot(
    geometry.clearPoint.x - geometry.truckCenter.x,
    geometry.clearPoint.z - geometry.truckCenter.z,
  )
  const stagingBehindClear = geometry.stagingSlots.every(
    (slot) => slot.z < geometry.clearPoint.z - 4,
  )
  return minimumSlotSpacing && clearDistance >= 10 && stagingBehindClear
}
