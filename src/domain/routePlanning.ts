import type {
  RackRowLayout,
  WarehouseLayout,
  WarehouseZoneType,
} from './layout'
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

export interface VehicleProfile {
  width: number
  length: number
  turningRadius: number
  safetyMargin: number
}

export interface RouteClearanceIssue {
  rackRowId: string
  aisle: string
  actualWidth: number
  requiredWidth: number
}

export const DEFAULT_FORKLIFT_PROFILE: VehicleProfile = {
  width: 1.15,
  length: 2.95,
  turningRadius: 1.45,
  safetyMargin: 0.45,
}

interface GraphEdge {
  to: string
  cost: number
}

interface GraphNode {
  id: string
  point: WorldPoint
  edges: GraphEdge[]
}

interface RowLane {
  row: RackRowLayout
  leftId: string
  rightId: string
  left: WorldPoint
  right: WorldPoint
  halfLength: number
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

function toLocalPoint(
  point: WorldPoint,
  row: RackRowLayout,
): { x: number; z: number } {
  return rotatePoint(
    point.x - row.origin.x,
    point.z - row.origin.z,
    -row.rotationY,
  )
}

function rowPoint(
  row: RackRowLayout,
  localX: number,
  localZ = 0,
): WorldPoint {
  const rotated = rotatePoint(localX, localZ, row.rotationY)
  return {
    x: row.origin.x + rotated.x,
    y: 0.2,
    z: row.origin.z + rotated.z,
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
  return rowPoint(row, localX)
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

function addNode(
  graph: Map<string, GraphNode>,
  id: string,
  point: WorldPoint,
): GraphNode {
  const existing = graph.get(id)
  if (existing) return existing
  const node = { id, point, edges: [] }
  graph.set(id, node)
  return node
}

function addEdge(
  graph: Map<string, GraphNode>,
  leftId: string,
  rightId: string,
  cost?: number,
): void {
  const left = graph.get(leftId)
  const right = graph.get(rightId)
  if (!left || !right || leftId === rightId) return
  const resolvedCost = cost ?? pointDistance(left.point, right.point)

  if (!left.edges.some((edge) => edge.to === rightId)) {
    left.edges.push({ to: rightId, cost: resolvedCost })
  }
  if (!right.edges.some((edge) => edge.to === leftId)) {
    right.edges.push({ to: leftId, cost: resolvedCost })
  }
}

function buildRowLanes(
  layout: WarehouseLayout,
  graph: Map<string, GraphNode>,
): RowLane[] {
  return layout.rackRows
    .filter((row) => row.active)
    .map((row) => {
      const halfLength = (row.baysPerSide * row.bayWidth) / 2 + 2.2
      const leftId = `${row.id}:left`
      const rightId = `${row.id}:right`
      const left = rowPoint(row, -halfLength)
      const right = rowPoint(row, halfLength)
      addNode(graph, leftId, left)
      addNode(graph, rightId, right)
      addEdge(graph, leftId, rightId)
      return { row, leftId, rightId, left, right, halfLength }
    })
}

function addCrossAisleEdges(
  graph: Map<string, GraphNode>,
  lanes: RowLane[],
  side: 'left' | 'right',
): void {
  const nodes = lanes.map((lane) => ({
    id: side === 'left' ? lane.leftId : lane.rightId,
    point: side === 'left' ? lane.left : lane.right,
  }))

  nodes.forEach((node, index) => {
    const nearest = nodes
      .filter((_, candidateIndex) => candidateIndex !== index)
      .map((candidate) => ({
        ...candidate,
        distance: pointDistance(node.point, candidate.point),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, Math.min(2, nodes.length - 1))

    nearest.forEach((candidate) => {
      addEdge(graph, node.id, candidate.id, candidate.distance)
    })
  })
}

function laneForPoint(point: WorldPoint, lanes: RowLane[]): RowLane | undefined {
  let selected: RowLane | undefined
  let selectedDistance = Number.POSITIVE_INFINITY

  lanes.forEach((lane) => {
    const local = toLocalPoint(point, lane.row)
    const insideLength = Math.abs(local.x) <= lane.halfLength + 0.25
    const distanceFromCenter = Math.abs(local.z)
    const insideAisle =
      distanceFromCenter <= lane.row.aisleWidth / 2 + 0.65

    if (insideLength && insideAisle && distanceFromCenter < selectedDistance) {
      selected = lane
      selectedDistance = distanceFromCenter
    }
  })

  return selected
}

function attachPoint(
  graph: Map<string, GraphNode>,
  lanes: RowLane[],
  id: string,
  point: WorldPoint,
): string {
  addNode(graph, id, point)
  const lane = laneForPoint(point, lanes)

  if (lane) {
    addEdge(graph, id, lane.leftId)
    addEdge(graph, id, lane.rightId)
    return id
  }

  const endpointIds = lanes.flatMap((candidate) => [
    candidate.leftId,
    candidate.rightId,
  ])
  const nearest = endpointIds
    .map((endpointId) => ({
      endpointId,
      distance: pointDistance(point, graph.get(endpointId)!.point),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, Math.min(2, endpointIds.length))

  nearest.forEach(({ endpointId, distance }) => {
    addEdge(graph, id, endpointId, distance)
  })
  return id
}

function shortestPath(
  graph: Map<string, GraphNode>,
  startId: string,
  endId: string,
): WorldPoint[] {
  const distances = new Map<string, number>()
  const previous = new Map<string, string>()
  const unvisited = new Set(graph.keys())

  graph.forEach((_, id) => distances.set(id, Number.POSITIVE_INFINITY))
  distances.set(startId, 0)

  while (unvisited.size > 0) {
    let currentId: string | undefined
    let currentDistance = Number.POSITIVE_INFINITY

    unvisited.forEach((candidateId) => {
      const candidateDistance = distances.get(candidateId) ?? Number.POSITIVE_INFINITY
      if (candidateDistance < currentDistance) {
        currentId = candidateId
        currentDistance = candidateDistance
      }
    })

    if (!currentId || currentDistance === Number.POSITIVE_INFINITY) break
    if (currentId === endId) break
    unvisited.delete(currentId)

    const current = graph.get(currentId)
    if (!current) continue
    current.edges.forEach((edge) => {
      if (!unvisited.has(edge.to)) return
      const nextDistance = currentDistance + edge.cost
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance)
        previous.set(edge.to, currentId!)
      }
    })
  }

  if (!Number.isFinite(distances.get(endId) ?? Number.POSITIVE_INFINITY)) {
    throw new Error('Não existe rota operacional disponível entre os pontos.')
  }

  const ids: string[] = [endId]
  let current = endId
  while (current !== startId) {
    const parent = previous.get(current)
    if (!parent) {
      throw new Error('A rota operacional ficou desconectada.')
    }
    ids.push(parent)
    current = parent
  }
  ids.reverse()
  return ids.map((id) => graph.get(id)!.point)
}

function connect(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
  blocked: { left: boolean; right: boolean },
): WorldPoint[] {
  if (pointDistance(from, to) < 0.001) return [from]

  const graph = new Map<string, GraphNode>()
  const lanes = buildRowLanes(layout, graph)
  if (lanes.length === 0) return [from, to]

  const fromLane = laneForPoint(from, lanes)
  const toLane = laneForPoint(to, lanes)
  if (fromLane && toLane && fromLane.row.id === toLane.row.id) {
    return [from, to]
  }

  if (blocked.left && blocked.right) {
    throw new Error(
      'As duas cabeceiras estão bloqueadas. Não existe rota disponível entre as ruas.',
    )
  }

  if (!blocked.left) addCrossAisleEdges(graph, lanes, 'left')
  if (!blocked.right) addCrossAisleEdges(graph, lanes, 'right')

  const startId = attachPoint(graph, lanes, 'route:start', from)
  const endId = attachPoint(graph, lanes, 'route:end', to)
  return shortestPath(graph, startId, endId)
}

export function buildTravelPath(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
  blocked: { left: boolean; right: boolean },
): WorldPoint[] {
  return connect(layout, from, to, blocked)
}

export function getAisleClearanceIssues(
  layout: WarehouseLayout,
  vehicle: VehicleProfile = DEFAULT_FORKLIFT_PROFILE,
): RouteClearanceIssue[] {
  const requiredWidth = Math.max(
    vehicle.width + vehicle.safetyMargin * 2,
    vehicle.turningRadius * 2,
  )

  return layout.rackRows
    .filter((row) => row.active && row.aisleWidth < requiredWidth)
    .map((row) => ({
      rackRowId: row.id,
      aisle: row.aisle,
      actualWidth: row.aisleWidth,
      requiredWidth: Number(requiredWidth.toFixed(2)),
    }))
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
  vehicleStart: WorldPoint = getZoneWorldPoint(layout, 'shipping'),
): RoutePlan {
  const taskLocations = taskAddresses
    .map((address) =>
      allLocations.find((location) => location.address === address),
    )
    .filter((value): value is WarehouseLocation => Boolean(value))

  if (taskLocations.length === 0) {
    throw new Error('Adicione ao menos uma posição para executar a simulação.')
  }

  const reference = routeForOrder(layout, vehicleStart, taskLocations, blocked)
  const ordered =
    mode === 'optimized'
      ? optimizeTaskOrder(layout, vehicleStart, taskLocations, blocked)
      : taskLocations
  const chosen =
    mode === 'optimized'
      ? routeForOrder(layout, vehicleStart, ordered, blocked)
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
