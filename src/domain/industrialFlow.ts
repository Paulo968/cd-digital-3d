import type { WarehouseLayout } from './layout'
import type {
  FleetMission,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'
import { buildTrafficCells } from './realisticFleet'
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

export interface IndustrialAisleAssignment {
  vehicleId: string
  aisles: string[]
  bufferStop: RealisticMissionStop
}

export interface IndustrialFlowPlan extends RealisticFleetPlan {
  flowKind: 'industrial'
  inboundTruckStops: RealisticMissionStop[]
  dischargeStops: RealisticMissionStop[]
  aisleBufferStops: RealisticMissionStop[]
  shippingBufferStops: RealisticMissionStop[]
  aisleAssignments: IndustrialAisleAssignment[]
}

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

function forkHeightForSupport(supportY: number): number {
  const palletBottom = supportY + PALLET_SUPPORT_CLEARANCE
  const forkCenter = palletBottom - FORK_THICKNESS / 2
  return Math.max(0.03, forkCenter - VEHICLE_BASE_Y)
}

function floorStop(
  id: string,
  label: string,
  x: number,
  z: number,
  facing: number,
  kind: RealisticMissionStop['kind'] = 'receiving',
  supportY = 0.08,
): RealisticMissionStop {
  const forwardX = Math.sin(facing) * 2.35
  const forwardZ = -Math.cos(facing) * 2.35
  return {
    id,
    kind,
    label,
    access: { x: x - forwardX, y: 0.2, z: z - forwardZ },
    restingPoint: {
      x,
      y: supportY + PALLET_SUPPORT_CLEARANCE + PALLET_HEIGHT / 2,
      z,
    },
    facing,
    forkHeight: forkHeightForSupport(supportY),
  }
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

function truckStop(
  prefix: 'inbound-truck' | 'truck',
  index: number,
  x: number,
  frontZ: number,
  inbound: boolean,
): RealisticMissionStop {
  const supportY = 0.58
  const column = index % 2
  const row = Math.floor(index / 2)
  const xOffset = column === 0 ? -0.65 : 0.65
  const z = frontZ + 2.15 + row * 1.12
  return floorStop(
    `${prefix}:${index + 1}`,
    inbound
      ? `Caminhão de recebimento — posição ${index + 1}`
      : `Caminhão de expedição — posição ${index + 1}`,
    x + xOffset,
    z,
    Math.PI,
    'truck',
    supportY,
  )
}

function trafficCells(
  layout: WarehouseLayout,
  source: RealisticMissionStop,
  destination: RealisticMissionStop,
): string[] {
  try {
    return buildTrafficCells(
      buildTravelPath(layout, source.access, destination.access, {
        left: false,
        right: false,
      }),
    )
  } catch {
    return buildTrafficCells([source.access, destination.access])
  }
}

function mission(
  layout: WarehouseLayout,
  input: Omit<FleetMission, 'trafficCells'>,
): FleetMission {
  return {
    ...input,
    trafficCells: trafficCells(layout, input.source, input.destination),
  }
}

function vehicle(
  id: string,
  label: string,
  kind: FleetVehicleDefinition['kind'],
  roles: FleetVehicleDefinition['roles'],
  color: string,
  startPoint: WorldPoint,
  startFacing: number,
  speedScale: number,
  startDelay: number,
): FleetVehicleDefinition {
  return {
    id,
    label,
    kind,
    roles,
    color,
    startPoint,
    startFacing,
    speedScale,
    startDelay,
  }
}

function activeAisles(layout: WarehouseLayout): string[] {
  return layout.rackRows
    .filter((row) => row.active)
    .map((row) => row.aisle)
    .filter((aisle, index, values) => values.indexOf(aisle) === index)
    .sort()
}

function pairAisles(aisles: string[]): string[][] {
  const result: string[][] = []
  for (let index = 0; index < aisles.length; index += 2) {
    result.push(aisles.slice(index, index + 2))
  }
  return result
}

function freeLocations(
  locations: WarehouseLocation[],
  zone: WarehouseLocation['zone'],
): WarehouseLocation[] {
  return locations
    .filter(
      (location) =>
        location.zone === zone &&
        location.status !== 'blocked' &&
        (location.status === 'empty' || location.quantity === 0),
    )
    .sort((left, right) =>
      left.aisle.localeCompare(right.aisle) ||
      left.level - right.level ||
      left.position - right.position,
    )
}

function occupiedLocations(
  locations: WarehouseLocation[],
  zone: WarehouseLocation['zone'],
): WarehouseLocation[] {
  return locations
    .filter(
      (location) =>
        location.zone === zone &&
        location.status !== 'blocked' &&
        location.quantity > 0,
    )
    .sort((left, right) =>
      left.aisle.localeCompare(right.aisle) ||
      left.level - right.level ||
      left.position - right.position,
    )
}

function aisleBuffer(
  layout: WarehouseLayout,
  aisle: string,
  frontZ: number,
): RealisticMissionStop {
  const row = layout.rackRows.find((item) => item.active && item.aisle === aisle)
  if (!row) {
    return floorStop(
      `aisle-buffer:${aisle}`,
      `Buffer da Rua ${aisle}`,
      0,
      frontZ - 9,
      0,
    )
  }

  const halfLength = (row.baysPerSide * row.bayWidth) / 2
  const localEnd = { x: halfLength + 2.2, z: 0 }
  const cosine = Math.cos(row.rotationY)
  const sine = Math.sin(row.rotationY)
  const candidateA = {
    x: row.origin.x + localEnd.x * cosine - localEnd.z * sine,
    z: row.origin.z + localEnd.x * sine + localEnd.z * cosine,
  }
  const candidateB = {
    x: row.origin.x - localEnd.x * cosine,
    z: row.origin.z - localEnd.x * sine,
  }
  const chosen =
    Math.abs(frontZ - candidateA.z) < Math.abs(frontZ - candidateB.z)
      ? candidateA
      : candidateB

  return floorStop(
    `aisle-buffer:${aisle}`,
    `Buffer da Rua ${aisle}`,
    chosen.x,
    chosen.z,
    row.rotationY,
  )
}

export function industrialPlanIsActive(
  plan: RealisticFleetPlan,
): plan is IndustrialFlowPlan {
  return (plan as Partial<IndustrialFlowPlan>).flowKind === 'industrial'
}

export function missionAisle(mission: FleetMission): string | null {
  const address = mission.source.address ?? mission.destination.address
  if (address) return address.split('-')[0] ?? null
  const match = `${mission.source.id} ${mission.destination.id}`.match(
    /aisle-buffer:([A-Za-z0-9]+)/,
  )
  return match?.[1] ?? null
}

export function vehicleCoversMission(
  vehicleId: string,
  missionInput: FleetMission,
): boolean {
  if (!vehicleId.startsWith('EMP-')) return true
  const coverage = vehicleId.replace('EMP-', '')
  if (!/^[A-Z0-9]+$/.test(coverage)) return true
  const aisle = missionAisle(missionInput)
  return !aisle || coverage.includes(aisle)
}

export function buildIndustrialFlowPlan(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
  geometry: RealisticDockGeometry,
  compact: boolean,
): IndustrialFlowPlan {
  const aisles = activeAisles(layout)
  const aisleGroups = pairAisles(aisles)
  const inboundCount = compact ? 2 : 4
  const shippingCount = compact ? 3 : 6
  const inboundTruckStops = Array.from({ length: inboundCount }, (_, index) =>
    truckStop('inbound-truck', index, geometry.receivingX, geometry.frontZ, true),
  )
  const dischargeStops = Array.from({ length: inboundCount }, (_, index) => {
    const offset = (index - (inboundCount - 1) / 2) * 1.8
    return floorStop(
      `receiving:${index + 1}`,
      `Área de descarga ${index + 1}`,
      geometry.receivingX + offset,
      geometry.frontZ - 3.7,
      0,
    )
  })
  const aisleBufferStops = aisles.map((aisle) =>
    aisleBuffer(layout, aisle, geometry.frontZ),
  )
  const shippingBufferStops = Array.from(
    { length: compact ? 2 : 4 },
    (_, index) => {
      const offset = (index - ((compact ? 2 : 4) - 1) / 2) * 1.85
      return floorStop(
        `shipping-buffer:${index + 1}`,
        `Pré-embarque ${index + 1}`,
        geometry.shippingX + offset,
        geometry.frontZ - 4.3,
        0,
      )
    },
  )
  const truckStops = Array.from({ length: shippingCount }, (_, index) =>
    truckStop('truck', index, geometry.shippingX, geometry.frontZ, false),
  )

  const emptyReserve = freeLocations(locations, 'reserve')
  const occupiedReserve = occupiedLocations(locations, 'reserve')
  const occupiedPicking = occupiedLocations(locations, 'picking')
  const reserveStops = emptyReserve.map((location, index) =>
    rackStop(layout, location, `Reserva ${location.address || index + 1}`),
  )
  const outboundStops = [...occupiedPicking, ...occupiedReserve]
    .slice(0, compact ? 2 : 4)
    .map((location) => rackStop(layout, location, `${location.zone} ${location.address}`))

  const aisleAssignments: IndustrialAisleAssignment[] = aisleGroups.map(
    (group, index) => ({
      vehicleId: `EMP-${group.join('')}`,
      aisles: group,
      bufferStop: aisleBufferStops[index * 2] ?? aisleBufferStops[0],
    }),
  )

  const vehicles: FleetVehicleDefinition[] = [
    vehicle(
      'RX-REC',
      'RX 20x20 — descarga do recebimento',
      'forklift',
      ['inbound-transfer'],
      '#16a34a',
      {
        x: geometry.receivingX - 2.6,
        y: 0.2,
        z: geometry.frontZ - 1.2,
      },
      Math.PI,
      0.92,
      0,
    ),
    vehicle(
      'TP-IN',
      'Transpaleteira — distribuição para as ruas',
      'pallet-jack',
      ['inbound-transfer'],
      '#0ea5e9',
      {
        x: geometry.receivingX + 2.2,
        y: 0.2,
        z: geometry.frontZ - 5.2,
      },
      Math.PI,
      1.04,
      0.35,
    ),
    ...aisleAssignments.map((assignment, index) =>
      vehicle(
        assignment.vehicleId,
        `Empilhadeira das ruas ${assignment.aisles.join(' e ')}`,
        'forklift',
        ['putaway', 'replenishment'],
        ['#f59e0b', '#eab308', '#fb7185', '#8b5cf6'][index % 4],
        {
          x: assignment.bufferStop.access.x,
          y: 0.2,
          z: assignment.bufferStop.access.z,
        },
        assignment.bufferStop.facing,
        0.9 + (index % 2) * 0.04,
        0.55 + index * 0.2,
      ),
    ),
    vehicle(
      'RX-LOAD',
      'RX 20x20 — carregamento da expedição',
      'forklift',
      ['shipping'],
      '#0284c7',
      {
        x: geometry.shippingX + 2.6,
        y: 0.2,
        z: geometry.frontZ - 2,
      },
      Math.PI,
      0.94,
      0.6,
    ),
  ].filter((item) =>
    compact
      ? ['RX-REC', 'TP-IN', aisleAssignments[0]?.vehicleId, 'RX-LOAD'].includes(
          item.id,
        )
      : true,
  )

  const missions: FleetMission[] = []
  const initialPalletStops: Record<string, RealisticMissionStop> = {}
  const inboundPallets = Math.min(
    inboundCount,
    reserveStops.length,
    aisleBufferStops.length || 1,
  )

  for (let index = 0; index < inboundPallets; index += 1) {
    const palletId = `FLOW-IN-${String(index + 1).padStart(2, '0')}`
    const color = PALLET_COLORS[index % PALLET_COLORS.length]
    const destination = reserveStops[index]
    const aisle = destination.address?.split('-')[0] ?? aisles[index % aisles.length]
    const buffer =
      aisleBufferStops.find((stop) => stop.id === `aisle-buffer:${aisle}`) ??
      aisleBufferStops[index % Math.max(1, aisleBufferStops.length)]
    const base = index * 10

    missions.push(
      mission(layout, {
        id: `unload-${index + 1}`,
        palletId,
        color,
        role: 'inbound-transfer',
        source: inboundTruckStops[index],
        destination: dischargeStops[index],
        eligibleKinds: ['forklift'],
        priority: 0,
        sequence: base + 1,
      }),
      mission(layout, {
        id: `street-transfer-${index + 1}`,
        palletId,
        color,
        role: 'inbound-transfer',
        source: dischargeStops[index],
        destination: buffer,
        eligibleKinds: ['pallet-jack'],
        priority: 1,
        sequence: base + 2,
      }),
      mission(layout, {
        id: `street-putaway-${index + 1}`,
        palletId,
        color,
        role: 'putaway',
        source: buffer,
        destination,
        eligibleKinds: ['forklift'],
        priority: 2,
        sequence: base + 3,
      }),
    )
    initialPalletStops[palletId] = inboundTruckStops[index]
  }

  outboundStops.forEach((source, index) => {
    const palletId = `FLOW-OUT-${String(index + 1).padStart(2, '0')}`
    const color = PALLET_COLORS[(index + 4) % PALLET_COLORS.length]
    const buffer = shippingBufferStops[index % shippingBufferStops.length]
    const truck = truckStops[index % truckStops.length]
    const base = 200 + index * 10
    missions.push(
      mission(layout, {
        id: `outbound-stage-${index + 1}`,
        palletId,
        color,
        role: 'replenishment',
        source,
        destination: buffer,
        eligibleKinds: ['forklift'],
        priority: 0,
        sequence: base + 1,
      }),
      mission(layout, {
        id: `load-truck-${index + 1}`,
        palletId,
        color,
        role: 'shipping',
        source: buffer,
        destination: truck,
        eligibleKinds: ['forklift'],
        priority: 1,
        sequence: base + 2,
      }),
    )
    initialPalletStops[palletId] = source
  })

  return {
    flowKind: 'industrial',
    vehicles,
    missions,
    initialPalletStops,
    receivingStops: dischargeStops,
    stagingStops: aisleBufferStops,
    truckStops,
    inboundTruckStops,
    dischargeStops,
    aisleBufferStops,
    shippingBufferStops,
    aisleAssignments,
  }
}
