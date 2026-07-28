import type { WarehouseLayout, WarehouseZoneType } from './layout'
import type { WarehouseLocation } from './warehouse'

export interface WorldPoint {
  x: number
  y: number
  z: number
}

export interface RoutePlan {
  mode: 'reference' | 'optimized'
  addresses: string[]
  points: WorldPoint[]
  distance: number
  baselineDistance: number
  savedDistance: number
  savedPercent: number
  createdAt: string
}

function rotatePoint(
  x: number,
  z: number,
  angle: number,
): { x: number; z: number } {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: x * cosine - z * sine,
    z: x * sine + z * cosine,
  }
}

export function getLocationWorldPoint(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): WorldPoint {
  const row =
    layout.rackRows.find((item) => item.id === location.rackRowId) ??
    layout.rackRows.find((item) => item.aisle === location.aisle)

  if (!row) return { x: 0, y: 0.8, z: 0 }

  const rackLength = row.baysPerSide * row.bayWidth
  const localX = (location.bay - 0.5) * row.bayWidth - rackLength / 2
  const sideDirection = location.side === 'left' ? -1 : 1
  const localZ = sideDirection * (row.aisleWidth / 2 + row.rackDepth / 2)
  const rotated = rotatePoint(localX, localZ, row.rotationY)

  return {
    x: row.origin.x + rotated.x,
    y: (location.level - 0.5) * row.levelHeight + 0.25,
    z: row.origin.z + rotated.z,
  }
}

export function getLocationAccessPoint(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): WorldPoint {
  const row =
    layout.rackRows.find((item) => item.id === location.rackRowId) ??
    layout.rackRows.find((item) => item.aisle === location.aisle)

  if (!row) return { x: 0, y: 0.2, z: 0 }

  const rackLength = row.baysPerSide * row.bayWidth
  const localX = (location.bay - 0.5) * row.bayWidth - rackLength / 2
  const rotated = rotatePoint(localX, 0, row.rotationY)

  return {
    x: row.origin.x + rotated.x,
    y: 0.2,
    z: row.origin.z + rotated.z,
  }
}

export function getZoneWorldPoint(
  layout: WarehouseLayout,
  type: WarehouseZoneType,
): WorldPoint {
  const zone = layout.zones.find((item) => item.type === type) ?? layout.zones[0]
  return zone
    ? { x: zone.origin.x, y: 0.2, z: zone.origin.z }
    : { x: 0, y: 0.2, z: layout.floor.depth / 2 - 3 }
}

function pointDistance(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function append(points: WorldPoint[], point: WorldPoint): void {
  const last = points.at(-1)
  if (!last || pointDistance(last, point) > 0.001) points.push(point)
}

function crossAisleX(
  layout: WarehouseLayout,
  side: 'left' | 'right',
): number {
  const activeRows = layout.rackRows.filter((row) => row.active)
  const maxHalf = Math.max(
    ...activeRows.map((row) => (row.baysPerSide * row.bayWidth) / 2),
    6,
  )
  return side === 'left' ? -maxHalf - 2.2 : maxHalf + 2.2
}

function connect(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
  blocked: { left: boolean; right: boolean },
): WorldPoint[] {
  if (Math.abs(from.z - to.z) < 0.15) return [from, to]

  const options: Array<WorldPoint[] | null> = (
    ['left', 'right'] as const
  ).map((side) => {
    if (blocked[side]) return null
    const x = crossAisleX(layout, side)
    return [from, { x, y: 0.2, z: from.z }, { x, y: 0.2, z: to.z }, to]
  })
  const valid = options.filter((value): value is WorldPoint[] => Boolean(value))

  if (valid.length === 0) {
    throw new Error(
      'As duas cabeceiras estão bloqueadas. Não existe rota disponível entre as ruas.',
    )
  }

  return valid.sort(
    (left, right) => polylineDistance(left) - polylineDistance(right),
  )[0]
}

export function buildTravelPath(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
  blocked: { left: boolean; right: boolean },
): WorldPoint[] {
  return connect(layout, from, to, blocked)
}

export function polylineDistance(points: WorldPoint[]): number {
  return points
    .slice(1)
    .reduce(
      (total, point, index) => total + pointDistance(points[index], point),
      0,
    )
}

function routeForOrder(
  layout: WarehouseLayout,
  start: WorldPoint,
  locations: WarehouseLocation[],
  blocked: { left: boolean; right: boolean },
): { points: WorldPoint[]; distance: number } {
  const points: WorldPoint[] = [start]
  let current = start

  locations.forEach((location) => {
    const target = getLocationAccessPoint(layout, location)
    const segment = connect(layout, current, target, blocked)
    segment.slice(1).forEach((point) => append(points, point))
    current = target
  })

  const home = connect(layout, current, start, blocked)
  home.slice(1).forEach((point) => append(points, point))
  return { points, distance: polylineDistance(points) }
}

export function optimizeTaskOrder(
  layout: WarehouseLayout,
  start: WorldPoint,
  locations: WarehouseLocation[],
  blocked: { left: boolean; right: boolean },
): WarehouseLocation[] {
  const remaining = [...locations]
  const ordered: WarehouseLocation[] = []
  let current = start

  while (remaining.length) {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    remaining.forEach((location, index) => {
      const target = getLocationAccessPoint(layout, location)
      const route = connect(layout, current, target, blocked)
      const distance = polylineDistance(route)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })

    const [next] = remaining.splice(bestIndex, 1)
    ordered.push(next)
    current = getLocationAccessPoint(layout, next)
  }

  return ordered
}

export function buildRoutePlan(
  layout: WarehouseLayout,
  taskAddresses: string[],
  allLocations: WarehouseLocation[],
  mode: 'reference' | 'optimized',
  blocked: { left: boolean; right: boolean },
): RoutePlan {
  const taskLocations = taskAddresses
    .map((address) =>
      allLocations.find((location) => location.address === address),
    )
    .filter((value): value is WarehouseLocation => Boolean(value))

  if (taskLocations.length === 0) {
    throw new Error('Adicione ao menos uma posição para executar a simulação.')
  }

  const start = getZoneWorldPoint(layout, 'shipping')
  const reference = routeForOrder(layout, start, taskLocations, blocked)
  const ordered =
    mode === 'optimized'
      ? optimizeTaskOrder(layout, start, taskLocations, blocked)
      : taskLocations
  const chosen =
    mode === 'optimized'
      ? routeForOrder(layout, start, ordered, blocked)
      : reference
  const savedDistance = Math.max(0, reference.distance - chosen.distance)

  return {
    mode,
    addresses: ordered.map((location) => location.address),
    points: chosen.points,
    distance: Number(chosen.distance.toFixed(2)),
    baselineDistance: Number(reference.distance.toFixed(2)),
    savedDistance: Number(savedDistance.toFixed(2)),
    savedPercent:
      reference.distance === 0
        ? 0
        : Number(((savedDistance / reference.distance) * 100).toFixed(1)),
    createdAt: new Date().toISOString(),
  }
}
