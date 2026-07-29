import type { WarehouseLayout } from './layout'
import type {
  RealisticDockGeometry,
  RealisticMissionStop,
} from './realisticMissionQueue'
import {
  buildTravelPath,
  getLocationAccessPoint,
  getLocationWorldPoint,
  type WorldPoint,
} from './routePlanning'
import {
  findLocationRow,
  FORK_THICKNESS,
  getForkCarriageHeight,
  getPalletCenterY,
  PALLET_HEIGHT,
  PALLET_SUPPORT_CLEARANCE,
  VEHICLE_BASE_Y,
} from './warehouseGeometry'
import type { WarehouseLocation } from './warehouse'

export type FleetVehicleKind = 'forklift' | 'pallet-jack'
export type FleetMissionRole =
  | 'inbound-transfer'
  | 'putaway'
  | 'replenishment'
  | 'shipping'

export type FleetMissionStatus = 'pending' | 'running' | 'completed'

export interface FleetVehicleDefinition {
  id: string
  label: string
  kind: FleetVehicleKind
  roles: FleetMissionRole[]
  color: string
  startPoint: WorldPoint
  startFacing: number
  speedScale: number
  startDelay: number
}

export interface FleetMission {
  id: string
  palletId: string
  color: string
  role: FleetMissionRole
  source: RealisticMissionStop
  destination: RealisticMissionStop
  eligibleKinds: FleetVehicleKind[]
  priority: number
  sequence: number
  trafficCells: string[]
}

export interface RealisticFleetPlan {
  vehicles: FleetVehicleDefinition[]
  missions: FleetMission[]
  initialPalletStops: Record<string, RealisticMissionStop>
  receivingStops: RealisticMissionStop[]
  stagingStops: RealisticMissionStop[]
  truckStops: RealisticMissionStop[]
}

export const TRAFFIC_CELL_SIZE = 3.2

const PALLET_COLORS = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
  '#fb7185',
  '#60a5fa',
]

const missionTrafficRegistry = new Map<string, Set<string>>()

function forkHeightForSupport(supportY: number): number {
  const palletBottom = supportY + PALLET_SUPPORT_CLEARANCE
  const forkCenter = palletBottom - FORK_THICKNESS / 2
  return Math.max(0.03, forkCenter - VEHICLE_BASE_Y)
}

function rackStop(
  layout: WarehouseLayout,
  location: WarehouseLocation,
  label: string,
): RealisticMissionStop {
  const point = getLocationWorldPoint(layout, location)
  const row = findLocationRow(layout, location)
  const facing = row
    ? row.rotationY + (location.side === 'left' ? 0 : Math.PI)
    : 0

  return {
    id: `address:${location.address}`,
    kind: 'address',
    label,
    address: location.address,
    access: getLocationAccessPoint(layout, location),
    restingPoint: {
      x: point.x,
      y: getPalletCenterY(layout, location),
      z: point.z,
    },
    facing,
    forkHeight: getForkCarriageHeight(layout, location),
  }
}

function floorStop(
  id: string,
  label: string,
  x: number,
  z: number,
  facing: number,
  supportY = 0.08,
): RealisticMissionStop {
  const restingPoint = {
    x,
    y: supportY + PALLET_SUPPORT_CLEARANCE + PALLET_HEIGHT / 2,
    z,
  }
  const forwardX = Math.sin(facing) * 2.5
  const forwardZ = -Math.cos(facing) * 2.5

  return {
    id,
    kind: 'receiving',
    label,
    access: {
      x: x - forwardX,
      y: 0.2,
      z: z - forwardZ,
    },
    restingPoint,
    facing,
    forkHeight: forkHeightForSupport(supportY),
  }
}

function truckStop(
  index: number,
  geometry: RealisticDockGeometry,
): RealisticMissionStop {
  const supportY = 0.58
  const column = index % 2
  const row = Math.floor(index / 2)
  const xOffset = column === 0 ? -0.65 : 0.65
  const restingPoint = {
    x: geometry.shippingX + xOffset,
    y: supportY + PALLET_SUPPORT_CLEARANCE + PALLET_HEIGHT / 2,
    z: geometry.frontZ + 2.15 + row * 1.15,
  }

  return {
    id: `truck:${index + 1}`,
    kind: 'truck',
    label: `Caminhão — posição ${index + 1}`,
    access: {
      x: restingPoint.x,
      y: 0.2,
      z: geometry.frontZ - 1.2,
    },
    restingPoint,
    facing: Math.PI,
    forkHeight: forkHeightForSupport(supportY),
  }
}

function preferredLocations(
  locations: WarehouseLocation[],
  zone: WarehouseLocation['zone'],
  quantity: number,
  options: { lowestLevelOnly?: boolean } = {},
): WarehouseLocation[] {
  const candidates = locations.filter(
    (location) =>
      location.zone === zone &&
      location.status !== 'blocked' &&
      (!options.lowestLevelOnly || location.level === 1),
  )
  const empty = candidates.filter(
    (location) => location.status === 'empty' && location.quantity === 0,
  )
  const ordered = [...empty, ...candidates]
  const seen = new Set<string>()

  return ordered
    .filter((location) => {
      if (seen.has(location.address)) return false
      seen.add(location.address)
      return true
    })
    .slice(0, quantity)
}

function vehicleStart(
  id: string,
  label: string,
  kind: FleetVehicleKind,
  roles: FleetMissionRole[],
  color: string,
  point: WorldPoint,
  facing: number,
  speedScale: number,
  startDelay: number,
): FleetVehicleDefinition {
  return {
    id,
    label,
    kind,
    roles,
    color,
    startPoint: point,
    startFacing: facing,
    speedScale,
    startDelay,
  }
}

export function trafficCellKey(
  point: Pick<WorldPoint, 'x' | 'z'>,
  cellSize = TRAFFIC_CELL_SIZE,
): string {
  return `${Math.round(point.x / cellSize)}:${Math.round(point.z / cellSize)}`
}

export function buildTrafficCells(
  points: WorldPoint[],
  cellSize = TRAFFIC_CELL_SIZE,
): string[] {
  if (points.length === 0) return []
  const cells = new Set<string>()

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const distance = Math.hypot(to.x - from.x, to.z - from.z)
    const steps = Math.max(1, Math.ceil(distance / (cellSize * 0.45)))

    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps
      cells.add(
        trafficCellKey(
          {
            x: from.x + (to.x - from.x) * ratio,
            z: from.z + (to.z - from.z) * ratio,
          },
          cellSize,
        ),
      )
    }
  }

  if (points.length === 1) cells.add(trafficCellKey(points[0], cellSize))
  return [...cells]
}

export function trafficCellsConflict(
  left: Iterable<string>,
  right: Iterable<string>,
): boolean {
  const rightSet = right instanceof Set ? right : new Set(right)
  for (const cell of left) {
    if (rightSet.has(cell)) return true
  }
  return false
}

function missionTrafficCells(
  layout: WarehouseLayout,
  source: RealisticMissionStop,
  destination: RealisticMissionStop,
): string[] {
  let path: WorldPoint[]
  try {
    path = buildTravelPath(layout, source.access, destination.access, {
      left: false,
      right: false,
    })
  } catch {
    path = [source.access, destination.access]
  }

  return buildTrafficCells(path)
}

function createMission(
  layout: WarehouseLayout,
  input: Omit<FleetMission, 'trafficCells'>,
): FleetMission {
  return {
    ...input,
    trafficCells: missionTrafficCells(layout, input.source, input.destination),
  }
}

function registerMissionTraffic(missions: FleetMission[]): void {
  missionTrafficRegistry.clear()
  missions.forEach((mission) => {
    missionTrafficRegistry.set(mission.id, new Set(mission.trafficCells))
  })
}

export function buildRealisticFleetPlan(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
  geometry: RealisticDockGeometry,
  compact: boolean,
): RealisticFleetPlan {
  const reserveLocations = preferredLocations(locations, 'reserve', 6)
  const pickingLocations = preferredLocations(locations, 'picking', 4, {
    lowestLevelOnly: true,
  })
  const inboundCount = compact ? 2 : 3

  const receivingStops = Array.from({ length: inboundCount }, (_, index) => {
    const offset = (index - (inboundCount - 1) / 2) * 1.8
    return floorStop(
      `receiving:${index + 1}`,
      `Recebimento ${index + 1}`,
      geometry.receivingX + offset,
      geometry.frontZ - 4,
      0,
    )
  })
  const stagingStops = Array.from({ length: inboundCount }, (_, index) => {
    const offset = (index - (inboundCount - 1) / 2) * 2.05
    return floorStop(
      `staging:inbound:${index + 1}`,
      `Espera de entrada ${index + 1}`,
      geometry.receivingX + offset,
      geometry.frontZ - 8,
      0,
    )
  })
  const truckStops = Array.from({ length: 6 }, (_, index) =>
    truckStop(index, geometry),
  )

  const vehicles = [
    vehicleStart(
      'EMP-01',
      'Empilhadeira de armazenagem',
      'forklift',
      ['putaway', 'replenishment', 'shipping'],
      '#f59e0b',
      {
        x: stagingStops[0].access.x - 2.4,
        y: 0.2,
        z: stagingStops[0].access.z,
      },
      Math.PI / 2,
      1,
      0,
    ),
    vehicleStart(
      'EMP-02',
      'Empilhadeira de reabastecimento',
      'forklift',
      ['putaway', 'replenishment', 'shipping'],
      '#eab308',
      {
        x: geometry.shippingX,
        y: 0.2,
        z: geometry.frontZ - 9,
      },
      -Math.PI / 2,
      0.94,
      0.75,
    ),
    vehicleStart(
      'TP-01',
      'Transpaleteira elétrica de recebimento',
      'pallet-jack',
      ['inbound-transfer', 'shipping'],
      '#0ea5e9',
      {
        x: geometry.receivingX - 1.8,
        y: 0.2,
        z: geometry.frontZ - 1.5,
      },
      Math.PI,
      1.08,
      0.25,
    ),
    vehicleStart(
      'TP-02',
      'Transpaleteira elétrica de expedição',
      'pallet-jack',
      ['inbound-transfer', 'shipping'],
      '#2563eb',
      {
        x: geometry.shippingX + 1.8,
        y: 0.2,
        z: geometry.frontZ - 4.5,
      },
      Math.PI,
      1.03,
      1.1,
    ),
  ].filter((vehicle) => !compact || ['EMP-01', 'TP-01'].includes(vehicle.id))

  if (reserveLocations.length < inboundCount + 1 || pickingLocations.length < 4) {
    return {
      vehicles,
      missions: [],
      initialPalletStops: {},
      receivingStops,
      stagingStops,
      truckStops,
    }
  }

  const reserveStops = reserveLocations.map((location, index) =>
    rackStop(layout, location, `Reserva ${index + 1}`),
  )
  const pickingStops = pickingLocations.map((location, index) =>
    rackStop(layout, location, `Picking ${index + 1}`),
  )

  const missions: FleetMission[] = []
  let truckIndex = 0

  missions.push(
    createMission(layout, {
      id: 'shipping-initial-1',
      palletId: 'DEMO-PICK-01',
      color: PALLET_COLORS[4],
      role: 'shipping',
      source: pickingStops[1],
      destination: truckStops[truckIndex++],
      eligibleKinds: ['pallet-jack', 'forklift'],
      priority: 1,
      sequence: 1,
    }),
    createMission(layout, {
      id: 'shipping-initial-2',
      palletId: 'DEMO-PICK-02',
      color: PALLET_COLORS[5],
      role: 'shipping',
      source: pickingStops[2],
      destination: truckStops[truckIndex++],
      eligibleKinds: ['pallet-jack', 'forklift'],
      priority: 1,
      sequence: 2,
    }),
    createMission(layout, {
      id: 'replenishment-initial',
      palletId: 'DEMO-RES-01',
      color: PALLET_COLORS[3],
      role: 'replenishment',
      source: reserveStops[inboundCount],
      destination: pickingStops[0],
      eligibleKinds: ['forklift'],
      priority: 1,
      sequence: 3,
    }),
    createMission(layout, {
      id: 'shipping-reserve-initial',
      palletId: 'DEMO-RES-01',
      color: PALLET_COLORS[3],
      role: 'shipping',
      source: pickingStops[0],
      destination: truckStops[truckIndex++],
      eligibleKinds: ['pallet-jack', 'forklift'],
      priority: 2,
      sequence: 4,
    }),
  )

  for (let index = 0; index < inboundCount; index += 1) {
    const suffix = index + 1
    const palletId = `DEMO-IN-0${suffix}`
    const color = PALLET_COLORS[index]
    const pickingStop = pickingStops[Math.min(index + 1, pickingStops.length - 1)]
    const sequence = 10 + index * 4

    missions.push(
      createMission(layout, {
        id: `inbound-transfer-${suffix}`,
        palletId,
        color,
        role: 'inbound-transfer',
        source: receivingStops[index],
        destination: stagingStops[index],
        eligibleKinds: ['pallet-jack'],
        priority: 1,
        sequence,
      }),
      createMission(layout, {
        id: `putaway-${suffix}`,
        palletId,
        color,
        role: 'putaway',
        source: stagingStops[index],
        destination: reserveStops[index],
        eligibleKinds: ['forklift'],
        priority: 2,
        sequence: sequence + 1,
      }),
      createMission(layout, {
        id: `replenishment-${suffix}`,
        palletId,
        color,
        role: 'replenishment',
        source: reserveStops[index],
        destination: pickingStop,
        eligibleKinds: ['forklift'],
        priority: 3,
        sequence: sequence + 2,
      }),
      createMission(layout, {
        id: `shipping-${suffix}`,
        palletId,
        color,
        role: 'shipping',
        source: pickingStop,
        destination: truckStops[Math.min(truckIndex++, truckStops.length - 1)],
        eligibleKinds: ['pallet-jack', 'forklift'],
        priority: 4,
        sequence: sequence + 3,
      }),
    )
  }

  const initialPalletStops: Record<string, RealisticMissionStop> = {}
  missions.forEach((mission) => {
    if (!initialPalletStops[mission.palletId]) {
      initialPalletStops[mission.palletId] = mission.source
    }
  })

  registerMissionTraffic(missions)

  return {
    vehicles,
    missions,
    initialPalletStops,
    receivingStops,
    stagingStops,
    truckStops,
  }
}

export function createMissionStatuses(
  missions: FleetMission[],
): Record<string, FleetMissionStatus> {
  return Object.fromEntries(
    missions.map((mission) => [mission.id, 'pending' as const]),
  )
}

export function readyMissions(
  missions: FleetMission[],
  statuses: Record<string, FleetMissionStatus>,
  palletStops: Record<string, RealisticMissionStop | null>,
): FleetMission[] {
  const palletsInActiveMissions = new Set(
    missions
      .filter((mission) => statuses[mission.id] === 'running')
      .map((mission) => mission.palletId),
  )

  return missions
    .filter(
      (mission) =>
        statuses[mission.id] === 'pending' &&
        !palletsInActiveMissions.has(mission.palletId) &&
        palletStops[mission.palletId]?.id === mission.source.id,
    )
    .sort(
      (left, right) =>
        left.priority - right.priority || left.sequence - right.sequence,
    )
}

export function chooseMissionForVehicle(
  vehicle: FleetVehicleDefinition,
  missions: FleetMission[],
  reservedMissionIds: Set<string>,
  reservedDestinationIds: Set<string>,
): FleetMission | undefined {
  const reservedTrafficCells = new Set<string>()
  reservedMissionIds.forEach((missionId) => {
    missionTrafficRegistry.get(missionId)?.forEach((cell) => {
      reservedTrafficCells.add(cell)
    })
  })

  return missions.find(
    (mission) =>
      !reservedMissionIds.has(mission.id) &&
      !reservedDestinationIds.has(mission.destination.id) &&
      !trafficCellsConflict(mission.trafficCells, reservedTrafficCells) &&
      mission.eligibleKinds.includes(vehicle.kind) &&
      vehicle.roles.includes(mission.role),
  )
}
