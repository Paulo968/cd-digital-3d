import type { WarehouseLayout } from './layout'
import {
  industrialPlanIsActive,
  type IndustrialFlowPlan,
} from './industrialFlow'
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
import {
  currentScenarioProfile,
  recordOperationMission,
  recordOperationOrder,
  recordPalletReceived,
  recordTruckDeparture,
  useOperationsControlStore,
} from '../store/operationsControlStore'

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
      quantity?: number
    }
  | { type: 'create-mission'; mission: FleetMission }
  | { type: 'depart-truck'; palletIds: string[] }
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

interface AddressStops {
  reserve: RealisticMissionStop[]
  picking: RealisticMissionStop[]
}

interface MissionCandidate {
  palletId: string
  color: string
  role: FleetMission['role']
  source: RealisticMissionStop
  destination: RealisticMissionStop
  eligibleKinds: FleetVehicleKind[]
  priority: number
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

function addressStops(context: WarehouseBrainContext): AddressStops {
  const reserveLimit = context.compact ? 8 : 18
  const pickingLimit = context.compact ? 4 : 10
  const usable = (zone: WarehouseLocation['zone'], lowestOnly = false) =>
    context.locations
      .filter(
        (location) =>
          location.zone === zone &&
          location.status !== 'blocked' &&
          (!lowestOnly || location.level === 1),
      )
      .sort(
        (left, right) =>
          left.aisle.localeCompare(right.aisle) ||
          left.level - right.level ||
          left.position - right.position,
      )

  return {
    reserve: usable('reserve')
      .slice(0, reserveLimit)
      .map((location) =>
        rackStop(context.layout, location, `Reserva ${location.address}`),
      ),
    picking: usable('picking', true)
      .slice(0, pickingLimit)
      .map((location) =>
        rackStop(context.layout, location, `Picking ${location.address}`),
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

function openPalletIds(context: WarehouseBrainContext): Set<string> {
  return new Set(
    context.missions
      .filter((mission) => missionIsOpen(mission, context.statuses))
      .map((mission) => mission.palletId),
  )
}

function occupiedStopIds(context: WarehouseBrainContext): Set<string> {
  return new Set(
    Object.values(context.palletStops)
      .filter((stop): stop is RealisticMissionStop => Boolean(stop))
      .map((stop) => stop.id),
  )
}

function reservedDestinationIds(context: WarehouseBrainContext): Set<string> {
  return new Set(
    context.missions
      .filter((mission) => missionIsOpen(mission, context.statuses))
      .map((mission) => mission.destination.id),
  )
}

function freeStop(
  stops: RealisticMissionStop[],
  occupied: Set<string>,
  reserved: Set<string>,
  predicate: (stop: RealisticMissionStop) => boolean = () => true,
): RealisticMissionStop | undefined {
  return stops.find(
    (stop) =>
      predicate(stop) && !occupied.has(stop.id) && !reserved.has(stop.id),
  )
}

function belongs(
  stop: RealisticMissionStop,
  candidates: RealisticMissionStop[],
): boolean {
  return candidates.some((candidate) => candidate.id === stop.id)
}

function aisleFromStop(stop: RealisticMissionStop): string | null {
  if (stop.address) return stop.address.split('-')[0] ?? null
  return (
    stop.id.match(/(?:aisle|outbound)-buffer:([A-Za-z0-9]+)/)?.[1] ?? null
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

function createMission(
  state: WarehouseBrainState,
  context: WarehouseBrainContext,
  input: MissionCandidate,
): { state: WarehouseBrainState; mission: FleetMission } {
  const number = state.nextMissionNumber
  const mission: FleetMission = {
    id: `brain-mission-${number}`,
    palletId: input.palletId,
    color: input.color,
    role: input.role,
    source: input.source,
    destination: input.destination,
    eligibleKinds: input.eligibleKinds,
    priority: input.priority,
    sequence: 10_000 + number,
    trafficCells: trafficCells(context.layout, input.source, input.destination),
  }

  recordOperationMission({
    id: mission.id,
    palletId: mission.palletId,
    role: mission.role,
    sourceId: mission.source.id,
    sourceLabel: mission.source.label,
    destinationId: mission.destination.id,
    destinationLabel: mission.destination.label,
  })

  return {
    state: { ...state, nextMissionNumber: number + 1 },
    mission,
  }
}

function quantitativePickingUnits(): number {
  const operation = useOperationsControlStore.getState()
  const tracked = Object.values(operation.pallets).some(
    (pallet) => pallet.zone === 'picking',
  )
  return tracked ? operation.metrics.pickingUnits : Number.POSITIVE_INFINITY
}

function pushCandidate(
  candidates: MissionCandidate[],
  palletId: string,
  color: string,
  role: FleetMission['role'],
  source: RealisticMissionStop,
  destination: RealisticMissionStop | undefined,
  eligibleKinds: FleetVehicleKind[],
  priority: number,
): boolean {
  if (!destination) return false
  candidates.push({
    palletId,
    color,
    role,
    source,
    destination,
    eligibleKinds,
    priority,
  })
  return true
}

function industrialCandidate(
  state: WarehouseBrainState,
  context: WarehouseBrainContext,
  addresses: AddressStops,
  plan: IndustrialFlowPlan,
): MissionCandidate | undefined {
  const occupied = occupiedStopIds(context)
  const reserved = reservedDestinationIds(context)
  const openPallets = openPalletIds(context)
  const outbound = new Set(state.pendingOutboundPalletIds)
  const profile = currentScenarioProfile()
  const candidates: MissionCandidate[] = []

  Object.entries(context.palletStops).forEach(([palletId, source]) => {
    if (!source || openPallets.has(palletId)) return
    const color = context.palletColors[palletId] ?? '#38bdf8'

    if (belongs(source, plan.inboundTruckStops)) {
      pushCandidate(
        candidates,
        palletId,
        color,
        'inbound-transfer',
        source,
        freeStop(plan.dischargeStops, occupied, reserved),
        ['forklift'],
        0,
      )
      return
    }

    if (belongs(source, plan.dischargeStops)) {
      pushCandidate(
        candidates,
        palletId,
        color,
        'inbound-transfer',
        source,
        freeStop(plan.aisleBufferStops, occupied, reserved),
        ['pallet-jack'],
        1,
      )
      return
    }

    if (belongs(source, plan.aisleBufferStops)) {
      const aisle = aisleFromStop(source)
      pushCandidate(
        candidates,
        palletId,
        color,
        'putaway',
        source,
        freeStop(
          addresses.reserve,
          occupied,
          reserved,
          (stop) => !aisle || aisleFromStop(stop) === aisle,
        ),
        ['forklift'],
        2,
      )
      return
    }

    if (belongs(source, plan.outboundAisleBufferStops)) {
      pushCandidate(
        candidates,
        palletId,
        color,
        'replenishment',
        source,
        freeStop(plan.shippingBufferStops, occupied, reserved),
        ['pallet-jack'],
        0,
      )
      return
    }

    if (belongs(source, plan.shippingBufferStops)) {
      pushCandidate(
        candidates,
        palletId,
        color,
        'shipping',
        source,
        freeStop(plan.truckStops, occupied, reserved),
        ['forklift'],
        0,
      )
      return
    }

    const inReserve = belongs(source, addresses.reserve)
    const inPicking = belongs(source, addresses.picking)
    if (outbound.has(palletId) && (inReserve || inPicking)) {
      const aisle = aisleFromStop(source)
      pushCandidate(
        candidates,
        palletId,
        color,
        'replenishment',
        source,
        freeStop(
          plan.outboundAisleBufferStops,
          occupied,
          reserved,
          (stop) => !aisle || aisleFromStop(stop) === aisle,
        ),
        ['forklift'],
        0,
      )
      return
    }

    if (!inReserve) return
    const pickingOccupancy = addresses.picking.filter((stop) =>
      occupied.has(stop.id),
    ).length
    const baseTarget = context.compact ? 1 : 2
    const target = Math.min(
      addresses.picking.length,
      Math.max(1, Math.ceil(baseTarget * profile.pickingTargetMultiplier)),
    )
    if (
      pickingOccupancy >= target &&
      quantitativePickingUnits() >= target * 72
    ) {
      return
    }
    pushCandidate(
      candidates,
      palletId,
      color,
      'replenishment',
      source,
      freeStop(addresses.picking, occupied, reserved),
      ['forklift'],
      profile.id === 'picking-shortage' ? 0 : 4,
    )
  })

  return candidates.sort(
    (left, right) =>
      left.priority - right.priority ||
      left.palletId.localeCompare(right.palletId),
  )[0]
}

function legacyCandidate(
  state: WarehouseBrainState,
  context: WarehouseBrainContext,
  addresses: AddressStops,
): MissionCandidate | undefined {
  const occupied = occupiedStopIds(context)
  const reserved = reservedDestinationIds(context)
  const openPallets = openPalletIds(context)
  const outbound = new Set(state.pendingOutboundPalletIds)
  const profile = currentScenarioProfile()
  const candidates: MissionCandidate[] = []

  Object.entries(context.palletStops).forEach(([palletId, source]) => {
    if (!source || openPallets.has(palletId)) return
    const color = context.palletColors[palletId] ?? '#38bdf8'

    if (belongs(source, context.plan.receivingStops)) {
      pushCandidate(
        candidates,
        palletId,
        color,
        'inbound-transfer',
        source,
        freeStop(context.plan.stagingStops, occupied, reserved),
        ['pallet-jack'],
        1,
      )
      return
    }

    if (belongs(source, context.plan.stagingStops)) {
      pushCandidate(
        candidates,
        palletId,
        color,
        'putaway',
        source,
        freeStop(addresses.reserve, occupied, reserved),
        ['forklift'],
        1,
      )
      return
    }

    const inReserve = belongs(source, addresses.reserve)
    const inPicking = belongs(source, addresses.picking)
    if (outbound.has(palletId) && (inReserve || inPicking)) {
      pushCandidate(
        candidates,
        palletId,
        color,
        'shipping',
        source,
        freeStop(context.plan.truckStops, occupied, reserved),
        inReserve ? ['forklift'] : ['pallet-jack', 'forklift'],
        0,
      )
      return
    }

    if (!inReserve) return
    const pickingOccupancy = addresses.picking.filter((stop) =>
      occupied.has(stop.id),
    ).length
    const target = context.compact ? 1 : 2
    if (
      pickingOccupancy >= target &&
      quantitativePickingUnits() >= target * 72
    ) {
      return
    }
    pushCandidate(
      candidates,
      palletId,
      color,
      'replenishment',
      source,
      freeStop(addresses.picking, occupied, reserved),
      ['forklift'],
      profile.id === 'picking-shortage' ? 0 : 3,
    )
  })

  return candidates.sort(
    (left, right) =>
      left.priority - right.priority ||
      left.palletId.localeCompare(right.palletId),
  )[0]
}

function outboundCandidates(
  state: WarehouseBrainState,
  context: WarehouseBrainContext,
  addresses: AddressStops,
): string[] {
  const pending = new Set(state.pendingOutboundPalletIds)
  const truckIds = new Set(context.plan.truckStops.map((stop) => stop.id))
  const bufferIds = industrialPlanIsActive(context.plan)
    ? new Set([
        ...context.plan.outboundAisleBufferStops.map((stop) => stop.id),
        ...context.plan.shippingBufferStops.map((stop) => stop.id),
      ])
    : new Set<string>()

  return Object.entries(context.palletStops)
    .filter(([, stop]) => {
      if (!stop || truckIds.has(stop.id) || bufferIds.has(stop.id)) return false
      return belongs(stop, addresses.reserve) || belongs(stop, addresses.picking)
    })
    .map(([palletId]) => palletId)
    .filter((palletId) => !pending.has(palletId))
    .sort()
}

function loadedPalletIds(context: WarehouseBrainContext): string[] {
  const truckIds = new Set(context.plan.truckStops.map((stop) => stop.id))
  return Object.entries(context.palletStops)
    .filter(([, stop]) => Boolean(stop && truckIds.has(stop.id)))
    .map(([palletId]) => palletId)
}

function hasOpenLoading(context: WarehouseBrainContext): boolean {
  const truckIds = new Set(context.plan.truckStops.map((stop) => stop.id))
  return context.missions.some(
    (mission) =>
      mission.role === 'shipping' &&
      truckIds.has(mission.destination.id) &&
      missionIsOpen(mission, context.statuses),
  )
}

export function decideWarehouseBrain(
  currentState: WarehouseBrainState,
  context: WarehouseBrainContext,
): WarehouseBrainDecision {
  const state = { ...currentState }
  const profile = currentScenarioProfile()
  const addresses = addressStops(context)
  const loaded = loadedPalletIds(context)

  if (loaded.length > 0 && state.truckLoadedAt === null) {
    state.truckLoadedAt = context.now
  } else if (loaded.length === 0 && state.truckLoadedAt !== null) {
    state.truckLoadedAt = null
  }

  const departureDelay =
    (context.compact ? 14_000 : 10_000) * profile.departureDelayMultiplier
  const minimumLoad = context.compact ? 2 : 3
  const full = loaded.length >= context.plan.truckStops.length
  const timed =
    loaded.length >= minimumLoad &&
    state.truckLoadedAt !== null &&
    context.now - state.truckLoadedAt >= departureDelay

  if ((full || timed) && !hasOpenLoading(context)) {
    const departed = new Set(loaded)
    recordTruckDeparture(loaded, context.now)
    return {
      state: {
        ...state,
        pendingOutboundPalletIds: state.pendingOutboundPalletIds.filter(
          (palletId) => !departed.has(palletId),
        ),
        truckLoadedAt: null,
        shippedPallets: state.shippedPallets + loaded.length,
      },
      action: { type: 'depart-truck', palletIds: loaded },
    }
  }

  const candidate = industrialPlanIsActive(context.plan)
    ? industrialCandidate(state, context, addresses, context.plan)
    : legacyCandidate(state, context, addresses)
  if (candidate) {
    const created = createMission(state, context, candidate)
    return {
      state: created.state,
      action: { type: 'create-mission', mission: created.mission },
    }
  }

  const maximumOpenOrders = Math.max(
    1,
    Math.round((context.compact ? 2 : 4) * profile.maxOpenOrdersMultiplier),
  )
  const orderInterval =
    (context.compact ? 7_000 : 4_800) * profile.orderIntervalMultiplier
  const candidates = outboundCandidates(state, context, addresses)
  if (
    state.pendingOutboundPalletIds.length < maximumOpenOrders &&
    candidates.length > 0 &&
    context.now - state.lastOrderAt >= orderInterval
  ) {
    const palletId = candidates[state.outboundCursor % candidates.length]
    const orderId = `AUTO-ORDER-${String(state.nextOrderNumber).padStart(4, '0')}`
    const quantity = recordOperationOrder(orderId, palletId, context.now)
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
      action: { type: 'create-order', orderId, palletId, quantity },
    }
  }

  const inboundInterval =
    (context.compact ? 8_500 : 5_800) * profile.inboundIntervalMultiplier
  const occupied = occupiedStopIds(context)
  const reserved = reservedDestinationIds(context)
  const inboundStops = industrialPlanIsActive(context.plan)
    ? context.plan.inboundTruckStops
    : context.plan.receivingStops
  const receiving = freeStop(inboundStops, occupied, reserved)
  const reserveHasCapacity = Boolean(
    freeStop(addresses.reserve, occupied, reserved),
  )

  if (
    receiving &&
    reserveHasCapacity &&
    context.now - state.lastInboundAt >= inboundInterval
  ) {
    const palletNumber = state.nextPalletNumber
    const palletId = `LIVE-IN-${String(palletNumber).padStart(4, '0')}`
    const color = LIVE_PALLET_COLORS[(palletNumber - 1) % LIVE_PALLET_COLORS.length]
    recordPalletReceived(palletId, receiving.id, receiving.label, context.now)
    return {
      state: {
        ...state,
        nextPalletNumber: palletNumber + 1,
        lastInboundAt: context.now,
      },
      action: { type: 'receive-pallet', palletId, color, stop: receiving },
    }
  }

  return { state, action: { type: 'idle' } }
}
