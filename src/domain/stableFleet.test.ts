import { describe, expect, it } from 'vitest'
import { buildIndustrialFlowPlan } from './industrialFlow'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import { buildStableFleetPlan } from './stableFleet'
import { generateWarehouseSkeleton } from './warehouse'

function stablePlan() {
  const layout = DEFAULT_WAREHOUSE_LAYOUT
  const locations = generateWarehouseSkeleton(layout)
  return buildStableFleetPlan(
    buildIndustrialFlowPlan(
      layout,
      locations,
      { frontZ: 30, receivingX: -17, shippingX: 17 },
      false,
    ),
  )
}

describe('buildStableFleetPlan', () => {
  it('cria seis equipamentos com funções operacionais exclusivas', () => {
    const stable = stablePlan()

    expect(stable.vehicles.map((vehicle) => vehicle.id)).toEqual([
      'RX-REC',
      'TP-IN',
      'REACH-PUT',
      'REACH-PICK',
      'TP-OUT',
      'RX-LOAD',
    ])
    expect(stable.vehicles.map((vehicle) => vehicle.roles)).toEqual([
      ['inbound-transfer'],
      ['inbound-transfer'],
      ['putaway'],
      ['replenishment'],
      ['replenishment'],
      ['shipping'],
    ])
  })

  it('mantém uma cadeia completa de entrada e uma de saída', () => {
    const stable = stablePlan()
    const inbound = stable.missions.filter((mission) =>
      mission.palletId.includes('FLOW-IN'),
    )
    const outbound = stable.missions.filter((mission) =>
      mission.palletId.includes('FLOW-OUT'),
    )

    expect(inbound).toHaveLength(3)
    expect(outbound).toHaveLength(3)
    expect(inbound.map((mission) => mission.role)).toEqual([
      'inbound-transfer',
      'inbound-transfer',
      'putaway',
    ])
    expect(outbound.map((mission) => mission.role)).toEqual([
      'replenishment',
      'replenishment',
      'shipping',
    ])
  })

  it('não posiciona dois equipamentos na mesma vaga de espera', () => {
    const stable = stablePlan()

    stable.vehicles.forEach((vehicle, index) => {
      stable.vehicles.slice(index + 1).forEach((other) => {
        const distance = Math.hypot(
          vehicle.startPoint.x - other.startPoint.x,
          vehicle.startPoint.z - other.startPoint.z,
        )
        expect(distance).toBeGreaterThan(1.5)
      })
    })
  })
})
