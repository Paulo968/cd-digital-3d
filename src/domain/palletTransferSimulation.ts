import type { WarehouseLayout } from './layout'
import {
  buildTravelPath,
  getLocationAccessPoint,
  getZoneWorldPoint,
  polylineDistance,
  type WorldPoint,
} from './routePlanning'
import { getForkCarriageHeight } from './warehouseGeometry'
import type { WarehouseLocation } from './warehouse'

/**
 * Plano exclusivamente visual para o laboratório 3D.
 * Não envia comandos a máquinas, motores, sensores ou equipamentos físicos.
 */
export interface PalletTransferSimulation {
  id: string
  sourceAddress: string
  destinationAddress: string
  handlingUnitCode?: string
  sku: string
  description?: string
  lot?: string
  expirationDate?: string
  quantity: number
  emptyPoints: WorldPoint[]
  loadedPoints: WorldPoint[]
  emptyDistance: number
  loadedDistance: number
  totalDistance: number
  sourceForkHeight: number
  destinationForkHeight: number
  sourceFacing: number
  destinationFacing: number
  createdAt: string
}

function facingForLocation(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): number {
  const row =
    layout.rackRows.find((item) => item.id === location.rackRowId) ??
    layout.rackRows.find((item) => item.aisle === location.aisle)

  if (!row) return 0
  return row.rotationY + (location.side === 'left' ? 0 : Math.PI)
}

export function buildPalletTransferSimulation(
  layout: WarehouseLayout,
  source: WarehouseLocation,
  destination: WarehouseLocation,
  blocked: { left: boolean; right: boolean },
  vehicleStart: WorldPoint = getZoneWorldPoint(layout, 'shipping'),
): PalletTransferSimulation {
  if (source.address === destination.address) {
    throw new Error('Origem e destino precisam ser diferentes.')
  }
  if (source.status === 'blocked' || destination.status === 'blocked') {
    throw new Error('A simulação não pode usar uma posição bloqueada.')
  }
  if (source.status !== 'occupied' || !source.sku || source.quantity <= 0) {
    throw new Error('A origem precisa ter um pallet ou unidade logística identificada.')
  }
  if (destination.quantity > 0 || destination.status !== 'empty') {
    throw new Error('A primeira versão exige um endereço de destino vazio.')
  }
  if (source.quantity > destination.capacity) {
    throw new Error(
      `O pallet possui ${source.quantity} unidades, acima da capacidade ${destination.capacity} do destino.`,
    )
  }

  const sourceAccess = getLocationAccessPoint(layout, source)
  const destinationAccess = getLocationAccessPoint(layout, destination)
  const emptyPoints = buildTravelPath(layout, vehicleStart, sourceAccess, blocked)
  const loadedPoints = buildTravelPath(
    layout,
    sourceAccess,
    destinationAccess,
    blocked,
  )
  const emptyDistance = polylineDistance(emptyPoints)
  const loadedDistance = polylineDistance(loadedPoints)

  return {
    id: `SIM-TRN-${Date.now()}`,
    sourceAddress: source.address,
    destinationAddress: destination.address,
    handlingUnitCode: source.handlingUnitCode,
    sku: source.sku,
    description: source.description,
    lot: source.lot,
    expirationDate: source.expirationDate,
    quantity: source.quantity,
    emptyPoints,
    loadedPoints,
    emptyDistance: Number(emptyDistance.toFixed(2)),
    loadedDistance: Number(loadedDistance.toFixed(2)),
    totalDistance: Number((emptyDistance + loadedDistance).toFixed(2)),
    sourceForkHeight: getForkCarriageHeight(layout, source),
    destinationForkHeight: getForkCarriageHeight(layout, destination),
    sourceFacing: facingForLocation(layout, source),
    destinationFacing: facingForLocation(layout, destination),
    createdAt: new Date().toISOString(),
  }
}
