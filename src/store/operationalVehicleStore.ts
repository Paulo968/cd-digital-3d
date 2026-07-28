import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { WarehouseLayout } from '../domain/layout'
import {
  getLocationAccessPoint,
  getZoneWorldPoint,
  type WorldPoint,
} from '../domain/routePlanning'
import type { WarehouseLocation } from '../domain/warehouse'

export type OperationalVehicleAnchor =
  | { kind: 'shipping' }
  | { kind: 'address'; address: string }

interface OperationalVehicleState {
  vehicleId: string
  anchor: OperationalVehicleAnchor
  parkAtAddress: (address: string) => void
  resetToShipping: () => void
}

export function resolveOperationalVehiclePoint(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
  anchor: OperationalVehicleAnchor,
): WorldPoint {
  if (anchor.kind === 'address') {
    const location = locations.find((item) => item.address === anchor.address)
    if (location) return getLocationAccessPoint(layout, location)
  }

  return getZoneWorldPoint(layout, 'shipping')
}

export function describeOperationalVehicleAnchor(
  anchor: OperationalVehicleAnchor,
  locations: WarehouseLocation[],
): string {
  if (
    anchor.kind === 'address' &&
    locations.some((location) => location.address === anchor.address)
  ) {
    return `Ao lado de ${anchor.address}`
  }

  return 'Expedição'
}

export const useOperationalVehicleStore = create<OperationalVehicleState>()(
  persist(
    (set) => ({
      vehicleId: 'EMP-01',
      anchor: { kind: 'shipping' },
      parkAtAddress: (address) =>
        set({ anchor: { kind: 'address', address: address.trim().toUpperCase() } }),
      resetToShipping: () => set({ anchor: { kind: 'shipping' } }),
    }),
    {
      name: 'cd-digital-3d-operational-vehicle',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
