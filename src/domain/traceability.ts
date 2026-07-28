export type TraceEventType =
  | 'receipt'
  | 'putaway'
  | 'transfer'
  | 'replenishment'
  | 'picking'
  | 'dispatch'
  | 'count'
  | 'adjustment'
  | 'block'
  | 'unblock'

export type TraceSource = 'erp' | 'wms' | 'csv' | 'mobile' | 'manual' | 'simulation'

export interface TraceActor {
  id: string
  name: string
  role?: string
}

export interface HandlingUnit {
  id: string
  code: string
  type: 'pallet' | 'box' | 'tote' | 'loose'
  status: 'available' | 'reserved' | 'blocked' | 'in-transit' | 'dispatched'
  currentAddress?: string
  parentHandlingUnitId?: string
}

export interface StockIdentity {
  sku: string
  description: string
  lot?: string
  serialNumber?: string
  expirationDate?: string
  unitOfMeasure: string
}

export interface TraceEvent {
  id: string
  occurredAt: string
  recordedAt: string
  type: TraceEventType
  source: TraceSource
  actor?: TraceActor
  handlingUnitCode?: string
  stock: StockIdentity
  quantity: number
  fromAddress?: string
  toAddress?: string
  documentReference?: string
  taskReference?: string
  confirmation: 'system-only' | 'physically-confirmed'
  notes?: string
}

export interface TraceCurrentState {
  handlingUnitCode?: string
  stock: StockIdentity
  currentAddress?: string
  quantity: number
  blocked: boolean
  lastEventAt?: string
  lastConfirmation: 'system-only' | 'physically-confirmed'
}

export function sortTraceEvents(events: TraceEvent[]): TraceEvent[] {
  return [...events].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  )
}

export function deriveTraceCurrentState(
  events: TraceEvent[],
): TraceCurrentState | null {
  const orderedEvents = sortTraceEvents(events)
  const firstEvent = orderedEvents[0]

  if (!firstEvent) return null

  return orderedEvents.reduce<TraceCurrentState>(
    (state, event) => {
      let currentAddress = state.currentAddress
      let quantity = state.quantity
      let blocked = state.blocked

      if (event.toAddress) currentAddress = event.toAddress
      if (event.type === 'dispatch') currentAddress = undefined
      if (event.type === 'block') blocked = true
      if (event.type === 'unblock') blocked = false

      if (event.type === 'receipt' || event.type === 'adjustment' || event.type === 'count') {
        quantity = event.quantity
      } else if (event.type === 'picking' || event.type === 'dispatch') {
        quantity = Math.max(0, quantity - event.quantity)
      } else if (
        event.type === 'putaway' ||
        event.type === 'transfer' ||
        event.type === 'replenishment'
      ) {
        quantity = event.quantity || quantity
      }

      return {
        handlingUnitCode: event.handlingUnitCode ?? state.handlingUnitCode,
        stock: event.stock,
        currentAddress,
        quantity,
        blocked,
        lastEventAt: event.occurredAt,
        lastConfirmation: event.confirmation,
      }
    },
    {
      handlingUnitCode: firstEvent.handlingUnitCode,
      stock: firstEvent.stock,
      currentAddress: firstEvent.toAddress,
      quantity: 0,
      blocked: false,
      lastConfirmation: firstEvent.confirmation,
    },
  )
}

export function buildTraceKey(event: TraceEvent): string {
  return [
    event.handlingUnitCode ?? 'SEM-UL',
    event.stock.sku,
    event.stock.lot ?? 'SEM-LOTE',
    event.stock.serialNumber ?? 'SEM-SERIE',
  ].join('|')
}

export function groupTraceEvents(
  events: TraceEvent[],
): Map<string, TraceEvent[]> {
  return events.reduce((groups, event) => {
    const key = buildTraceKey(event)
    const current = groups.get(key) ?? []
    current.push(event)
    groups.set(key, current)
    return groups
  }, new Map<string, TraceEvent[]>())
}
