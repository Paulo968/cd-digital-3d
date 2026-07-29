import type { WarehouseLayout } from './layout'
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

export type RealisticMissionStopKind = 'receiving' | 'address' | 'truck'

export interface RealisticMissionStop {
  id: string
  kind: RealisticMissionStopKind
  label: string
  address?: string
  access: WorldPoint
  restingPoint: WorldPoint
  facing: number
  forkHeight: number
}

export interface RealisticMission {
  id: string
  palletId: string
  color: string
  source: RealisticMissionStop
  destination: RealisticMissionStop
}

export interface RealisticMissionPlan {
  missions: RealisticMission[]
  initialPalletStops: Record<string, RealisticMissionStop>
  receivingStops: RealisticMissionStop[]
  truckStops: RealisticMissionStop[]
}

export interface RealisticDockGeometry {
  receivingX: number
  shippingX: number
  frontZ: number
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

function receivingStop(
  index: number,
  geometry: RealisticDockGeometry,
): RealisticMissionStop {
  const supportY = 0.25
  const xOffset = index === 0 ? -0.82 : 0.82
  const restingPoint = {
    x: geometry.receivingX + xOffset,
    y: supportY + PALLET_SUPPORT_CLEARANCE + PALLET_HEIGHT / 2,
    z: geometry.frontZ - 4,
  }

  return {
    id: `receiving:${index + 1}`,
    kind: 'receiving',
    label: `Recebimento ${index + 1}`,
    access: {
      x: restingPoint.x,
      y: 0.2,
      z: restingPoint.z + 3,
    },
    restingPoint,
    facing: 0,
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

function uniqueLocations(locations: WarehouseLocation[]): WarehouseLocation[] {
  const seen = new Set<string>()
  return locations.filter((location) => {
    if (seen.has(location.address)) return false
    seen.add(location.address)
    return true
  })
}

function preferredLocations(
  locations: WarehouseLocation[],
  zone: WarehouseLocation['zone'],
  quantity: number,
): WarehouseLocation[] {
  const empty = locations.filter(
    (location) =>
      location.zone === zone &&
      location.status === 'empty' &&
      location.quantity === 0,
  )
  const remaining = locations.filter(
    (location) => location.zone === zone && location.status !== 'blocked',
  )
  return uniqueLocations([...empty, ...remaining]).slice(0, quantity)
}

function validMission(mission: RealisticMission): boolean {
  return mission.source.id !== mission.destination.id
}

export function buildRealisticMissionPlan(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
  geometry: RealisticDockGeometry,
): RealisticMissionPlan {
  const reserveLocations = preferredLocations(locations, 'reserve', 3)
  const pickingLocations = preferredLocations(locations, 'picking', 3)
  const receivingStops = [
    receivingStop(0, geometry),
    receivingStop(1, geometry),
  ]
  const truckStops = [truckStop(0, geometry), truckStop(1, geometry)]

  if (reserveLocations.length === 0 || pickingLocations.length === 0) {
    return {
      missions: [],
      initialPalletStops: {},
      receivingStops,
      truckStops,
    }
  }

  const reserveStops = reserveLocations.map((location, index) =>
    rackStop(layout, location, `Reserva ${index + 1}`),
  )
  const pickingStops = pickingLocations.map((location, index) =>
    rackStop(layout, location, `Picking ${index + 1}`),
  )
  const reserve = (index: number) =>
    reserveStops[Math.min(index, reserveStops.length - 1)]
  const picking = (index: number) =>
    pickingStops[Math.min(index, pickingStops.length - 1)]

  const candidates: RealisticMission[] = [
    {
      id: 'putaway-1',
      palletId: 'DEMO-IN-01',
      color: PALLET_COLORS[0],
      source: receivingStops[0],
      destination: reserve(0),
    },
    {
      id: 'replenishment-1',
      palletId: 'DEMO-RES-01',
      color: PALLET_COLORS[1],
      source: reserve(1),
      destination: picking(0),
    },
    {
      id: 'shipping-1',
      palletId: 'DEMO-PICK-01',
      color: PALLET_COLORS[2],
      source: picking(1),
      destination: truckStops[0],
    },
    {
      id: 'putaway-2',
      palletId: 'DEMO-IN-02',
      color: PALLET_COLORS[3],
      source: receivingStops[1],
      destination: reserve(2),
    },
    {
      id: 'replenishment-2',
      palletId: 'DEMO-IN-01',
      color: PALLET_COLORS[0],
      source: reserve(0),
      destination: picking(2),
    },
    {
      id: 'shipping-2',
      palletId: 'DEMO-RES-01',
      color: PALLET_COLORS[1],
      source: picking(0),
      destination: truckStops[1],
    },
  ]

  const missions = candidates.filter(validMission)
  const initialPalletStops: Record<string, RealisticMissionStop> = {}
  missions.forEach((mission) => {
    if (!initialPalletStops[mission.palletId]) {
      initialPalletStops[mission.palletId] = mission.source
    }
  })

  return {
    missions,
    initialPalletStops,
    receivingStops,
    truckStops,
  }
}
