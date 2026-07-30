import type { WarehouseLayout } from './layout'
import {
  buildTrafficCells,
  type FleetMission,
  type FleetMissionStatus,
  type FleetVehicleKind,
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

const LIVE_PALLET_COLORS = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
  '#fb7185',
  '#60a5fa',
]

export interface WarehouseBrainState {
  nextPalletNumber: number
  nextMissionNumber: number
  nextOrderNumber: number
  outboundCursor: number
  pendingOutboundPalletIds: string[]
  lastInboundAt: number
  lastOrderAt: number
  truckLoadedAt: number | null
  shippedPallets: number
}

export type WarehouseBrainAction =
  | {
      type: 'receive-pallet'
      palletId: string
      color: string
      stop: RealisticMissionStop
    }
  | {
      type: 'create-order'
      orderId: string
      palletId: string
    }
  | {
      type: 'create-mission'
      mission: FleetMission
    }
  | {
      type: 'depart-truck'
      palletIds: string[]
    }
  | { type: 'idle' }

export interface WarehouseBrainDecision {
  state: WarehouseBrainState
  action: WarehouseBrainAction
}

export interface WarehouseBrainContext {
  now: number
  compact: boolean
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticFleetPlan
  palletStops: Record<string, RealisticMissionStop | null>
  palletColors: Record<string, string>
  missions: FleetMission[]
  statuses: Record<string, FleetMissionStatus>
}

interface BrainAddressStops {
  reserve: RealisticMissionStop[]
  picking: RealisticMissionStop[]
}

export function createWarehouseBrainState(now = 0): WarehouseBrainState {
  return {
    nextPalletNumber: 1,
    nextMissionNumber: 1,
    nextOrderNumber: 1,
    outboundCursor: 0,
    pendingOutboundPalletIds: [],
    lastInboundAt: now,
    lastOrderAt: now,
    truckLoadedAt: null,
    shippedPallets: 0,
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

function preferredLocations(
  locations: WarehouseLocation[],
  zone: WarehouseLocation['zone'],
  quantity: number,
  lowestLevelOnly = false,
): WarehouseLocation[] {
  const candidates = locations.filter(
    (location) =>
      location.zone === zone &&
      location.status !== 'blocked' &&
      (!lowestLevelOnly || location.level === 1),
  )
  const empty = candidates.filter(
    (location) => location.status === 'empty' && location.quantity === 0,
  )
  const seen = new Set<string>()

  return [...empty, ...candidates]
    .filter((location) => {
      if (seen.has(location.address)) return false
      seen.add(location.address)
      return true
    })
    .slice(0, quantity)
}

function brainAddressStops(context: WarehouseBrainContext): BrainAddressStops {
  const reserveQuantity = context.compact ? 6 : 10
  const pickingQuantity = context.compact ? 3 : 6
  return {
    reserve: preferredLocations(
      context.locations,
      'reserve',
      reserveQuantity,
    ).map((location, index) =>
      rackStop(context.layout, location, `Reserva dinâmica ${index + 1}`),
    ),
    picking: preferredLocations(
      context.locations,
      'picking',
      pickingQuantity,
      true,
    ).map((location, index) =>
      rackStop(context.layout, location, `Picking dinâmico ${index + 1}`),
    ),
  }
}

function missionIsOpen(
  mission: FleetMission,
  statuses: Record<string, FleetMissionStatus>,
): boolean {
  const status = statuses[mission.id]
  return status === 'pending' || status === 'running'
}

function openMissionPalletIds(
  missions: FleetMission[],
  statuses: Record<string, FleetMissionStatus>,
): Set<string> {
  return new Set(
    missions
      .filter((mission) => missionIsOpen(mission, statuses))
      .map((mission) => mission.palletId),
  )
}

function reservedDestinationIds(
  missions: FleetMission[],
  statuses: Record<string, FleetMissionStatus>,
): Set<string> {
  return new Set(
    missions
      .filter((mission) => missionIsOpen(mission, statuses))
      .map((mission) => mission.destination.id),
  )
}

function occupiedStopIds(
  palletStops: Record<string, RealisticMissionStop | null>,
): Set<string> {
  return new Set(
    Object.values(palletStops)
      .filter((stop): stop is RealisticMissionStop => Boolean(stop))
      .map((stop) => stop.id),
  )
}

function freeStop(
  stops: RealisticMissionStop[],
  occupied: Set<string>,
  reserved: Set<string>,
): RealisticMissionStop | undefined {
  return stops.find((stop) => !occupied.has(stop.id) && !reserved.has(stop.id))
}

function stopBelongsTo(
  stop: RealisticMissionStop,
  candidates: RealisticMissionStop[],
): boolean {
  return candidates.some((candidate) => candidate.id === stop.id)
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

function createMission(
  state: WarehouseBrainState,
  layout: WarehouseLayout,
  input: {
    palletId: string
    color: string
    role: FleetMission['role']
    source: RealisticMissionStop
    destination: RealisticMissionStop
    eligibleKinds: FleetVehicleKind[]
    priority: number
  },
): { state: WarehouseBrainState; mission: FleetMission } {
  const missionNumber = state.nextMissionNumber
  const mission: FleetMission = {
    id: `brain-mission-${missionNumber}`,
    palletId: input.palletId,
    color: input.color,
    role: input.role,
    source: input.source,
    destination: input.destination,
    eligibleKinds: input.eligibleKinds,
    priority: input.priority,
    sequence: 10_000 + missionNumber,
    trafficCells: missionTrafficCells(layout, input.source, input.destination),
  }

  return {
    state: {
      ...state,
      nextMissionNumber: missionNumber + 1,
    },
    mission,
  }
}

function nextOperationalMission(
  state: WarehouseBrainState,
  context: WarehouseBrainContext,
  addressStops: BrainAddressStops,
): { state: WarehouseBrainState; mission: FleetMission } | undefined {
  const openPallets = openMissionPalletIds(context.missions, context.statuses)
  const occupied = occupiedStopIds(context.palletStops)
  const reserved = reservedDestinationIds(context.missions, context.statuses)
  const pendingOutbound = new Set(state.pendingOutboundPalletIds)
  const candidates: Array<{
    palletId: string
    color: string
    role: FleetMission['role']
    source: RealisticMissionStop
    destination: RealisticMissionStop
    eligibleKinds: FleetVehicleKind[]
    priority: number
  }> = []

  Object.entries(context.palletStops).forEach(([palletId, source]) => {
    if (!source || openPallets.has(palletId)) return
    const color = context.palletColors[palletId] ?? '#38bdf8'

    if (stopBelongsTo(source, context.plan.receivingStops)) {
      const destination = freeStop(context.plan.stagingStops, occupied, reserved)
      if (destination) {
        candidates.push({
          palletId,
          color,
          role: 'inbound-transfer',
          source,
          destination,
          eligibleKinds: ['pallet-jack'],
          priority: 1,
        })
      }
      return
    }

    if (stopBelongsTo(source, context.plan.stagingStops)) {
      const destination = freeStop(addressStops.reserve, occupied, reserved)
      if (destination) {
        candidates.push({
          palletId,
          color,
          role: 'putaway',
          source,
          destination,
          eligibleKinds: ['forklift'],
          priority: 1,
        })
      }
      return
    }

    if (pendingOutbound.has(palletId)) {
      const destination = freeStop(context.plan.truckStops, occupied, reserved)
      if (!destination) return
      const inPicking = stopBelongsTo(source, addressStops.picking)
      const inReserve = stopBelongsTo(source, addressStops.reserve)
      if (!inPicking && !inReserve) return

      candidates.push({
        palletId,
        color,
        role: 'shipping',
        source,
        destination,
        eligibleKinds: inReserve ? ['forklift'] : ['pallet-jack', 'forklift'],
        priority: 0,
      })
      return
    }

    if (!stopBelongsTo(source, addressStops.reserve)) return
    const pickingOccupancy = addressStops.picking.filter((stop) =>
      occupied.has(stop.id),
    ).length
    const pickingTarget = context.compact ? 1 : 2
    if (pickingOccupancy >= pickingTarget) return

    const destination = freeStop(addressStops.picking, occupied, reserved)
    if (destination) {
      candidates.push({
        palletId,
        color,
        role: 'replenishment',
        source,
        destination,
        eligibleKinds: ['forklift'],
        priority: 3,
      })
    }
  })

  const selected = candidates.sort(
    (left, right) =>
      left.priority - right.priority || left.palletId.localeCompare(right.palletId),
  )[0]
  return selected ? createMission(state, context.layout, selected) : undefined
}

function outboundCandidates(
  state: WarehouseBrainState,
  context: WarehouseBrainContext,
  addressStops: BrainAddressStops,
): string[] {
  const pending = new Set(state.pendingOutboundPalletIds)
  const truckStopIds = new Set(context.plan.truckStops.map((stop) => stop.id))

  return Object.entries(context.palletStops)
    .filter(([, stop]) => {
      if (!stop || truckStopIds.has(stop.id)) return false
      return (
        stopBelongsTo(stop, addressStops.reserve) ||
        stopBelongsTo(stop, addressStops.picking)
      )
    })
    .map(([palletId]) => palletId)
    .filter((palletId) => !pending.has(palletId))
    .sort()
}

function loadedTruckPalletIds(context: WarehouseBrainContext): string[] {
  const truckStopIds = new Set(context.plan.truckStops.map((stop) => stop.id))
  return Object.entries(context.palletStops)
    .filter(([, stop]) => Boolean(stop && truckStopIds.has(stop.id)))
    .map(([palletId]) => palletId)
}

export function decideWarehouseBrain(
  currentState: WarehouseBrainState,
  context: WarehouseBrainContext,
): WarehouseBrainDecision {
  let state = { ...currentState }
  const addressStops = brainAddressStops(context)
  const loadedPalletIds = loadedTruckPalletIds(context)

  if (loadedPalletIds.length > 0 && state.truckLoadedAt === null) {
    state.truckLoadedAt = context.now
  } else if (loadedPalletIds.length === 0 && state.truckLoadedAt !== null) {
    state.truckLoadedAt = null
  }

  const departureDelay = context.compact ? 14_000 : 10_000
  const minimumDepartureLoad = context.compact ? 2 : 3
  const truckIsFull = loadedPalletIds.length >= context.plan.truckStops.length
  const truckWaitExpired =
    loadedPalletIds.length >= minimumDepartureLoad &&
    state.truckLoadedAt !== null &&
    context.now - state.truckLoadedAt >= departureDelay

  if (truckIsFull || truckWaitExpired) {
    const departed = new Set(loadedPalletIds)
    return {
      state: {
        ...state,
        pendingOutboundPalletIds: state.pendingOutboundPalletIds.filter(
          (palletId) => !departed.has(palletId),
        ),
        truckLoadedAt: null,
        shippedPallets: state.shippedPallets + loadedPalletIds.length,
      },
      action: { type: 'depart-truck', palletIds: loadedPalletIds },
    }
  }

  const operationalMission = nextOperationalMission(
    state,
    context,
    addressStops,
  )
  if (operationalMission) {
    return {
      state: operationalMission.state,
      action: { type: 'create-mission', mission: operationalMission.mission },
    }
  }

  const maximumOpenOrders = context.compact ? 2 : 4
  const orderInterval = context.compact ? 7_000 : 4_800
  const candidates = outboundCandidates(state, context, addressStops)
  if (
    state.pendingOutboundPalletIds.length < maximumOpenOrders &&
    candidates.length > 0 &&
    context.now - state.lastOrderAt >= orderInterval
  ) {
    const selectedIndex = state.outboundCursor % candidates.length
    const palletId = candidates[selectedIndex]
    const orderId = `AUTO-ORDER-${String(state.nextOrderNumber).padStart(4, '0')}`
    return {
      state: {
        ...state,
        nextOrderNumber: state.nextOrderNumber + 1,
        outboundCursor: state.outboundCursor + 1,
        lastOrderAt: context.now,
        pendingOutboundPalletIds: [
          ...state.pendingOutboundPalletIds,
          palletId,
        ],
      },
      action: { type: 'create-order', orderId, palletId },
    }
  }

  const inboundInterval = context.compact ? 8_500 : 5_800
  const occupied = occupiedStopIds(context.palletStops)
  const reserved = reservedDestinationIds(context.missions, context.statuses)
  const receiving = freeStop(context.plan.receivingStops, occupied, reserved)
  const reserveHasCapacity = Boolean(
    freeStop(addressStops.reserve, occupied, reserved),
  )

  if (
    receiving &&
    reserveHasCapacity &&
    context.now - state.lastInboundAt >= inboundInterval
  ) {
    const palletNumber = state.nextPalletNumber
    const palletId = `LIVE-IN-${String(palletNumber).padStart(4, '0')}`
    const color = LIVE_PALLET_COLORS[(palletNumber - 1) % LIVE_PALLET_COLORS.length]
    return {
      state: {
        ...state,
        nextPalletNumber: palletNumber + 1,
        lastInboundAt: context.now,
      },
      action: {
        type: 'receive-pallet',
        palletId,
        color,
        stop: receiving,
      },
    }
  }

  return { state, action: { type: 'idle' } }
}
