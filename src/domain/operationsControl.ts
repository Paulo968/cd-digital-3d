export type OperationScenario =
  | 'normal'
  | 'high-demand'
  | 'inbound-surge'
  | 'outbound-surge'
  | 'blocked-aisle'
  | 'equipment-failure'
  | 'picking-shortage'
  | 'reduced-fleet'

export type OperationZone =
  | 'receiving'
  | 'staging'
  | 'reserve'
  | 'picking'
  | 'truck'
  | 'transit'
  | 'shipped'

export type OperationOrderStatus =
  | 'waiting'
  | 'assigned'
  | 'loading'
  | 'shipped'

export type OperationMissionStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'waiting'

export type OperationVehicleStatus =
  | 'idle'
  | 'working'
  | 'braking'
  | 'fault'
  | 'unavailable'

export type TruckCyclePhase =
  | 'approaching'
  | 'docked'
  | 'closing'
  | 'departing'
  | 'away'

export interface ScenarioProfile {
  id: OperationScenario
  label: string
  description: string
  inboundIntervalMultiplier: number
  orderIntervalMultiplier: number
  maxOpenOrdersMultiplier: number
  pickingTargetMultiplier: number
  departureDelayMultiplier: number
  unavailableVehicleIds: string[]
  persistentObstacle: boolean
  frequentBreakdown: boolean
}

export interface OperationPalletRecord {
  id: string
  sku: string
  description: string
  units: number
  capacity: number
  reorderPoint: number
  zone: OperationZone
  stopId: string
  pendingOrderId?: string
  receivedAt: number
  updatedAt: number
}

export interface OperationOrderRecord {
  id: string
  palletId: string
  sku: string
  quantity: number
  status: OperationOrderStatus
  createdAt: number
  updatedAt: number
}

export interface OperationMissionRecord {
  id: string
  palletId: string
  role: string
  sourceLabel: string
  destinationLabel: string
  status: OperationMissionStatus
  vehicleId?: string
  decisionReason?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export interface OperationVehicleRecord {
  id: string
  label: string
  kind: 'forklift' | 'pallet-jack'
  status: OperationVehicleStatus
  speed: number
  currentMissionId?: string
  decisionReason?: string
  lastUpdatedAt: number
  startedCurrentMission: boolean
}

export interface OperationEventRecord {
  id: string
  at: number
  kind:
    | 'receive'
    | 'order'
    | 'mission'
    | 'vehicle'
    | 'safety'
    | 'truck'
    | 'inventory'
  title: string
  detail: string
}

export interface TruckCycleState {
  phase: TruckCyclePhase
  cycle: number
  loadPalletIds: string[]
  loadedUnits: number
  queue: number
  changedAt: number
}

export interface OperationMetrics {
  receivedPallets: number
  storedPallets: number
  shippedPallets: number
  shippedUnits: number
  ordersCreated: number
  missionsCompleted: number
  safetyStops: number
  vehicleFaults: number
  reserveUnits: number
  pickingUnits: number
  truckUnits: number
  openOrders: number
  activeMissions: number
  idleVehicles: number
  workingVehicles: number
}

export const PRODUCT_CATALOG = [
  { sku: '10001', description: 'Arroz tipo 1 — pacote 5 kg' },
  { sku: '10002', description: 'Feijão carioca — pacote 1 kg' },
  { sku: '10003', description: 'Óleo de soja — 900 ml' },
  { sku: '10004', description: 'Açúcar cristal — pacote 5 kg' },
  { sku: '10005', description: 'Café torrado e moído — 500 g' },
  { sku: '10006', description: 'Macarrão espaguete — 500 g' },
  { sku: '10007', description: 'Leite integral — 1 L' },
  { sku: '10008', description: 'Farinha de trigo — 1 kg' },
] as const

export const SCENARIO_PROFILES: Record<OperationScenario, ScenarioProfile> = {
  normal: {
    id: 'normal',
    label: 'Operação normal',
    description: 'Fluxo equilibrado de entrada, armazenagem, reposição e pedidos.',
    inboundIntervalMultiplier: 1,
    orderIntervalMultiplier: 1,
    maxOpenOrdersMultiplier: 1,
    pickingTargetMultiplier: 1,
    departureDelayMultiplier: 1,
    unavailableVehicleIds: [],
    persistentObstacle: false,
    frequentBreakdown: false,
  },
  'high-demand': {
    id: 'high-demand',
    label: 'Alta demanda',
    description: 'Pedidos acelerados e maior pressão sobre picking e expedição.',
    inboundIntervalMultiplier: 0.86,
    orderIntervalMultiplier: 0.42,
    maxOpenOrdersMultiplier: 1.8,
    pickingTargetMultiplier: 1.4,
    departureDelayMultiplier: 0.75,
    unavailableVehicleIds: [],
    persistentObstacle: false,
    frequentBreakdown: false,
  },
  'inbound-surge': {
    id: 'inbound-surge',
    label: 'Recebimento intenso',
    description: 'Chegadas mais frequentes e pressão sobre espera e reserva.',
    inboundIntervalMultiplier: 0.36,
    orderIntervalMultiplier: 1.25,
    maxOpenOrdersMultiplier: 0.8,
    pickingTargetMultiplier: 1,
    departureDelayMultiplier: 1.1,
    unavailableVehicleIds: [],
    persistentObstacle: false,
    frequentBreakdown: false,
  },
  'outbound-surge': {
    id: 'outbound-surge',
    label: 'Expedição intensa',
    description: 'Pedidos e partidas de caminhão acontecem em ritmo acelerado.',
    inboundIntervalMultiplier: 1.2,
    orderIntervalMultiplier: 0.34,
    maxOpenOrdersMultiplier: 2,
    pickingTargetMultiplier: 1.2,
    departureDelayMultiplier: 0.48,
    unavailableVehicleIds: [],
    persistentObstacle: false,
    frequentBreakdown: false,
  },
  'blocked-aisle': {
    id: 'blocked-aisle',
    label: 'Corredor bloqueado',
    description: 'Uma barreira permanece ativa e força frenagem e espera no corredor.',
    inboundIntervalMultiplier: 1,
    orderIntervalMultiplier: 0.85,
    maxOpenOrdersMultiplier: 1.2,
    pickingTargetMultiplier: 1,
    departureDelayMultiplier: 1,
    unavailableVehicleIds: [],
    persistentObstacle: true,
    frequentBreakdown: false,
  },
  'equipment-failure': {
    id: 'equipment-failure',
    label: 'Falha de equipamento',
    description: 'Avarias temporárias acontecem com maior frequência durante o fluxo.',
    inboundIntervalMultiplier: 1,
    orderIntervalMultiplier: 0.8,
    maxOpenOrdersMultiplier: 1.3,
    pickingTargetMultiplier: 1,
    departureDelayMultiplier: 1,
    unavailableVehicleIds: [],
    persistentObstacle: false,
    frequentBreakdown: true,
  },
  'picking-shortage': {
    id: 'picking-shortage',
    label: 'Ruptura no picking',
    description: 'O ponto de reposição sobe e o reabastecimento recebe mais prioridade.',
    inboundIntervalMultiplier: 0.95,
    orderIntervalMultiplier: 0.58,
    maxOpenOrdersMultiplier: 1.5,
    pickingTargetMultiplier: 1.85,
    departureDelayMultiplier: 0.9,
    unavailableVehicleIds: [],
    persistentObstacle: false,
    frequentBreakdown: false,
  },
  'reduced-fleet': {
    id: 'reduced-fleet',
    label: 'Equipe reduzida',
    description: 'EMP-02 e TP-02 ficam indisponíveis para revelar filas e gargalos.',
    inboundIntervalMultiplier: 0.9,
    orderIntervalMultiplier: 0.75,
    maxOpenOrdersMultiplier: 1.4,
    pickingTargetMultiplier: 1,
    departureDelayMultiplier: 1.2,
    unavailableVehicleIds: ['EMP-02', 'TP-02'],
    persistentObstacle: false,
    frequentBreakdown: false,
  },
}

export function scenarioProfile(scenario: OperationScenario): ScenarioProfile {
  return SCENARIO_PROFILES[scenario]
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function productForPallet(palletId: string) {
  return PRODUCT_CATALOG[hashText(palletId) % PRODUCT_CATALOG.length]
}

export function palletQuantity(palletId: string): {
  units: number
  capacity: number
  reorderPoint: number
} {
  const hash = hashText(palletId)
  const capacity = 96 + (hash % 5) * 12
  const units = Math.min(capacity, 58 + (hash % 63))
  return {
    units,
    capacity,
    reorderPoint: Math.max(18, Math.round(capacity * 0.28)),
  }
}

export function orderQuantity(palletId: string, availableUnits: number): number {
  const requested = 8 + (hashText(`order:${palletId}`) % 27)
  return Math.max(1, Math.min(availableUnits, requested))
}

export function zoneFromStopId(stopId: string): OperationZone {
  if (stopId.startsWith('receiving:')) return 'receiving'
  if (stopId.startsWith('staging:')) return 'staging'
  if (stopId.startsWith('truck:')) return 'truck'
  if (stopId.startsWith('address:')) return 'reserve'
  return 'transit'
}

export function emptyOperationMetrics(): OperationMetrics {
  return {
    receivedPallets: 0,
    storedPallets: 0,
    shippedPallets: 0,
    shippedUnits: 0,
    ordersCreated: 0,
    missionsCompleted: 0,
    safetyStops: 0,
    vehicleFaults: 0,
    reserveUnits: 0,
    pickingUnits: 0,
    truckUnits: 0,
    openOrders: 0,
    activeMissions: 0,
    idleVehicles: 0,
    workingVehicles: 0,
  }
}
