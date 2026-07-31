import {
  industrialPlanIsActive,
  type IndustrialFlowPlan,
} from './industrialFlow'
import type { WarehouseLayout } from './layout'
import { MINI_WMS_PALLETS_PER_WAVE } from './miniWms'
import {
  buildTrafficCells,
  type FleetMission,
  type RealisticFleetPlan,
} from './realisticFleet'
import type { RealisticMissionStop } from './realisticMissionQueue'
import {
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

function mission(
  input: Omit<FleetMission, 'trafficCells'>,
): FleetMission {
  return {
    ...input,
    // A reserva inicial usa uma linha simplificada. A rota real, com cabeceiras,
    // curvas e ocupação atual, é calculada pelo executor somente quando a missão
    // entra na onda ativa.
    trafficCells: buildTrafficCells([
      input.source.access,
      input.destination.access,
    ]),
  }
}

function locationPriority(
  left: WarehouseLocation,
  right: WarehouseLocation,
): number {
  return (
    (left.zone === 'picking' ? 0 : 1) -
      (right.zone === 'picking' ? 0 : 1) ||
    left.level - right.level ||
    left.position - right.position ||
    left.side.localeCompare(right.side)
  )
}

/**
 * Faz rodízio entre as ruas. Com sete ruas e ondas de seis pallets, uma mesma
 * onda nunca tenta colocar dois pallets no mesmo buffer de retirada.
 */
function movableLocations(locations: WarehouseLocation[]): WarehouseLocation[] {
  const byAisle = new Map<string, WarehouseLocation[]>()
  locations
    .filter(
      (location) =>
        location.quantity > 0 &&
        location.status !== 'blocked' &&
        Boolean(location.address),
    )
    .forEach((location) => {
      const group = byAisle.get(location.aisle) ?? []
      group.push(location)
      byAisle.set(location.aisle, group)
    })

  const aisles = [...byAisle.keys()].sort()
  aisles.forEach((aisle) => byAisle.get(aisle)?.sort(locationPriority))
  const cursors = new Map(aisles.map((aisle) => [aisle, 0]))
  const result: WarehouseLocation[] = []
  let remaining = true

  while (remaining) {
    remaining = false
    aisles.forEach((aisle) => {
      const group = byAisle.get(aisle) ?? []
      const cursor = cursors.get(aisle) ?? 0
      const next = group[cursor]
      if (!next) return
      result.push(next)
      cursors.set(aisle, cursor + 1)
      remaining = true
    })
  }

  return result
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

function expandedShippingBuffers(
  baseStops: RealisticMissionStop[],
): RealisticMissionStop[] {
  const base = baseStops[0]
  const centerResting = baseStops.reduce(
    (total, stop) => ({
      x: total.x + stop.restingPoint.x / baseStops.length,
      z: total.z + stop.restingPoint.z / baseStops.length,
    }),
    { x: 0, z: 0 },
  )
  const centerAccess = baseStops.reduce(
    (total, stop) => ({
      x: total.x + stop.access.x / baseStops.length,
      z: total.z + stop.access.z / baseStops.length,
    }),
    { x: 0, z: 0 },
  )

  return Array.from({ length: MINI_WMS_PALLETS_PER_WAVE }, (_, index) => {
    const lateral =
      (index - (MINI_WMS_PALLETS_PER_WAVE - 1) / 2) * 2.05
    const offsetX = Math.cos(base.facing) * lateral
    const offsetZ = Math.sin(base.facing) * lateral
    return {
      ...base,
      id: `pilot-shipping-buffer:${index + 1}`,
      label: `Pré-embarque exclusivo ${index + 1}`,
      access: {
        ...base.access,
        x: centerAccess.x + offsetX,
        z: centerAccess.z + offsetZ,
      },
      restingPoint: {
        ...base.restingPoint,
        x: centerResting.x + offsetX,
        z: centerResting.z + offsetZ,
      },
    }
  })
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
  const preShippingStops = expandedShippingBuffers(stops.shippingBufferStops)

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
    const wavePosition = index % MINI_WMS_PALLETS_PER_WAVE
    const preShipping = preShippingStops[wavePosition]
    const truck = stops.truckStops[wavePosition % stops.truckStops.length]
    const palletId = `OUT-${location.address}`
    const color = PALLET_COLORS[index % PALLET_COLORS.length]
    const base = index * 10

    missions.push(
      mission({
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
      mission({
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
      mission({
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
