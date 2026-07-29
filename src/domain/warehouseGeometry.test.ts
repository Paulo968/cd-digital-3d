import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import type { WarehouseLocation } from './warehouse'
import {
  FORK_THICKNESS,
  getForkCarriageHeight,
  getLocationSupportY,
  getPalletCenterY,
  PALLET_HEIGHT,
  VEHICLE_BASE_Y,
} from './warehouseGeometry'

const location: WarehouseLocation = {
  address: 'A-01-01',
  layoutId: DEFAULT_WAREHOUSE_LAYOUT.id,
  layoutVersion: DEFAULT_WAREHOUSE_LAYOUT.version,
  rackRowId: 'rack-row-A',
  aisle: 'A',
  bay: 1,
  position: 1,
  side: 'left',
  level: 1,
  zone: 'picking',
  status: 'occupied',
  confirmation: 'system-only',
  sku: 'TESTE',
  quantity: 10,
  capacity: 120,
}

describe('warehouseGeometry', () => {
  it('apoia o pallet imediatamente acima da longarina', () => {
    const supportY = getLocationSupportY(DEFAULT_WAREHOUSE_LAYOUT, location)
    const palletCenterY = getPalletCenterY(DEFAULT_WAREHOUSE_LAYOUT, location)
    const palletBottom = palletCenterY - PALLET_HEIGHT / 2

    expect(palletBottom).toBeGreaterThan(supportY)
    expect(palletBottom - supportY).toBeLessThan(0.03)
  })

  it('posiciona o garfo imediatamente abaixo do pallet', () => {
    const carriageHeight = getForkCarriageHeight(
      DEFAULT_WAREHOUSE_LAYOUT,
      location,
    )
    const forkTop = VEHICLE_BASE_Y + carriageHeight + FORK_THICKNESS / 2
    const palletBottom =
      getPalletCenterY(DEFAULT_WAREHOUSE_LAYOUT, location) - PALLET_HEIGHT / 2

    expect(palletBottom - forkTop).toBeGreaterThanOrEqual(0)
    expect(palletBottom - forkTop).toBeLessThan(0.02)
  })

  it('mantém a mesma regra geométrica em níveis superiores', () => {
    const upper = { ...location, level: 4 }
    const lowerCenter = getPalletCenterY(DEFAULT_WAREHOUSE_LAYOUT, location)
    const upperCenter = getPalletCenterY(DEFAULT_WAREHOUSE_LAYOUT, upper)
    const row = DEFAULT_WAREHOUSE_LAYOUT.rackRows[0]

    expect(upperCenter - lowerCenter).toBeCloseTo(row.levelHeight * 3, 6)
  })
})
