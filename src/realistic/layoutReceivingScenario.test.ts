import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from '../domain/layout'
import {
  createLayoutReceivingScenario,
  receivingLocalToWorld,
} from './layoutReceivingScenario'

describe('layout receiving scenario', () => {
  it('encosta a doca inbound na mesma planta usada pelo operacional', () => {
    const scenario = createLayoutReceivingScenario(DEFAULT_WAREHOUSE_LAYOUT)
    const dockWall = receivingLocalToWorld(
      { x: 0, z: scenario.config.dockWallZ },
      scenario,
    )

    expect(dockWall.x).toBe(scenario.receivingZone.origin.x)
    expect(dockWall.z).toBe(DEFAULT_WAREHOUSE_LAYOUT.floor.depth / 2)
  })

  it('mantém o staging na faixa lateral livre sem deslocar os racks', () => {
    const scenario = createLayoutReceivingScenario(DEFAULT_WAREHOUSE_LAYOUT)
    const worldSlots = scenario.stagingPoints.map((point) =>
      receivingLocalToWorld(point, scenario),
    )

    expect(worldSlots).toHaveLength(6)
    expect(Math.max(...worldSlots.map((point) => point.x))).toBeLessThan(-20)
    expect(
      DEFAULT_WAREHOUSE_LAYOUT.rackRows.map((row) => row.origin),
    ).toEqual(
      DEFAULT_WAREHOUSE_LAYOUT.rackRows.map((row) => row.origin),
    )
  })

  it('usa as zonas configuradas de recebimento e expedição', () => {
    const scenario = createLayoutReceivingScenario(DEFAULT_WAREHOUSE_LAYOUT)

    expect(scenario.receivingZone.type).toBe('receiving')
    expect(scenario.shippingZone.type).toBe('shipping')
    expect(scenario.receivingZone.origin.x).not.toBe(
      scenario.shippingZone.origin.x,
    )
  })
})
