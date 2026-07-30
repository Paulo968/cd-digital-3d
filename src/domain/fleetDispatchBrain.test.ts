import { describe, expect, it } from 'vitest'
import {
  buildAdaptiveFleetPath,
  chooseBrainMissionForVehicle,
  vehicleLanePreference,
} from './fleetDispatchBrain'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildRealisticFleetPlan,
  type FleetMission,
} from './realisticFleet'
import { generateWarehouseSkeleton } from './warehouse'

const layout = DEFAULT_WAREHOUSE_LAYOUT
const locations = generateWarehouseSkeleton(layout)
const plan = buildRealisticFleetPlan(
  layout,
  locations,
  { frontZ: 30, receivingX: -17, shippingX: 17 },
  false,
)

function compatibleMissions(): FleetMission[] {
  return plan.missions.filter((mission) => mission.eligibleKinds.includes('forklift'))
}

describe('fleetDispatchBrain', () => {
  it('distribui lados diferentes para veículos pares e ímpares', () => {
    expect(vehicleLanePreference('EMP-01')).toBe('left')
    expect(vehicleLanePreference('EMP-02')).toBe('right')
    expect(vehicleLanePreference('TP-01')).toBe('left')
    expect(vehicleLanePreference('TP-02')).toBe('right')
  })

  it('prefere uma missão mais próxima quando prioridade e função são iguais', () => {
    const vehicle = plan.vehicles.find((item) => item.id === 'EMP-01')!
    const candidates = compatibleMissions()
      .filter((mission) => mission.role === 'putaway')
      .slice(0, 2)
    expect(candidates).toHaveLength(2)

    const selected = chooseBrainMissionForVehicle({
      vehicle,
      vehiclePoint: candidates[1].source.access,
      availableMissions: candidates,
      activeMissions: [],
      reservedMissionIds: new Set(),
      reservedDestinationIds: new Set(),
    })

    expect(selected?.id).toBe(candidates[1].id)
  })

  it('não despacha duas missões para o mesmo ponto crítico', () => {
    const vehicle = plan.vehicles.find((item) => item.id === 'EMP-02')!
    const candidate = compatibleMissions().find(
      (mission) => mission.role === 'putaway',
    )!
    const active = {
      ...candidate,
      id: 'active-conflict',
      palletId: 'OTHER-PALLET',
    }

    const selected = chooseBrainMissionForVehicle({
      vehicle,
      vehiclePoint: vehicle.startPoint,
      availableMissions: [candidate],
      activeMissions: [active],
      reservedMissionIds: new Set([active.id]),
      reservedDestinationIds: new Set(),
    })

    expect(selected).toBeUndefined()
  })

  it('gera rotas distintas para lados preferenciais opostos', () => {
    const from = { x: -17, y: 0.2, z: 29 }
    const to = { x: 4, y: 0.2, z: -20 }
    const leftPath = buildAdaptiveFleetPath(layout, from, to, 'EMP-01')
    const rightPath = buildAdaptiveFleetPath(layout, from, to, 'EMP-02')

    expect(leftPath.length).toBeGreaterThan(2)
    expect(rightPath.length).toBeGreaterThan(2)
    expect(leftPath).not.toEqual(rightPath)
  })
})
