export const WAREHOUSE_CONFIG = {
  aisles: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  baysPerSide: 8,
  levels: 7,
  pickingLevel: 1,
} as const

export type SlotStatus =
  | 'occupied'
  | 'empty'
  | 'blocked'
  | 'divergent'

export type ConfirmationStatus =
  | 'system-only'
  | 'physically-confirmed'
  | 'pending-check'

export type SlotSide = 'left' | 'right'
export type StorageZone = 'picking' | 'reserve'

export interface WarehouseLocation {
  address: string
  aisle: string
  bay: number
  position: number
  side: SlotSide
  level: number
  zone: StorageZone
  status: SlotStatus
  confirmation: ConfirmationStatus
  sku?: string
  description?: string
  lot?: string
  quantity: number
  capacity: number
  lastCheckedAt?: string
}

export interface WarehouseSummary {
  total: number
  occupied: number
  empty: number
  blocked: number
  divergent: number
  confirmed: number
  occupancyRate: number
}

const PRODUCTS = [
  ['10001', 'Arroz tipo 1 — pacote 5 kg'],
  ['10002', 'Feijão carioca — pacote 1 kg'],
  ['10003', 'Óleo de soja — 900 ml'],
  ['10004', 'Açúcar cristal — pacote 5 kg'],
  ['10005', 'Café torrado e moído — 500 g'],
  ['10006', 'Macarrão espaguete — 500 g'],
  ['10007', 'Leite integral — 1 L'],
  ['10008', 'Farinha de trigo — 1 kg'],
  ['10009', 'Molho de tomate — 300 g'],
  ['10010', 'Biscoito água e sal — 350 g'],
] as const

function hashText(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash)
}

function buildAddress(aisle: string, position: number, level: number): string {
  return `${aisle}-${String(position).padStart(2, '0')}-${String(level).padStart(2, '0')}`
}

function buildBaseLocation(
  aisle: string,
  bay: number,
  side: SlotSide,
  level: number,
): WarehouseLocation {
  const position = side === 'left' ? bay * 2 - 1 : bay * 2
  const zone: StorageZone =
    level === WAREHOUSE_CONFIG.pickingLevel ? 'picking' : 'reserve'

  return {
    address: buildAddress(aisle, position, level),
    aisle,
    bay,
    position,
    side,
    level,
    zone,
    status: 'empty',
    confirmation: 'system-only',
    quantity: 0,
    capacity: zone === 'picking' ? 120 : 1,
  }
}

function buildDemoLocation(base: WarehouseLocation): WarehouseLocation {
  const hash = hashText(base.address)

  let status: SlotStatus = 'occupied'
  if (hash % 37 === 0) status = 'blocked'
  else if (hash % 29 === 0) status = 'divergent'
  else if (hash % 5 === 0 || hash % 11 === 0) status = 'empty'

  const confirmation: ConfirmationStatus =
    status === 'divergent'
      ? 'pending-check'
      : hash % 3 === 0
        ? 'system-only'
        : 'physically-confirmed'

  const product = PRODUCTS[hash % PRODUCTS.length]
  const quantity =
    status === 'occupied' || status === 'divergent'
      ? base.zone === 'picking'
        ? 24 + (hash % 96)
        : 1
      : 0

  return {
    ...base,
    status,
    confirmation,
    sku: quantity > 0 ? product[0] : undefined,
    description: quantity > 0 ? product[1] : undefined,
    lot: quantity > 0 ? `L${String((hash % 9000) + 1000)}` : undefined,
    quantity,
    lastCheckedAt:
      confirmation === 'physically-confirmed'
        ? '2026-07-27T18:30:00-03:00'
        : undefined,
  }
}

export function generateWarehouseSkeleton(): WarehouseLocation[] {
  return WAREHOUSE_CONFIG.aisles.flatMap((aisle) =>
    Array.from(
      { length: WAREHOUSE_CONFIG.baysPerSide },
      (_, bayIndex) => bayIndex + 1,
    ).flatMap((bay) =>
      (['left', 'right'] as const).flatMap((side) =>
        Array.from({ length: WAREHOUSE_CONFIG.levels }, (_, levelIndex) =>
          buildBaseLocation(aisle, bay, side, levelIndex + 1),
        ),
      ),
    ),
  )
}

export function generateDemoWarehouse(): WarehouseLocation[] {
  return generateWarehouseSkeleton().map(buildDemoLocation)
}

export function summarizeWarehouse(locations: WarehouseLocation[]): WarehouseSummary {
  const summary = locations.reduce(
    (accumulator, location) => {
      accumulator.total += 1
      accumulator[location.status] += 1
      if (location.confirmation === 'physically-confirmed') accumulator.confirmed += 1
      return accumulator
    },
    {
      total: 0,
      occupied: 0,
      empty: 0,
      blocked: 0,
      divergent: 0,
      confirmed: 0,
    },
  )

  return {
    ...summary,
    occupancyRate:
      summary.total === 0
        ? 0
        : Number(
            (
              ((summary.occupied + summary.divergent) / summary.total) *
              100
            ).toFixed(1),
          ),
  }
}

export const SLOT_STATUS_LABEL: Record<SlotStatus, string> = {
  occupied: 'Ocupada',
  empty: 'Vazia no sistema',
  blocked: 'Bloqueada',
  divergent: 'Divergente',
}

export const CONFIRMATION_LABEL: Record<ConfirmationStatus, string> = {
  'system-only': 'Informação somente sistêmica',
  'physically-confirmed': 'Confirmada fisicamente',
  'pending-check': 'Aguardando conferência',
}
