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

interface MetricSource {
  pallets: Record<string, OperationPalletRecord>
  orders: OperationOrderRecord[]
  missions: OperationMissionRecord[]
  vehicles: Record<string, OperationVehicleRecord>
  metrics: OperationMetrics
}

function eventId(prefix: string, at: number): string {
  return `${prefix}-${at}-${Math.random().toString(36).slice(2, 7)}`
}

function appendEvent(
  events: OperationEventRecord[],
  event: Omit<OperationEventRecord, 'id'>,
): OperationEventRecord[] {
  return [{ ...event, id: eventId(event.kind, event.at) }, ...events].slice(
    0,
    MAX_EVENTS,
  )
}

function inferZone(
  stopId: string,
  label: string,
): OperationPalletRecord['zone'] {
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
  if (normalized.includes('address:') || normalized.includes('reserva')) {
    return 'reserve'
  }
  return 'transit'
}

function recalculateMetrics(source: MetricSource): OperationMetrics {
  const metrics = { ...source.metrics }
  metrics.reserveUnits = 0
  metrics.pickingUnits = 0
  metrics.truckUnits = 0

  Object.values(source.pallets).forEach((pallet) => {
    if (pallet.zone === 'reserve') metrics.reserveUnits += pallet.units
    if (pallet.zone === 'picking') metrics.pickingUnits += pallet.units
    if (pallet.zone === 'truck') metrics.truckUnits += pallet.units
  })

  metrics.openOrders = source.orders.filter(
    (order) => order.status !== 'shipped',
  ).length
  metrics.activeMissions = source.missions.filter(
    (mission) => mission.status === 'running' || mission.status === 'waiting',
  ).length
  metrics.idleVehicles = Object.values(source.vehicles).filter(
    (vehicle) => vehicle.status === 'idle',
  ).length
  metrics.workingVehicles = Object.values(source.vehicles).filter(
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
    const status: OperationVehicleStatus = operationVehicleIsAvailable(input.id)
      ? 'idle'
      : 'unavailable'
    const vehicles: Record<string, OperationVehicleRecord> = {
      ...state.vehicles,
      [input.id]: {
        ...input,
        status,
        speed: 0,
        lastUpdatedAt: at,
        startedCurrentMission: false,
      },
    }
    return {
      vehicles,
      metrics: recalculateMetrics({ ...state, vehicles }),
    }
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
    const pallets: Record<string, OperationPalletRecord> = {
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
    const baseMetrics = {
      ...state.metrics,
      receivedPallets: state.metrics.receivedPallets + 1,
    }
    return {
      pallets,
      metrics: recalculateMetrics({ ...state, pallets, metrics: baseMetrics }),
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
    const newOrder: OperationOrderRecord = {
      id: orderId,
      palletId,
      sku: product.sku,
      quantity,
      status: 'waiting',
      createdAt: at,
      updatedAt: at,
    }
    const orders: OperationOrderRecord[] = [newOrder, ...current.orders].slice(
      0,
      MAX_ORDERS,
    )
    const pallets: Record<string, OperationPalletRecord> = current.pallets[palletId]
      ? {
          ...current.pallets,
          [palletId]: {
            ...current.pallets[palletId],
            pendingOrderId: orderId,
            updatedAt: at,
          },
        }
      : current.pallets
    const baseMetrics = {
      ...current.metrics,
      ordersCreated: current.metrics.ordersCreated + 1,
    }
    return {
      orders,
      pallets,
      metrics: recalculateMetrics({
        ...current,
        orders,
        pallets,
        metrics: baseMetrics,
      }),
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
  ensureOperationPallet(input.palletId, input.sourceId, input.sourceLabel, at)
  useOperationsControlStore.setState((state) => {
    if (state.missions.some((mission) => mission.id === input.id)) return state
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
    const missions: OperationMissionRecord[] = state.missions.map((item) =>
      item.id === missionId
        ? {
            ...item,
            status: 'running',
            vehicleId: vehicle.id,
            decisionReason: reason,
            startedAt: at,
          }
        : item,
    )
    const orders: OperationOrderRecord[] = state.orders.map((order) =>
      order.palletId === mission.palletId && order.status === 'waiting'
        ? { ...order, status: 'assigned', updatedAt: at }
        : order,
    )
    const existing = state.vehicles[vehicle.id]
    const vehicles: Record<string, OperationVehicleRecord> = {
      ...state.vehicles,
      [vehicle.id]: {
        id: vehicle.id,
        label: vehicle.label,
        kind: vehicle.kind,
        status: 'working',
        speed: existing?.speed ?? 0,
        currentMissionId: missionId,
        decisionReason: reason,
        lastUpdatedAt: at,
        startedCurrentMission: false,
      },
    }
    return {
      missions,
      vehicles,
      orders,
      metrics: recalculateMetrics({ ...state, missions, vehicles, orders }),
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

    const status: OperationVehicleStatus = !operationVehicleIsAvailable(vehicleId)
      ? 'unavailable'
      : active
        ? vehicle.status === 'fault'
          ? 'fault'
          : 'working'
        : 'idle'
    const vehicles: Record<string, OperationVehicleRecord> = {
      ...current.vehicles,
      [vehicleId]: {
        ...vehicle,
        speed: Number(speed.toFixed(2)),
        status,
        startedCurrentMission: vehicle.startedCurrentMission || active,
        lastUpdatedAt: at,
      },
    }
    return {
      vehicles,
      metrics: recalculateMetrics({ ...current, vehicles }),
    }
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

  const missions: OperationMissionRecord[] = state.missions.map((item) =>
    item.id === mission.id
      ? { ...item, status: 'completed', completedAt: at }
      : item,
  )
  const pallet = state.pallets[mission.palletId]
  const destinationZone = inferZone('', mission.destinationLabel)
  const pallets: Record<string, OperationPalletRecord> = pallet
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
  const orders: OperationOrderRecord[] = state.orders.map((order) =>
    order.palletId === mission.palletId && destinationZone === 'truck'
      ? { ...order, status: 'loading', updatedAt: at }
      : order,
  )
  const vehicles: Record<string, OperationVehicleRecord> = {
    ...state.vehicles,
    [vehicleId]: {
      ...vehicle,
      status: operationVehicleIsAvailable(vehicleId) ? 'idle' : 'unavailable',
      speed: 0,
      currentMissionId: undefined,
      decisionReason: undefined,
      startedCurrentMission: false,
      lastUpdatedAt: at,
    },
  }
  const baseMetrics = {
    ...state.metrics,
    missionsCompleted: state.metrics.missionsCompleted + 1,
    storedPallets:
      mission.role === 'putaway'
        ? state.metrics.storedPallets + 1
        : state.metrics.storedPallets,
  }
  return {
    missions,
    pallets,
    orders,
    vehicles,
    metrics: recalculateMetrics({
      ...state,
      missions,
      pallets,
      orders,
      vehicles,
      metrics: baseMetrics,
    }),
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
    const vehicles: Record<string, OperationVehicleRecord> = {
      ...state.vehicles,
      [vehicleId]: {
        ...vehicle,
        status: faulted ? 'fault' : 'working',
        lastUpdatedAt: at,
      },
    }
    const baseMetrics = faulted
      ? { ...state.metrics, vehicleFaults: state.metrics.vehicleFaults + 1 }
      : state.metrics
    return {
      vehicles,
      metrics: recalculateMetrics({
        ...state,
        vehicles,
        metrics: baseMetrics,
      }),
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
    const departedSet = new Set(palletIds)
    const loadedUnits = state.orders
      .filter(
        (order) =>
          departedSet.has(order.palletId) && order.status !== 'shipped',
      )
      .reduce((total, order) => total + order.quantity, 0)
    const fallbackUnits = palletIds.reduce(
      (total, palletId) => total + (state.pallets[palletId]?.units ?? 0),
      0,
    )
    const shippedUnits = loadedUnits > 0 ? loadedUnits : fallbackUnits
    const pallets = { ...state.pallets }
    palletIds.forEach((palletId) => delete pallets[palletId])
    const orders: OperationOrderRecord[] = state.orders.map((order) =>
      departedSet.has(order.palletId)
        ? { ...order, status: 'shipped', updatedAt: at }
        : order,
    )
    const baseMetrics = {
      ...state.metrics,
      shippedPallets: state.metrics.shippedPallets + palletIds.length,
      shippedUnits: state.metrics.shippedUnits + shippedUnits,
    }
    const queue = currentScenarioProfile().id === 'outbound-surge' ? 3 : 1
    const truck: TruckCycleState = {
      ...state.truck,
      phase: 'closing',
      loadPalletIds: palletIds,
      loadedUnits: shippedUnits,
      queue,
      changedAt: at,
    }
    return {
      pallets,
      orders,
      truck,
      metrics: recalculateMetrics({
        ...state,
        pallets,
        orders,
        metrics: baseMetrics,
      }),
      events: appendEvent(state.events, {
        at,
        kind: 'truck',
        title: `Caminhão ${state.truck.cycle} liberado`,
        detail: `${palletIds.length} pallets e ${shippedUnits} unidades preparados para saída.`,
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
    const vehicles: Record<string, OperationVehicleRecord> = Object.fromEntries(
      Object.entries(state.vehicles).map(([id, vehicle]) => [
        id,
        {
          ...vehicle,
          status: operationVehicleIsAvailable(id)
            ? vehicle.status === 'unavailable'
              ? 'idle'
              : vehicle.status
            : 'unavailable',
          lastUpdatedAt: at,
        },
      ]),
    )
    return {
      vehicles,
      metrics: recalculateMetrics({ ...state, vehicles }),
    }
  })
}
