import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import { buildRealisticMissionPlan } from './realisticMissionQueue'
import { generateDemoWarehouse } from './warehouse'

const locations = generateDemoWarehouse(DEFAULT_WAREHOUSE_LAYOUT)
const geometry = {
  receivingX: -17,
  shippingX: 17,
  frontZ: 32.5,
}

describe('realisticMissionQueue', () => {
  it('gera mais de uma missão e alterna pallets', () => {
    const plan = buildRealisticMissionPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
    )

    expect(plan.missions.length).toBeGreaterThan(3)
    expect(new Set(plan.missions.map((mission) => mission.palletId)).size).toBeGreaterThan(1)
  })

  it('mantém origem e destino diferentes em todas as missões', () => {
    const plan = buildRealisticMissionPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
    )

    plan.missions.forEach((mission) => {
      expect(mission.source.id).not.toBe(mission.destination.id)
    })
  })

  it('reutiliza a posição final de um pallet em missão posterior', () => {
    const plan = buildRealisticMissionPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
    )
    const first = plan.missions.find((mission) => mission.palletId === 'DEMO-IN-01')
    const next = plan.missions.find(
      (mission) =>
        mission.palletId === 'DEMO-IN-01' && mission.id !== first?.id,
    )

    expect(first).toBeDefined()
    expect(next).toBeDefined()
    expect(next?.source.id).toBe(first?.destination.id)
  })
})
