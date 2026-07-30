import type { WarehouseLayout } from './layout'
import type { OperationZone } from './operationsControl'
import { palletQuantity, productForPallet } from './operationsControl'
import { vehicleCoversMission } from './industrialFlow'
import type {
  FleetMission,
  FleetMissionRole,
  FleetVehicleDefinition,
} from './realisticFleet'
import { buildTrafficCells, trafficCellsConflict } from './realisticFleet'
import { buildTravelPath, type WorldPoint } from './routePlanning'
import {
  assignOperationMission,
  operationVehicleIsAvailable,
  recordOperationMission,
  registerOperationVehicle,
  useOperationsControlStore,
} from '../store/operationsControlStore'

export type FleetLanePreference = 'left' | 'right'

export interface DispatchContext {
  vehicle: FleetVehicleDefinition
  vehiclePoint: WorldPoint
  availableMissions: FleetMission[]
  activeMissions: FleetMission[]
  reservedMissionIds: Set<string>
  reservedDestinationIds: Set<string>
}

interface ScoredMission {
  mission: FleetMission
  score: number
  emptyTravel: number
  congestion: number
  rolePenalty: number
}

const ROLE_LABEL: Record<FleetMissionRole, string> = {
  'inbound-transfer': 'recebimento e distribuição interna',
  putaway: 'armazenagem da rua',
  replenishment: 'movimentação interna e pré-embarque',
  shipping: 'carregamento do caminhão',
}

function distance(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

export function vehicleLanePreference(vehicleId: string): FleetLanePreference {
  const numericSuffix = Number(vehicleId.match(/(\d+)$/)?.[1] ?? 1)
  if (Number.isFinite(numericSuffix) && vehicleId.match(/\d+$/)) {
    return numericSuffix % 2 === 0 ? 'right' : 'left'
  }
  const hash = [...vehicleId].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
  return hash % 2 === 0 ? 'right' : 'left'
}

function criticalCells(mission: FleetMission): Set<string> {
  if (mission.trafficCells.length <= 6) return new Set(mission.trafficCells)
  return new Set([
    ...mission.trafficCells.slice(0, 3),
    ...mission.trafficCells.slice(-3),
  ])
}

function overlapCount(left: Iterable<string>, right: Set<string>): number {
  let count = 0
  for (const cell of left) {
    if (right.has(cell)) count += 1
  }
  return count
}

function decisionReason(
  vehicle: FleetVehicleDefinition,
  selected: ScoredMission,
): string {
  const lane = vehicleLanePreference(vehicle.id) === 'left' ? 'esquerda' : 'direita'
  const congestionText =
    selected.congestion === 0
      ? 'rota sem conflito relevante'
      : `${selected.congestion} células compartilhadas fora dos pontos críticos`
  return `${vehicle.label}: autorizado para ${ROLE_LABEL[selected.mission.role]}, ${selected.emptyTravel.toFixed(
    1,
  )} m até a origem, cabeceira ${lane} e ${congestionText}.`
}

function sourceZone(mission: FleetMission): OperationZone {
  const normalized = `${mission.source.id} ${mission.source.label}`.toLocaleLowerCase(
    'pt-BR',
  )
  if (
    normalized.includes('receiving:') ||
    normalized.includes('inbound-truck:') ||
    normalized.includes('recebimento') ||
    normalized.includes('descarga')
  ) {
    return 'receiving'
  }
  if (
    normalized.includes('staging:') ||
    normalized.includes('aisle-buffer:') ||
    normalized.includes('shipping-buffer:') ||
    normalized.includes('buffer') ||
    normalized.includes('pré-embarque') ||
    normalized.includes('espera')
  ) {
    return 'staging'
  }
  if (normalized.includes('truck:') || normalized.includes('caminhão')) {
    return 'truck'
  }
  if (normalized.includes('picking')) return 'picking'
  if (normalized.includes('address:') || normalized.includes('reserva')) {
    return 'reserve'
  }
  return 'transit'
}

function registerObservedPallet(mission: FleetMission, at = Date.now()): void {
  const operation = useOperationsControlStore.getState()
  if (operation.pallets[mission.palletId]) return
  const product = productForPallet(mission.palletId)
  const quantity = palletQuantity(mission.palletId)
  const zone = sourceZone(mission)

  useOperationsControlStore.setState((state) => {
    if (state.pallets[mission.palletId]) return state
    const pallets = {
      ...state.pallets,
      [mission.palletId]: {
        id: mission.palletId,
        sku: product.sku,
        description: product.description,
        units: quantity.units,
        capacity: quantity.capacity,
        reorderPoint: quantity.reorderPoint,
        zone,
        stopId: mission.source.id,
        receivedAt: at,
        updatedAt: at,
      },
    }
    return {
      pallets,
      metrics: {
        ...state.metrics,
        reserveUnits:
          state.metrics.reserveUnits + (zone === 'reserve' ? quantity.units : 0),
        pickingUnits:
          state.metrics.pickingUnits + (zone === 'picking' ? quantity.units : 0),
        truckUnits:
          state.metrics.truckUnits + (zone === 'truck' ? quantity.units : 0),
      },
    }
  })
}

export function chooseBrainMissionForVehicle(
  context: DispatchContext,
): FleetMission | undefined {
  registerOperationVehicle({
    id: context.vehicle.id,
    label: context.vehicle.label,
    kind: context.vehicle.kind,
  })
  if (!operationVehicleIsAvailable(context.vehicle.id)) return undefined

  const truckDocked = useOperationsControlStore.getState().truck.phase === 'docked'
  const activeTraffic = new Set(
    context.activeMissions.flatMap((mission) => mission.trafficCells),
  )
  const activeCritical = new Set(
    context.activeMissions.flatMap((mission) => [...criticalCells(mission)]),
  )

  const selected = context.availableMissions
    .filter(
      (mission) =>
        !context.reservedMissionIds.has(mission.id) &&
        !context.reservedDestinationIds.has(mission.destination.id) &&
        mission.eligibleKinds.includes(context.vehicle.kind) &&
        context.vehicle.roles.includes(mission.role) &&
        vehicleCoversMission(context.vehicle.id, mission) &&
        (mission.role !== 'shipping' || truckDocked) &&
        !trafficCellsConflict(criticalCells(mission), activeCritical),
    )
    .map((mission): ScoredMission => {
      const emptyTravel = distance(context.vehiclePoint, mission.source.access)
      const congestion = overlapCount(mission.trafficCells, activeTraffic)
      const rolePenalty = context.vehicle.roles.indexOf(mission.role) * 4
      const score =
        mission.priority * 10_000 +
        emptyTravel * 12 +
        congestion * 45 +
        rolePenalty +
        mission.sequence * 0.001
      return { mission, score, emptyTravel, congestion, rolePenalty }
    })
    .sort((left, right) => left.score - right.score)[0]

  if (!selected) return undefined

  registerObservedPallet(selected.mission)
  recordOperationMission({
    id: selected.mission.id,
    palletId: selected.mission.palletId,
    role: selected.mission.role,
    sourceId: selected.mission.source.id,
    sourceLabel: selected.mission.source.label,
    destinationId: selected.mission.destination.id,
    destinationLabel: selected.mission.destination.label,
  })
  assignOperationMission(
    {
      id: context.vehicle.id,
      label: context.vehicle.label,
      kind: context.vehicle.kind,
    },
    selected.mission.id,
    decisionReason(context.vehicle, selected),
  )
  return selected.mission
}

function pathDistance(points: WorldPoint[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index]
    return total + distance(previous, point)
  }, 0)
}

function candidatePath(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
  lane: FleetLanePreference | 'auto',
): WorldPoint[] | undefined {
  try {
    if (lane === 'left') {
      return buildTravelPath(layout, from, to, { left: false, right: true })
    }
    if (lane === 'right') {
      return buildTravelPath(layout, from, to, { left: true, right: false })
    }
    return buildTravelPath(layout, from, to, { left: false, right: false })
  } catch {
    return undefined
  }
}

export function buildAdaptiveFleetPath(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
  vehicleId: string,
  occupiedTrafficCells: Set<string> = new Set(),
): WorldPoint[] {
  const preference = vehicleLanePreference(vehicleId)
  const alternatives: Array<FleetLanePreference | 'auto'> = [
    preference,
    preference === 'left' ? 'right' : 'left',
    'auto',
  ]
  const seen = new Set<string>()

  const selected = alternatives
    .map((lane, index) => {
      const points = candidatePath(layout, from, to, lane)
      if (!points) return undefined
      const key = points
        .map((point) => `${point.x.toFixed(2)}:${point.z.toFixed(2)}`)
        .join('|')
      if (seen.has(key)) return undefined
      seen.add(key)
      const cells = buildTrafficCells(points)
      const congestion = overlapCount(cells, occupiedTrafficCells)
      return {
        points,
        score: pathDistance(points) + congestion * 35 + index * 3,
      }
    })
    .filter(
      (candidate): candidate is { points: WorldPoint[]; score: number } =>
        Boolean(candidate),
    )
    .sort((left, right) => left.score - right.score)[0]

  return selected?.points ?? [from, to]
}
