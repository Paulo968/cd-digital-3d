import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildReceivingCellGeometry,
  RECEIVING_PALLETS_PER_TRUCK,
  receivingCellHasSafeSpacing,
} from './realisticReceivingPhaseOne'

describe('realistic receiving phase one', () => {
  it('cria exatamente seis pallets e seis posições de descarga', () => {
    const geometry = buildReceivingCellGeometry(DEFAULT_WAREHOUSE_LAYOUT)

    expect(geometry.truckPallets).toHaveLength(RECEIVING_PALLETS_PER_TRUCK)
    expect(geometry.stagingSlots).toHaveLength(RECEIVING_PALLETS_PER_TRUCK)
  })

  it('mantém a área de giro fora da carroceria e antes do staging', () => {
    const geometry = buildReceivingCellGeometry(DEFAULT_WAREHOUSE_LAYOUT)

    expect(geometry.clearPoint.z).toBeLessThan(geometry.mouthZ)
    expect(
      geometry.stagingSlots.every((slot) => slot.z < geometry.clearPoint.z),
    ).toBe(true)
    expect(receivingCellHasSafeSpacing(geometry)).toBe(true)
  })

  it('mantém os pallets do caminhão em duas colunas e três profundidades', () => {
    const geometry = buildReceivingCellGeometry(DEFAULT_WAREHOUSE_LAYOUT)
    const xValues = new Set(geometry.truckPallets.map((point) => point.x))
    const zValues = new Set(geometry.truckPallets.map((point) => point.z))

    expect(xValues.size).toBe(2)
    expect(zValues.size).toBe(3)
  })
})
