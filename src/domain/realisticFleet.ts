import type { WarehouseLayout } from './layout'
import type {
  RealisticDockGeometry,
  RealisticMissionStop,
} from './realisticMissionQueue'
import {
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
}

export interface RealisticFleetPlan {
  vehicles: FleetVehicleDefinition[]
  missions: FleetMission[]
  initialPalletStops: Record<string, RealisticMissionStop>
  receivingStops: RealisticMissionStop[]
  stagingStops: RealisticMissionStop[]
  truckStops: RealisticMissionStop[]
}

const PALLET_COLORS = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
]

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
  const xOffset = index === 0 ? -0.65 : 0.65
  const restingPoint = {
    x: geometry.shippingX + xOffset,
    y: supportY + PALLET_SUPPORT_CLEARANCE + PALLET_HEIGHT / 2,
    z: geometry.frontZ + 2.15,
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

export function buildRealisticFleetPlan(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
  geometry: RealisticDockGeometry,
  compact: boolean,
): RealisticFleetPlan {
  const reserveLocations = preferredLocations(locations, 'reserve', 4)
  const pickingLocations = preferredLocations(locations, 'picking', 3, {
    lowestLevelOnly: true,
  })

  const receivingStops = [
    floorStop(
      'receiving:1',
      'Recebimento 1',
      geometry.receivingX - 0.9,
      geometry.frontZ - 4,
      0,
    ),
    floorStop(
      'receiving:2',
      'Recebimento 2',
      geometry.receivingX + 0.9,
      geometry.frontZ - 4,
      0,
    ),
  ]
  const stagingStops = [
    floorStop(
      'staging:inbound:1',
      'Espera de entrada 1',
      geometry.receivingX - 2.1,
      geometry.frontZ - 8,
      0,
    ),
    floorStop(
      'staging:inbound:2',
      'Espera de entrada 2',
      geometry.receivingX + 2.1,
      geometry.frontZ - 8,
      0,
    ),
  ]
  const truckStops = [truckStop(0, geometry), truckStop(1, geometry)]

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
      0.9,
    ),
    vehicleStart(
      'TP-01',
      'Transpaleteira elétrica',
      'pallet-jack',
      ['inbound-transfer', 'shipping'],
      '#0ea5e9',
      {
        x: geometry.receivingX,
        y: 0.2,
        z: geometry.frontZ - 1.5,
      },
      Math.PI,
      1.08,
      0.35,
    ),
  ].filter((vehicle) => !compact || vehicle.id !== 'EMP-02')

  if (reserveLocations.length < 3 || pickingLocations.length < 2) {
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

  const missions: FleetMission[] = [
    {
      id: 'inbound-transfer-1',
      palletId: 'DEMO-IN-01',
      color: PALLET_COLORS[0],
      role: 'inbound-transfer',
      source: receivingStops[0],
      destination: stagingStops[0],
      eligibleKinds: ['pallet-jack'],
      priority: 1,
      sequence: 1,
    },
    {
      id: 'putaway-1',
      palletId: 'DEMO-IN-01',
      color: PALLET_COLORS[0],
      role: 'putaway',
      source: stagingStops[0],
      destination: reserveStops[0],
      eligibleKinds: ['forklift'],
      priority: 2,
      sequence: 2,
    },
    {
      id: 'inbound-transfer-2',
      palletId: 'DEMO-IN-02',
      color: PALLET_COLORS[1],
      role: 'inbound-transfer',
      source: receivingStops[1],
      destination: stagingStops[1],
      eligibleKinds: ['pallet-jack'],
      priority: 1,
      sequence: 3,
    },
    {
      id: 'putaway-2',
      palletId: 'DEMO-IN-02',
      color: PALLET_COLORS[1],
      role: 'putaway',
      source: stagingStops[1],
      destination: reserveStops[1],
      eligibleKinds: ['forklift'],
      priority: 2,
      sequence: 4,
    },
    {
      id: 'replenishment-1',
      palletId: 'DEMO-RES-01',
      color: PALLET_COLORS[2],
      role: 'replenishment',
      source: reserveStops[2],
      destination: pickingStops[0],
      eligibleKinds: ['forklift'],
      priority: 1,
      sequence: 1,
    },
    {
      id: 'shipping-1',
      palletId: 'DEMO-PICK-01',
      color: PALLET_COLORS[3],
      role: 'shipping',
      source: pickingStops[1],
      destination: truckStops[0],
      eligibleKinds: ['pallet-jack', 'forklift'],
      priority: 1,
      sequence: 1,
    },
    {
      id: 'replenishment-2',
      palletId: 'DEMO-IN-01',
      color: PALLET_COLORS[0],
      role: 'replenishment',
      source: reserveStops[0],
      destination: pickingStops[Math.min(2, pickingStops.length - 1)],
      eligibleKinds: ['forklift'],
      priority: 3,
      sequence: 5,
    },
    {
      id: 'shipping-2',
      palletId: 'DEMO-IN-01',
      color: PALLET_COLORS[0],
      role: 'shipping',
      source: pickingStops[Math.min(2, pickingStops.length - 1)],
      destination: truckStops[1],
      eligibleKinds: ['pallet-jack', 'forklift'],
      priority: 3,
      sequence: 6,
    },
  ]

  const initialPalletStops: Record<string, RealisticMissionStop> = {}
  missions.forEach((mission) => {
    if (!initialPalletStops[mission.palletId]) {
      initialPalletStops[mission.palletId] = mission.source
    }
  })

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
  return missions
    .filter(
      (mission) =>
        statuses[mission.id] === 'pending' &&
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
  return missions.find(
    (mission) =>
      !reservedMissionIds.has(mission.id) &&
      !reservedDestinationIds.has(mission.destination.id) &&
      mission.eligibleKinds.includes(vehicle.kind) &&
      vehicle.roles.includes(mission.role),
  )
}
