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

  it('mantém duas cadeias demonstrativas completas com três etapas cada', () => {
    const stable = stablePlan()
    const groups = new Map<string, typeof stable.missions>()

    stable.missions.forEach((mission) => {
      const group = groups.get(mission.palletId) ?? []
      group.push(mission)
      groups.set(mission.palletId, group)
    })

    expect(groups.size).toBe(2)
    ;[...groups.values()].forEach((missions) => {
      expect(missions).toHaveLength(3)
      const roles = missions.map((mission) => mission.role)
      const inbound = [
        'inbound-transfer',
        'inbound-transfer',
        'putaway',
      ]
      const outbound = ['replenishment', 'replenishment', 'shipping']
      expect(roles).toSatisfy(
        (value: string[]) =>
          JSON.stringify(value) === JSON.stringify(inbound) ||
          JSON.stringify(value) === JSON.stringify(outbound),
      )
    })
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
