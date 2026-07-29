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

describe('realistic traffic scheduling', () => {
  it('mantém pelo menos duas missões independentes em paralelo no desktop', () => {
    const plan = buildRealisticFleetPlan(
      DEFAULT_WAREHOUSE_LAYOUT,
      locations,
      geometry,
      false,
    )
    const statuses = createMissionStatuses(plan.missions)
    const available = readyMissions(
      plan.missions,
      statuses,
      plan.initialPalletStops,
    )
    const reservedMissionIds = new Set<string>()
    const reservedDestinationIds = new Set<string>()
    const assignments: string[] = []

    plan.vehicles.forEach((vehicle) => {
      const mission = chooseMissionForVehicle(
        vehicle,
        available,
        reservedMissionIds,
        reservedDestinationIds,
      )
      if (!mission) return

      assignments.push(mission.id)
      reservedMissionIds.add(mission.id)
      reservedDestinationIds.add(mission.destination.id)
    })

    expect(assignments.length).toBeGreaterThanOrEqual(2)
    expect(new Set(assignments).size).toBe(assignments.length)
  })
})
