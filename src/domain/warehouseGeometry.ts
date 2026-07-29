import type { RackRowLayout, WarehouseLayout } from './layout'
import type { WarehouseLocation } from './warehouse'

export const RACK_BEAM_CENTER_Y = 0.18
export const RACK_BEAM_HEIGHT = 0.11
export const PALLET_HEIGHT = 0.12
export const PALLET_SUPPORT_CLEARANCE = 0.015
export const LOAD_SUPPORT_CLEARANCE = 0.015
export const FORK_THICKNESS = 0.08
export const VEHICLE_BASE_Y = 0.18
export const TRAVEL_FORK_HEIGHT = 0.12

export function findLocationRow(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): RackRowLayout | undefined {
  return (
    layout.rackRows.find((row) => row.id === location.rackRowId) ??
    layout.rackRows.find((row) => row.aisle === location.aisle)
  )
}

export function getRackSupportY(row: RackRowLayout, level: number): number {
  const normalizedLevel = Math.max(1, Math.min(level, row.levels))
  return (
    (normalizedLevel - 1) * row.levelHeight +
    RACK_BEAM_CENTER_Y +
    RACK_BEAM_HEIGHT / 2
  )
}

export function getLocationSupportY(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): number {
  const row = findLocationRow(layout, location)
  return row ? getRackSupportY(row, location.level) : 0.24
}

export function getPalletCenterY(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): number {
  return (
    getLocationSupportY(layout, location) +
    PALLET_SUPPORT_CLEARANCE +
    PALLET_HEIGHT / 2
  )
}

export function getLoadCenterY(
  layout: WarehouseLayout,
  location: WarehouseLocation,
  loadHeight: number,
): number {
  return (
    getPalletCenterY(layout, location) +
    PALLET_HEIGHT / 2 +
    LOAD_SUPPORT_CLEARANCE +
    loadHeight / 2
  )
}

export function getForkCarriageHeight(
  layout: WarehouseLayout,
  location: WarehouseLocation,
): number {
  const palletBottom = getPalletCenterY(layout, location) - PALLET_HEIGHT / 2
  const forkCenter = palletBottom - FORK_THICKNESS / 2
  return Math.max(0.03, forkCenter - VEHICLE_BASE_Y)
}
