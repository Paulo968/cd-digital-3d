import type { WarehouseLayout } from './layout'
import type {
  FleetMission,
  FleetVehicleDefinition,
} from './realisticFleet'
import { buildTrafficCells, trafficCellsConflict } from './realisticFleet'
import { buildTravelPath, type WorldPoint } from './routePlanning'
import {
  assignOperationMission,
  operationVehicleIsAvailable,
  recordOperationMission,
  registerOperationVehicle,
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

function distance(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

export function vehicleLanePreference(vehicleId: string): FleetLanePreference {
  const numericSuffix = Number(vehicleId.match(/(\d+)$/)?.[1] ?? 1)
  return numericSuffix % 2 === 0 ? 'right' : 'left'
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
  return `${vehicle.label}: compatível com ${selected.mission.role}, ${selected.emptyTravel.toFixed(
    1,
  )} m até a origem, preferência pela cabeceira ${lane} e ${congestionText}.`
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
