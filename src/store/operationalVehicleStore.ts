import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { WarehouseLayout } from '../domain/layout'
import {
  getLocationAccessPoint,
  getZoneWorldPoint,
  type WorldPoint,
} from '../domain/routePlanning'
import type { WarehouseLocation } from '../domain/warehouse'
import {
  clearOperationalVehicleRuntimePose,
  setOperationalVehicleRuntimePose,
} from './operationalVehicleRuntime'

export type OperationalVehicleAnchor =
  | { kind: 'shipping' }
  | { kind: 'address'; address: string }
  | {
      kind: 'point'
      point: WorldPoint
      label: string
      facing: number
    }

interface OperationalVehicleState {
  vehicleId: string
  anchor: OperationalVehicleAnchor
  parkAtAddress: (address: string) => void
  parkAtPoint: (point: WorldPoint, label?: string, facing?: number) => void
  resetToShipping: () => void
}

function safeCoordinate(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

export function resolveOperationalVehiclePoint(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
  anchor: OperationalVehicleAnchor,
): WorldPoint {
  if (anchor.kind === 'point') {
    return {
      x: safeCoordinate(anchor.point.x),
      y: safeCoordinate(anchor.point.y, 0.2),
      z: safeCoordinate(anchor.point.z),
    }
  }

  if (anchor.kind === 'address') {
    const location = locations.find((item) => item.address === anchor.address)
    if (location) return getLocationAccessPoint(layout, location)
  }

  return getZoneWorldPoint(layout, 'shipping')
}

export function resolveOperationalVehicleFacing(
  anchor: OperationalVehicleAnchor,
): number {
  return anchor.kind === 'point' && Number.isFinite(anchor.facing)
    ? anchor.facing
    : 0
}

export function describeOperationalVehicleAnchor(
  anchor: OperationalVehicleAnchor,
  locations: WarehouseLocation[],
): string {
  if (anchor.kind === 'point') return anchor.label

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
      parkAtAddress: (address) => {
        clearOperationalVehicleRuntimePose()
        set({
          anchor: {
            kind: 'address',
            address: address.trim().toUpperCase(),
          },
        })
      },
      parkAtPoint: (point, label = 'Ponto operacional', facing = 0) => {
        const safePoint = {
          x: safeCoordinate(point.x),
          y: safeCoordinate(point.y, 0.2),
          z: safeCoordinate(point.z),
        }
        const safeFacing = safeCoordinate(facing)
        const safeLabel = label.trim() || 'Ponto operacional'
        setOperationalVehicleRuntimePose(safePoint, safeFacing, safeLabel)
        set({
          anchor: {
            kind: 'point',
            point: safePoint,
            label: safeLabel,
            facing: safeFacing,
          },
        })
      },
      resetToShipping: () => {
        clearOperationalVehicleRuntimePose()
        set({ anchor: { kind: 'shipping' } })
      },
    }),
    {
      name: 'cd-digital-3d-operational-vehicle',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
