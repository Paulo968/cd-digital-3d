import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildRealisticFleetPlan,
  chooseMissionForVehicle,
  createMissionStatuses,
  readyMissions,
} from './realisticFleet'
import { generateDemoWarehouse } from './warehouse'

const locations = generateDemoWarehouse(DEFAULT_WAREHOUSE_LAYOUT)
const geometry = {
  receivingX: -17,
  shippingX: 17,
  frontZ: 32.5,
}

describe('realisticFleet', () => {
  it('cria duas empilhadeiras e uma transpaleteira no desktop', () => {
    const plan = buildRealisticFleetPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
      false,
    )

    expect(plan.vehicles.filter((vehicle) => vehicle.kind === 'forklift')).toHaveLength(2)
    expect(plan.vehicles.filter((vehicle) => vehicle.kind === 'pallet-jack')).toHaveLength(1)
  })

  it('reduz a frota no celular sem remover a transpaleteira', () => {
    const plan = buildRealisticFleetPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
      true,
    )

    expect(plan.vehicles.map((vehicle) => vehicle.id)).toEqual(['EMP-01', 'TP-01'])
  })

  it('só libera a armazenagem depois da transferência para a espera', () => {
    const plan = buildRealisticFleetPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
      false,
    )
    const statuses = createMissionStatuses(plan.missions)
    const initialReady = readyMissions(
      plan.missions,
      statuses,
      plan.initialPalletStops,
    )

    expect(initialReady.some((mission) => mission.id === 'inbound-transfer-1')).toBe(true)
    expect(initialReady.some((mission) => mission.id === 'putaway-1')).toBe(false)

    const stagedStops = {
      ...plan.initialPalletStops,
      'DEMO-IN-01': plan.missions.find((mission) => mission.id === 'putaway-1')!
        .source,
    }
    statuses['inbound-transfer-1'] = 'completed'
    const readyAfterStaging = readyMissions(plan.missions, statuses, stagedStops)

    expect(readyAfterStaging.some((mission) => mission.id === 'putaway-1')).toBe(true)
  })

  it('não entrega missão de elevação para a transpaleteira', () => {
    const plan = buildRealisticFleetPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
      false,
    )
    const jack = plan.vehicles.find((vehicle) => vehicle.kind === 'pallet-jack')!
    const putaway = plan.missions.filter((mission) => mission.role === 'putaway')

    expect(
      chooseMissionForVehicle(jack, putaway, new Set(), new Set()),
    ).toBeUndefined()
  })

  it('evita atribuir duas missões ao mesmo destino reservado', () => {
    const plan = buildRealisticFleetPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
      false,
    )
    const forklift = plan.vehicles.find((vehicle) => vehicle.kind === 'forklift')!
    const mission = plan.missions.find((item) => item.role === 'putaway')!

    expect(
      chooseMissionForVehicle(
        forklift,
        [mission],
        new Set(),
        new Set([mission.destination.id]),
      ),
    ).toBeUndefined()
  })
})
