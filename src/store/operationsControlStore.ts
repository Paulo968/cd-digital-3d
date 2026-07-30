import { create } from 'zustand'
import {
  emptyOperationMetrics,
  orderQuantity,
  palletQuantity,
  productForPallet,
  scenarioProfile,
  type OperationEventRecord,
  type OperationMetrics,
  type OperationMissionRecord,
  type OperationOrderRecord,
  type OperationPalletRecord,
  type OperationScenario,
  type OperationVehicleRecord,
  type OperationVehicleStatus,
  type TruckCyclePhase,
  type TruckCycleState,
} from '../domain/operationsControl'

const MAX_EVENTS = 80
const MAX_MISSIONS = 80
const MAX_ORDERS = 40

interface OperationsControlState {
  scenario: OperationScenario
  collapsed: boolean
  pallets: Record<string, OperationPalletRecord>
  orders: OperationOrderRecord[]
  missions: OperationMissionRecord[]
  vehicles: Record<string, OperationVehicleRecord>
  events: OperationEventRecord[]
  metrics: OperationMetrics
  truck: TruckCycleState
  safetyTokens: {
    pedestrian: number
    obstacle: number
    failure: number
  }
  setScenario: (scenario: OperationScenario) => void
  toggleCollapsed: () => void
  setCollapsed: (collapsed: boolean) => void
  triggerSafety: (kind: 'pedestrian' | 'obstacle' | 'failure') => void
  setTruckPhase: (phase: TruckCyclePhase) => void
  resetSession: () => void
}

interface MutableOperationState {
  pallets: Record<string, OperationPalletRecord>
  orders: OperationOrderRecord[]
  missions: OperationMissionRecord[]
  vehicles: Record<string, OperationVehicleRecord>
  events: OperationEventRecord[]
  metrics: OperationMetrics
  truck: TruckCycleState
}

function nowEventId(prefix: string, at: number): string {
  return `${prefix}-${at}-${Math.random().toString(36).slice(2, 7)}`
}

function appendEvent(
  events: OperationEventRecord[],
  event: Omit<OperationEventRecord, 'id'>,
): OperationEventRecord[] {
  return [
    { ...event, id: nowEventId(event.kind, event.at) },
    ...events,
  ].slice(0, MAX_EVENTS)
}

function inferZone(stopId: string, label: string): OperationPalletRecord['zone'] {
  const normalized = `${stopId} ${label}`.toLocaleLowerCase('pt-BR')
  if (normalized.includes('receiving:') || normalized.includes('recebimento')) {
    return 'receiving'
  }
  if (normalized.includes('staging:') || normalized.includes('espera')) {
    return 'staging'
  }
  if (normalized.includes('truck:') || normalized.includes('caminhão')) {
    return 'truck'
  }
  if (normalized.includes('picking')) return 'picking'
  if (normalized.includes('address:') || normalized.includes('reserva')) return 'reserve'
  return 'transit'
}

function recalculateMetrics(state: MutableOperationState): OperationMetrics {
  const metrics = { ...state.metrics }
  metrics.reserveUnits = 0
  metrics.pickingUnits = 0
  metrics.truckUnits = 0

  Object.values(state.pallets).forEach((pallet) => {
    if (pallet.zone === 'reserve') metrics.reserveUnits += pallet.units
    if (pallet.zone === 'picking') metrics.pickingUnits += pallet.units
    if (pallet.zone === 'truck') metrics.truckUnits += pallet.units
  })

  metrics.openOrders = state.orders.filter(
    (order) => order.status !== 'shipped',
  ).length
  metrics.activeMissions = state.missions.filter(
    (mission) => mission.status === 'running' || mission.status === 'waiting',
  ).length
  metrics.idleVehicles = Object.values(state.vehicles).filter(
    (vehicle) => vehicle.status === 'idle',
  ).length
  metrics.workingVehicles = Object.values(state.vehicles).filter(
    (vehicle) =>
      vehicle.status === 'working' ||
      vehicle.status === 'braking' ||
      vehicle.status === 'fault',
  ).length
  return metrics
}

function initialTruck(now = Date.now()): TruckCycleState {
  return {
    phase: 'docked',
    cycle: 1,
    loadPalletIds: [],
    loadedUnits: 0,
    queue: 1,
    changedAt: now,
  }
}

function initialState(): Pick<
  OperationsControlState,
  | 'scenario'
  | 'collapsed'
  | 'pallets'
  | 'orders'
  | 'missions'
  | 'vehicles'
  | 'events'
  | 'metrics'
  | 'truck'
  | 'safetyTokens'
> {
  return {
    scenario: 'normal',
    collapsed: false,
    pallets: {},
    orders: [],
    missions: [],
    vehicles: {},
    events: [],
    metrics: emptyOperationMetrics(),
    truck: initialTruck(),
    safetyTokens: { pedestrian: 0, obstacle: 0, failure: 0 },
  }
}

export const useOperationsControlStore = create<OperationsControlState>((set) => ({
  ...initialState(),
  setScenario: (scenario) =>
    set((state) => ({
      scenario,
      events: appendEvent(state.events, {
        at: Date.now(),
        kind: 'inventory',
        title: `Cenário: ${scenarioProfile(scenario).label}`,
        detail: scenarioProfile(scenario).description,
      }),
    })),
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),
  triggerSafety: (kind) =>
    set((state) => ({
      safetyTokens: {
        ...state.safetyTokens,
        [kind]: state.safetyTokens[kind] + 1,
      },
    })),
  setTruckPhase: (phase) =>
    set((state) => ({
      truck: { ...state.truck, phase, changedAt: Date.now() },
    })),
  resetSession: () => set(initialState()),
}))

export function currentScenarioProfile() {
  return scenarioProfile(useOperationsControlStore.getState().scenario)
}

export function operationVehicleIsAvailable(vehicleId: string): boolean {
  return !currentScenarioProfile().unavailableVehicleIds.includes(vehicleId)
}

export function registerOperationVehicle(
  input: Pick<OperationVehicleRecord, 'id' | 'label' | 'kind'>,
  at = Date.now(),
): void {
  useOperationsControlStore.setState((state) => {
    if (state.vehicles[input.id]) return state
    const vehicles = {
      ...state.vehicles,
      [input.id]: {
        ...input,
        status: operationVehicleIsAvailable(input.id) ? 'idle' : 'unavailable',
        speed: 0,
        lastUpdatedAt: at,
        startedCurrentMission: false,
      },
    }
    const mutable = { ...state, vehicles } as MutableOperationState
    return { vehicles, metrics: recalculateMetrics(mutable) }
  })
}

export function recordPalletReceived(
  palletId: string,
  stopId: string,
  stopLabel: string,
  at = Date.now(),
): { sku: string; description: string; units: number; capacity: number } {
  const product = productForPallet(palletId)
  const quantity = palletQuantity(palletId)

  useOperationsControlStore.setState((state) => {
    if (state.pallets[palletId]) return state
    const pallets = {
      ...state.pallets,
      [palletId]: {
        id: palletId,
        sku: product.sku,
        description: product.description,
        units: quantity.units,
        capacity: quantity.capacity,
        reorderPoint: quantity.reorderPoint,
        zone: inferZone(stopId, stopLabel),
        stopId,
        receivedAt: at,
        updatedAt: at,
      },
    }
    const metrics = {
      ...state.metrics,
      receivedPallets: state.metrics.receivedPallets + 1,
    }
    const mutable = { ...state, pallets, metrics } as MutableOperationState
    return {
      pallets,
      metrics: recalculateMetrics(mutable),
      events: appendEvent(state.events, {
        at,
        kind: 'receive',
        title: `${palletId} recebido`,
        detail: `${product.description} · ${quantity.units} unidades em ${stopLabel}.`,
      }),
    }
  })

  return { ...product, units: quantity.units, capacity: quantity.capacity }
}

export function ensureOperationPallet(
  palletId: string,
  stopId: string,
  stopLabel: string,
  at = Date.now(),
): void {
  if (useOperationsControlStore.getState().pallets[palletId]) return
  recordPalletReceived(palletId, stopId, stopLabel, at)
}

export function recordOperationOrder(
  orderId: string,
  palletId: string,
  at = Date.now(),
): number {
  const state = useOperationsControlStore.getState()
  const pallet = state.pallets[palletId]
  const availableUnits = pallet?.units ?? palletQuantity(palletId).units
  const quantity = orderQuantity(`${orderId}:${palletId}`, availableUnits)
  const product = pallet ?? {
    ...productForPallet(palletId),
    units: availableUnits,
  }

  useOperationsControlStore.setState((current) => {
    if (current.orders.some((order) => order.id === orderId)) return current
    const orders: OperationOrderRecord[] = [
      {
        id: orderId,
        palletId,
        sku: product.sku,
        quantity,
        status: 'waiting',
        createdAt: at,
        updatedAt: at,
      },
      ...current.orders,
    ].slice(0, MAX_ORDERS)
    const pallets = current.pallets[palletId]
      ? {
          ...current.pallets,
          [palletId]: {
            ...current.pallets[palletId],
            pendingOrderId: orderId,
            updatedAt: at,
          },
        }
      : current.pallets
    const metrics = {
      ...current.metrics,
      ordersCreated: current.metrics.ordersCreated + 1,
    }
    const mutable = { ...current, orders, pallets, metrics } as MutableOperationState
    return {
      orders,
      pallets,
      metrics: recalculateMetrics(mutable),
      events: appendEvent(current.events, {
        at,
        kind: 'order',
        title: `${orderId} criado`,
        detail: `${quantity} unidades do SKU ${product.sku} reservadas no ${palletId}.`,
      }),
    }
  })

  return quantity
}

export function recordOperationMission(
  input: {
    id: string
    palletId: string
    role: string
    sourceId: string
    sourceLabel: string
    destinationId: string
    destinationLabel: string
  },
  at = Date.now(),
): void {
  useOperationsControlStore.setState((state) => {
    if (state.missions.some((mission) => mission.id === input.id)) return state
    ensureOperationPallet(input.palletId, input.sourceId, input.sourceLabel, at)
    const mission: OperationMissionRecord = {
      id: input.id,
      palletId: input.palletId,
      role: input.role,
      sourceLabel: input.sourceLabel,
      destinationLabel: input.destinationLabel,
      status: 'queued',
      createdAt: at,
    }
    return {
      missions: [mission, ...state.missions].slice(0, MAX_MISSIONS),
      events: appendEvent(state.events, {
        at,
        kind: 'mission',
        title: `Missão ${input.id} criada`,
        detail: `${input.palletId}: ${input.sourceLabel} → ${input.destinationLabel}.`,
      }),
    }
  })
}

export function assignOperationMission(
  vehicle: { id: string; label: string; kind: 'forklift' | 'pallet-jack' },
  missionId: string,
  reason: string,
  at = Date.now(),
): void {
  registerOperationVehicle(vehicle, at)
  useOperationsControlStore.setState((state) => {
    const mission = state.missions.find((item) => item.id === missionId)
    if (!mission || mission.status === 'running') return state
    const missions = state.missions.map((item) =>
      item.id === missionId
        ? {
            ...item,
            status: 'running' as const,
            vehicleId: vehicle.id,
            decisionReason: reason,
            startedAt: at,
          }
        : item,
    )
    const orders = state.orders.map((order) =>
      order.palletId === mission.palletId && order.status === 'waiting'
        ? { ...order, status: 'assigned' as const, updatedAt: at }
        : order,
    )
    const vehicles = {
      ...state.vehicles,
      [vehicle.id]: {
        ...state.vehicles[vehicle.id],
        label: vehicle.label,
        kind: vehicle.kind,
        status: 'working' as const,
        currentMissionId: missionId,
        decisionReason: reason,
        lastUpdatedAt: at,
        startedCurrentMission: false,
      },
    }
    const mutable = { ...state, missions, vehicles, orders } as MutableOperationState
    return {
      missions,
      vehicles,
      orders,
      metrics: recalculateMetrics(mutable),
      events: appendEvent(state.events, {
        at,
        kind: 'vehicle',
        title: `${vehicle.id} designada`,
        detail: reason,
      }),
    }
  })
}

const vehiclePublishAt = new Map<string, number>()

export function publishOperationVehicleRuntime(
  vehicleId: string,
  speed: number,
  active: boolean,
  at = Date.now(),
): void {
  const previousAt = vehiclePublishAt.get(vehicleId) ?? 0
  const state = useOperationsControlStore.getState()
  const previous = state.vehicles[vehicleId]
  const shouldComplete = Boolean(
    previous?.currentMissionId && previous.startedCurrentMission && !active,
  )
  if (!shouldComplete && active && at - previousAt < 300) return
  vehiclePublishAt.set(vehicleId, at)

  useOperationsControlStore.setState((current) => {
    const vehicle = current.vehicles[vehicleId]
    if (!vehicle) return current

    if (vehicle.currentMissionId && vehicle.startedCurrentMission && !active) {
      return completeMissionState(current, vehicleId, at)
    }

    const unavailable = !operationVehicleIsAvailable(vehicleId)
    const status: OperationVehicleStatus = unavailable
      ? 'unavailable'
      : active
        ? vehicle.status === 'fault'
          ? 'fault'
          : 'working'
        : 'idle'
    const vehicles = {
      ...current.vehicles,
      [vehicleId]: {
        ...vehicle,
        speed: Number(speed.toFixed(2)),
        status,
        startedCurrentMission: vehicle.startedCurrentMission || active,
        lastUpdatedAt: at,
      },
    }
    const mutable = { ...current, vehicles } as MutableOperationState
    return { vehicles, metrics: recalculateMetrics(mutable) }
  })
}

function completeMissionState(
  state: OperationsControlState,
  vehicleId: string,
  at: number,
): Partial<OperationsControlState> {
  const vehicle = state.vehicles[vehicleId]
  const missionId = vehicle?.currentMissionId
  const mission = state.missions.find((item) => item.id === missionId)
  if (!vehicle || !mission) return state

  const missions = state.missions.map((item) =>
    item.id === mission.id
      ? { ...item, status: 'completed' as const, completedAt: at }
      : item,
  )
  const pallet = state.pallets[mission.palletId]
  const destinationZone = inferZone('', mission.destinationLabel)
  const pallets = pallet
    ? {
        ...state.pallets,
        [mission.palletId]: {
          ...pallet,
          zone: destinationZone,
          stopId: mission.destinationLabel,
          updatedAt: at,
        },
      }
    : state.pallets
  const orders = state.orders.map((order) =>
    order.palletId === mission.palletId && destinationZone === 'truck'
      ? { ...order, status: 'loading' as const, updatedAt: at }
      : order,
  )
  const vehicles = {
    ...state.vehicles,
    [vehicleId]: {
      ...vehicle,
      status: operationVehicleIsAvailable(vehicleId)
        ? ('idle' as const)
        : ('unavailable' as const),
      speed: 0,
      currentMissionId: undefined,
      decisionReason: undefined,
      startedCurrentMission: false,
      lastUpdatedAt: at,
    },
  }
  const metrics = {
    ...state.metrics,
    missionsCompleted: state.metrics.missionsCompleted + 1,
    storedPallets:
      mission.role === 'putaway'
        ? state.metrics.storedPallets + 1
        : state.metrics.storedPallets,
  }
  const mutable = {
    ...state,
    missions,
    pallets,
    orders,
    vehicles,
    metrics,
  } as MutableOperationState
  return {
    missions,
    pallets,
    orders,
    vehicles,
    metrics: recalculateMetrics(mutable),
    events: appendEvent(state.events, {
      at,
      kind: 'mission',
      title: `Missão ${mission.id} concluída`,
      detail: `${vehicleId} entregou ${mission.palletId} em ${mission.destinationLabel}.`,
    }),
  }
}

export function setOperationVehicleFault(
  vehicleId: string,
  faulted: boolean,
  at = Date.now(),
): void {
  useOperationsControlStore.setState((state) => {
    const vehicle = state.vehicles[vehicleId]
    if (!vehicle) return state
    const vehicles = {
      ...state.vehicles,
      [vehicleId]: {
        ...vehicle,
        status: faulted ? ('fault' as const) : ('working' as const),
        lastUpdatedAt: at,
      },
    }
    const metrics = faulted
      ? { ...state.metrics, vehicleFaults: state.metrics.vehicleFaults + 1 }
      : state.metrics
    const mutable = { ...state, vehicles, metrics } as MutableOperationState
    return {
      vehicles,
      metrics: recalculateMetrics(mutable),
      events: faulted
        ? appendEvent(state.events, {
            at,
            kind: 'safety',
            title: `${vehicleId} em avaria`,
            detail: 'Frenagem emergencial e giroflex ativados; missão preservada.',
          })
        : state.events,
    }
  })
}

export function recordSafetyEvent(
  title: string,
  detail: string,
  at = Date.now(),
): void {
  useOperationsControlStore.setState((state) => ({
    metrics: {
      ...state.metrics,
      safetyStops: state.metrics.safetyStops + 1,
    },
    events: appendEvent(state.events, {
      at,
      kind: 'safety',
      title,
      detail,
    }),
  }))
}

export function recordTruckDeparture(
  palletIds: string[],
  at = Date.now(),
): void {
  useOperationsControlStore.setState((state) => {
    const departing = palletIds
      .map((palletId) => state.pallets[palletId])
      .filter((pallet): pallet is OperationPalletRecord => Boolean(pallet))
    const loadedUnits = departing.reduce((total, pallet) => total + pallet.units, 0)
    const departedSet = new Set(palletIds)
    const pallets = { ...state.pallets }
    palletIds.forEach((palletId) => delete pallets[palletId])
    const orders = state.orders.map((order) =>
      departedSet.has(order.palletId)
        ? { ...order, status: 'shipped' as const, updatedAt: at }
        : order,
    )
    const metrics = {
      ...state.metrics,
      shippedPallets: state.metrics.shippedPallets + palletIds.length,
      shippedUnits: state.metrics.shippedUnits + loadedUnits,
    }
    const queueBase = currentScenarioProfile().id === 'outbound-surge' ? 3 : 1
    const truck: TruckCycleState = {
      ...state.truck,
      phase: 'closing',
      loadPalletIds: palletIds,
      loadedUnits,
      queue: queueBase,
      changedAt: at,
    }
    const mutable = { ...state, pallets, orders, metrics, truck } as MutableOperationState
    return {
      pallets,
      orders,
      truck,
      metrics: recalculateMetrics(mutable),
      events: appendEvent(state.events, {
        at,
        kind: 'truck',
        title: `Caminhão ${state.truck.cycle} liberado`,
        detail: `${palletIds.length} pallets e ${loadedUnits} unidades preparados para saída.`,
      }),
    }
  })
}

export function completeTruckCycle(at = Date.now()): void {
  useOperationsControlStore.setState((state) => ({
    truck: {
      phase: 'docked',
      cycle: state.truck.cycle + 1,
      loadPalletIds: [],
      loadedUnits: 0,
      queue: Math.max(1, state.truck.queue - 1),
      changedAt: at,
    },
    events: appendEvent(state.events, {
      at,
      kind: 'truck',
      title: `Caminhão ${state.truck.cycle + 1} na doca`,
      detail: 'Nova carroceria disponível para o próximo ciclo de expedição.',
    }),
  }))
}

export function syncUnavailableVehicles(at = Date.now()): void {
  useOperationsControlStore.setState((state) => {
    const vehicles = Object.fromEntries(
      Object.entries(state.vehicles).map(([id, vehicle]) => [
        id,
        {
          ...vehicle,
          status: operationVehicleIsAvailable(id)
            ? vehicle.status === 'unavailable'
              ? ('idle' as const)
              : vehicle.status
            : ('unavailable' as const),
          lastUpdatedAt: at,
        },
      ]),
    )
    const mutable = { ...state, vehicles } as MutableOperationState
    return { vehicles, metrics: recalculateMetrics(mutable) }
  })
}
