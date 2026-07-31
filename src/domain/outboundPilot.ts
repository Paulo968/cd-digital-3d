import {
  industrialPlanIsActive,
  type IndustrialFlowPlan,
} from './industrialFlow'
import type { WarehouseLayout } from './layout'
import {
  buildTrafficCells,
  type FleetMission,
  type RealisticFleetPlan,
} from './realisticFleet'
import type { RealisticMissionStop } from './realisticMissionQueue'
import {
  buildTravelPath,
  getLocationAccessPoint,
  getLocationWorldPoint,
} from './routePlanning'
import {
  findLocationRow,
  getForkCarriageHeight,
  getPalletCenterY,
} from './warehouseGeometry'
import type { WarehouseLocation } from './warehouse'

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

export interface OutboundPilotQueue {
  missions: FleetMission[]
  initialPalletStops: Record<string, RealisticMissionStop>
  eligibleAddresses: string[]
}

function rackStop(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): RealisticMissionStop {
  const point = getLocationWorldPoint(layout, location)
  const row = findLocationRow(layout, location)
  const facing = row
    ? row.rotationY + (location.side === 'left' ? 0 : Math.PI)
    : 0

  return {
    id: `address:${location.address}`,
    kind: 'address',
    label: `${location.zone} ${location.address}`,
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

function missionTrafficCells(
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
    trafficCells: missionTrafficCells(layout, input.source, input.destination),
  }
}

function movableLocations(locations: WarehouseLocation[]): WarehouseLocation[] {
  return locations
    .filter(
      (location) =>
        location.quantity > 0 &&
        location.status !== 'blocked' &&
        Boolean(location.address),
    )
    .sort(
      (left, right) =>
        (left.zone === 'picking' ? 0 : 1) -
          (right.zone === 'picking' ? 0 : 1) ||
        left.aisle.localeCompare(right.aisle) ||
        left.level - right.level ||
        left.position - right.position,
    )
}

function industrialStops(
  plan: RealisticFleetPlan,
): Pick<
  IndustrialFlowPlan,
  'outboundAisleBufferStops' | 'shippingBufferStops' | 'truckStops'
> | null {
  if (!industrialPlanIsActive(plan)) return null
  return {
    outboundAisleBufferStops: plan.outboundAisleBufferStops,
    shippingBufferStops: plan.shippingBufferStops,
    truckStops: plan.truckStops,
  }
}

/**
 * Converte todos os pallets fisicamente ocupados em candidatos de expedição.
 *
 * O plano contém todas as posições elegíveis, porém `createMiniWmsCycle`
 * executa somente uma onda pequena por vez. Dessa forma qualquer pallet pode
 * ser retirado sem renderizar centenas de cargas e missões simultaneamente no
 * celular.
 */
export function buildOutboundPilotQueue(
  plan: RealisticFleetPlan,
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
): OutboundPilotQueue {
  const stops = industrialStops(plan)
  if (
    !stops ||
    stops.outboundAisleBufferStops.length === 0 ||
    stops.shippingBufferStops.length === 0 ||
    stops.truckStops.length === 0
  ) {
    const outboundIds = new Set(
      plan.missions
        .filter(
          (item) =>
            item.role === 'replenishment' || item.role === 'shipping',
        )
        .map((item) => item.palletId),
    )
    return {
      missions: plan.missions.filter((item) => outboundIds.has(item.palletId)),
      initialPalletStops: Object.fromEntries(
        Object.entries(plan.initialPalletStops).filter(([palletId]) =>
          outboundIds.has(palletId),
        ),
      ),
      eligibleAddresses: [],
    }
  }

  const missions: FleetMission[] = []
  const initialPalletStops: Record<string, RealisticMissionStop> = {}
  const eligibleAddresses: string[] = []

  movableLocations(locations).forEach((location, index) => {
    const source = rackStop(layout, location)
    const aisleStage =
      stops.outboundAisleBufferStops.find(
        (candidate) =>
          candidate.id === `outbound-buffer:${location.aisle}`,
      ) ??
      stops.outboundAisleBufferStops[
        index % stops.outboundAisleBufferStops.length
      ]
    const preShipping =
      stops.shippingBufferStops[index % stops.shippingBufferStops.length]
    const truck = stops.truckStops[index % stops.truckStops.length]
    const palletId = `OUT-${location.address}`
    const color = PALLET_COLORS[index % PALLET_COLORS.length]
    const base = index * 10

    missions.push(
      mission(layout, {
        id: `pilot-retrieve-${location.address}`,
        palletId,
        color,
        role: 'replenishment',
        source,
        destination: aisleStage,
        eligibleKinds: ['forklift'],
        priority: 0,
        sequence: base + 1,
      }),
      mission(layout, {
        id: `pilot-transfer-${location.address}`,
        palletId,
        color,
        role: 'replenishment',
        source: aisleStage,
        destination: preShipping,
        eligibleKinds: ['pallet-jack'],
        priority: 1,
        sequence: base + 2,
      }),
      mission(layout, {
        id: `pilot-load-${location.address}`,
        palletId,
        color,
        role: 'shipping',
        source: preShipping,
        destination: truck,
        eligibleKinds: ['forklift'],
        priority: 2,
        sequence: base + 3,
      }),
    )
    initialPalletStops[palletId] = source
    eligibleAddresses.push(location.address)
  })

  return { missions, initialPalletStops, eligibleAddresses }
}
