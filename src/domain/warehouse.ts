import {
  DEFAULT_WAREHOUSE_LAYOUT,
  type RackRowLayout,
  type WarehouseLayout,
} from './layout'

const activeDefaultRows = DEFAULT_WAREHOUSE_LAYOUT.rackRows.filter(
  (row) => row.active,
)

export const WAREHOUSE_CONFIG = {
  aisles: activeDefaultRows.map((row) => row.aisle),
  baysPerSide: Math.max(...activeDefaultRows.map((row) => row.baysPerSide)),
  levels: Math.max(...activeDefaultRows.map((row) => row.levels)),
  pickingLevel: activeDefaultRows[0]?.pickingLevels[0] ?? 1,
} as const

export type SlotStatus = 'occupied' | 'empty' | 'blocked' | 'divergent'
export type ConfirmationStatus =
  | 'system-only'
  | 'physically-confirmed'
  | 'pending-check'
export type SlotSide = 'left' | 'right'
export type StorageZone = 'picking' | 'reserve'

export interface WarehouseLocation {
  address: string
  layoutId: string
  layoutVersion: number
  rackRowId: string
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
  handlingUnitCode?: string
  expirationDate?: string
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

export function buildAddress(
  aisle: string,
  position: number,
  level: number,
): string {
  return `${aisle.toUpperCase()}-${String(position).padStart(2, '0')}-${String(level).padStart(2, '0')}`
}

function buildBaseLocation(
  layout: WarehouseLayout,
  row: RackRowLayout,
  bay: number,
  side: SlotSide,
  level: number,
): WarehouseLocation {
  const position = side === 'left' ? bay * 2 - 1 : bay * 2
  const zone: StorageZone = row.pickingLevels.includes(level)
    ? 'picking'
    : 'reserve'

  return {
    address: buildAddress(row.aisle, position, level),
    layoutId: layout.id,
    layoutVersion: layout.version,
    rackRowId: row.id,
    aisle: row.aisle,
    bay,
    position,
    side,
    level,
    zone,
    status: 'empty',
    confirmation: 'system-only',
    quantity: 0,
    capacity: zone === 'picking' ? 120 : 100,
  }
}

function buildDemoLocation(base: WarehouseLocation): WarehouseLocation {
  const hash = hashText(base.address)
  let status: SlotStatus = 'occupied'

  if (hash % 37 === 0) status = 'blocked'
  else if (hash % 29 === 0) status = 'divergent'
  else if (hash % 5 === 0 || hash % 11 === 0) status = 'empty'

  // O cenário demo é sintético. Ele nunca deve fingir que houve uma
  // conferência física real; divergências ficam pendentes e todo o restante
  // permanece como informação exclusivamente sistêmica.
  const confirmation: ConfirmationStatus =
    status === 'divergent' ? 'pending-check' : 'system-only'
  const product = PRODUCTS[hash % PRODUCTS.length]
  const quantity =
    status === 'occupied' || status === 'divergent'
      ? base.zone === 'picking'
        ? 24 + (hash % 96)
        : 50 + (hash % 51)
      : 0

  return {
    ...base,
    status,
    confirmation,
    sku: quantity > 0 ? product[0] : undefined,
    description: quantity > 0 ? product[1] : undefined,
    lot: quantity > 0 ? `L${String((hash % 9000) + 1000)}` : undefined,
    handlingUnitCode:
      quantity > 0
        ? `${base.zone === 'reserve' ? 'PLT' : 'PCK'}-${String(hash % 100000).padStart(5, '0')}`
        : undefined,
    expirationDate:
      quantity > 0
        ? `2027-${String((hash % 12) + 1).padStart(2, '0')}-15`
        : undefined,
    quantity,
    lastCheckedAt: undefined,
  }
}

export function generateWarehouseSkeleton(
  layout: WarehouseLayout = DEFAULT_WAREHOUSE_LAYOUT,
): WarehouseLocation[] {
  return layout.rackRows
    .filter((row) => row.active)
    .flatMap((row) =>
      Array.from({ length: row.baysPerSide }, (_, index) => index + 1).flatMap(
        (bay) =>
          (['left', 'right'] as const).flatMap((side) =>
            Array.from({ length: row.levels }, (_, index) =>
              buildBaseLocation(layout, row, bay, side, index + 1),
            ),
          ),
      ),
    )
}

export function generateDemoWarehouse(
  layout: WarehouseLayout = DEFAULT_WAREHOUSE_LAYOUT,
): WarehouseLocation[] {
  return generateWarehouseSkeleton(layout).map(buildDemoLocation)
}

export function summarizeWarehouse(
  locations: WarehouseLocation[],
): WarehouseSummary {
  const summary = locations.reduce(
    (accumulator, location) => {
      accumulator.total += 1
      accumulator[location.status] += 1
      if (location.confirmation === 'physically-confirmed') {
        accumulator.confirmed += 1
      }
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
