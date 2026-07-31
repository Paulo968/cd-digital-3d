import { describe, expect, it } from 'vitest'
import { buildIndustrialFlowPlan } from './industrialFlow'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import { buildStableFleetPlan } from './stableFleet'
import { generateWarehouseSkeleton } from './warehouse'

describe('buildStableFleetPlan', () => {
  it('reduz a operação para três equipamentos com funções não concorrentes', () => {
    const layout = DEFAULT_WAREHOUSE_LAYOUT
    const locations = generateWarehouseSkeleton(layout)
    const plan = buildIndustrialFlowPlan(
      layout,
      locations,
      { frontZ: 30, receivingX: -17, shippingX: 17 },
      false,
    )

    const stable = buildStableFleetPlan(plan)

    expect(stable.vehicles.map((vehicle) => vehicle.id)).toEqual([
      'RX-20',
      'REACH-01',
      'TP-01',
    ])
    expect(stable.vehicles[0].roles).toEqual([
      'inbound-transfer',
      'shipping',
    ])
    expect(stable.vehicles[1].roles).toEqual(['putaway', 'replenishment'])
    expect(stable.vehicles[2].roles).toEqual([
      'inbound-transfer',
      'replenishment',
    ])
  })

  it('mantém cobertura para todos os tipos de missão', () => {
    const layout = DEFAULT_WAREHOUSE_LAYOUT
    const locations = generateWarehouseSkeleton(layout)
    const stable = buildStableFleetPlan(
      buildIndustrialFlowPlan(
        layout,
        locations,
        { frontZ: 30, receivingX: -17, shippingX: 17 },
        false,
      ),
    )
    const roles = new Set(stable.vehicles.flatMap((vehicle) => vehicle.roles))

    expect(roles).toEqual(
      new Set([
        'inbound-transfer',
        'putaway',
        'replenishment',
        'shipping',
      ]),
    )
  })
})
