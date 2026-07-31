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

  it('mantém vários pallets em filas completas de três etapas', () => {
    const stable = stablePlan()
    const groups = new Map<string, typeof stable.missions>()

    stable.missions.forEach((mission) => {
      const group = groups.get(mission.palletId) ?? []
      group.push(mission)
      groups.set(mission.palletId, group)
    })

    expect(groups.size).toBeGreaterThanOrEqual(2)
    expect(groups.size).toBeLessThanOrEqual(6)
    ;[...groups.values()].forEach((missions) => {
      expect(missions).toHaveLength(3)
      const roles = missions.map((mission) => mission.role)
      const inbound = [
        'inbound-transfer',
        'inbound-transfer',
        'putaway',
      ]
      const outbound = ['replenishment', 'replenishment', 'shipping']
      const matchesKnownFlow =
        JSON.stringify(roles) === JSON.stringify(inbound) ||
        JSON.stringify(roles) === JSON.stringify(outbound)
      expect(matchesKnownFlow).toBe(true)
    })
  })

  it('coloca recebimento e expedição em lados opostos', () => {
    const stable = stablePlan()
    const byId = Object.fromEntries(
      stable.vehicles.map((vehicle) => [vehicle.id, vehicle]),
    )

    expect(byId['RX-REC'].startPoint.x).toBeLessThan(
      byId['RX-LOAD'].startPoint.x,
    )
    expect(byId['REACH-PUT'].startPoint.x).toBeLessThan(
      byId['REACH-PICK'].startPoint.x,
    )
    expect(byId['TP-IN'].startPoint.x).toBeLessThan(
      byId['TP-OUT'].startPoint.x,
    )

    const inboundTpFromRx = Math.hypot(
      byId['TP-IN'].startPoint.x - byId['RX-REC'].startPoint.x,
      byId['TP-IN'].startPoint.z - byId['RX-REC'].startPoint.z,
    )
    const outboundTpFromRx = Math.hypot(
      byId['TP-OUT'].startPoint.x - byId['RX-LOAD'].startPoint.x,
      byId['TP-OUT'].startPoint.z - byId['RX-LOAD'].startPoint.z,
    )
    expect(inboundTpFromRx).toBeGreaterThan(5)
    expect(outboundTpFromRx).toBeGreaterThan(5)
  })

  it('não posiciona dois equipamentos na mesma vaga de espera', () => {
    const stable = stablePlan()

    stable.vehicles.forEach((vehicle, index) => {
      stable.vehicles.slice(index + 1).forEach((other) => {
        const distance = Math.hypot(
          vehicle.startPoint.x - other.startPoint.x,
          vehicle.startPoint.z - other.startPoint.z,
        )
        expect(distance).toBeGreaterThan(2.5)
      })
    })
  })
})
