import { describe, expect, it } from 'vitest'
import {
  EMPTY_WAREHOUSE_V3,
  GROWING_RECEIVING_CONFIG,
  GROWING_STAGING,
  createGrowingReceivingSimulation,
  growingStagingPoint,
} from './growingReceivingOperation'
import { RECEIVING_V2, ReceivingSimulation } from './receivingSimulation'

describe('recebimento crescente configurável', () => {
  it('permite cenários coexistirem sem mutação global', () => {
    expect(RECEIVING_V2.floorWidth).toBe(72)
    expect(GROWING_RECEIVING_CONFIG.floorWidth).toBe(112)

    const standard = new ReceivingSimulation()
    const growing = createGrowingReceivingSimulation()

    expect(standard.read().pallets).toHaveLength(6)
    expect(growing.read().pallets).toHaveLength(6)
    expect(RECEIVING_V2.preserveStagedPallets).toBe(false)
    expect(GROWING_RECEIVING_CONFIG.preserveStagedPallets).toBe(true)
  })

  it('organiza quatro pallets por fileira do fundo para a frente', () => {
    const firstRow = Array.from({ length: 4 }, (_, index) =>
      growingStagingPoint(index),
    )
    const secondRow = Array.from({ length: 4 }, (_, index) =>
      growingStagingPoint(index + 4),
    )

    expect(new Set(firstRow.map((point) => point.z)).size).toBe(1)
    expect(new Set(secondRow.map((point) => point.z)).size).toBe(1)
    expect(firstRow.map((point) => point.x)).toEqual(
      [...GROWING_STAGING.columnXs],
    )
    expect(secondRow[0].z).toBeGreaterThan(firstRow[0].z)
    expect(
      Math.min(...firstRow.map((point) => point.x)) -
        GROWING_STAGING.futureTranspalletLaneCenterX,
    ).toBeGreaterThan(GROWING_STAGING.futureTranspalletLaneWidth / 2)
  })

  it('mantém cinco ruas vazias atrás das portas de transferência', () => {
    expect(EMPTY_WAREHOUSE_V3.aisleNames).toHaveLength(5)
    expect(EMPTY_WAREHOUSE_V3.rackRowXs).toHaveLength(6)
    expect(EMPTY_WAREHOUSE_V3.rackStartZ).toBeLessThan(
      EMPTY_WAREHOUSE_V3.partitionZ,
    )
    expect(EMPTY_WAREHOUSE_V3.rackEndZ).toBeLessThan(
      EMPTY_WAREHOUSE_V3.rackStartZ,
    )
  })

  it('preserva pallets entre caminhões sem alterar o cenário padrão', () => {
    expect(GROWING_RECEIVING_CONFIG.forwardSpeed).toBeGreaterThan(4)
    expect(GROWING_RECEIVING_CONFIG.loadedSpeed).toBeGreaterThan(3)
    expect(GROWING_RECEIVING_CONFIG.floorDepth).toBeGreaterThan(250)
    expect(GROWING_RECEIVING_CONFIG.preserveStagedPallets).toBe(true)

    const simulation = createGrowingReceivingSimulation()

    for (let frame = 0; frame < 260_000; frame += 1) {
      simulation.step(1 / 30)
      const state = simulation.read()
      expect(state.fault).toBeNull()
      if (state.completedTrucks >= 3) break
    }

    const final = simulation.read()
    expect(final.completedTrucks).toBeGreaterThanOrEqual(3)
    expect(
      final.pallets.filter((pallet) => pallet.phase === 'staged'),
    ).toHaveLength(18)
    expect(
      final.pallets.filter((pallet) => pallet.phase === 'truck'),
    ).toHaveLength(6)
    expect(
      new Set(
        final.pallets
          .filter((pallet) => pallet.phase === 'staged')
          .map((pallet) => pallet.stagedSlot),
      ).size,
    ).toBe(18)
  })
})
