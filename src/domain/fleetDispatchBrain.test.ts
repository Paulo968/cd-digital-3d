import { beforeEach, describe, expect, it } from 'vitest'
import {
  chooseBrainMissionForVehicle,
  vehicleLanePreference,
} from './fleetDispatchBrain'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildRealisticFleetPlan,
  type FleetMission,
} from './realisticFleet'
import { buildTravelPath, getZoneWorldPoint } from './routePlanning'
import { generateWarehouseSkeleton } from './warehouse'
import { useOperationsControlStore } from '../store/operationsControlStore'

const layout = DEFAULT_WAREHOUSE_LAYOUT
const locations = generateWarehouseSkeleton(layout)
const plan = buildRealisticFleetPlan(
  layout,
  locations,
  { frontZ: 49.5, receivingX: -31, shippingX: 31 },
  false,
)

function compatibleMissions(): FleetMission[] {
  return plan.missions.filter((mission) => mission.eligibleKinds.includes('forklift'))
}

describe('fleetDispatchBrain', () => {
  beforeEach(() => {
    useOperationsControlStore.getState().resetSession()
  })

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
    const operation = useOperationsControlStore.getState()
    expect(operation.pallets[candidates[1].palletId]).toBeDefined()
    expect(operation.metrics.receivedPallets).toBe(0)
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

  it('mantém a expedição na fila enquanto o caminhão está fora da doca', () => {
    const vehicle = plan.vehicles.find((item) => item.id === 'EMP-01')!
    const shipping = compatibleMissions().find(
      (mission) => mission.role === 'shipping',
    )!
    useOperationsControlStore.getState().setTruckPhase('away')

    const selected = chooseBrainMissionForVehicle({
      vehicle,
      vehiclePoint: vehicle.startPoint,
      availableMissions: [shipping],
      activeMissions: [],
      reservedMissionIds: new Set(),
      reservedDestinationIds: new Set(),
    })

    expect(selected).toBeUndefined()
  })

  it('mantém caminhos físicos distintos nas duas cabeceiras do CD maior', () => {
    const from = getZoneWorldPoint(layout, 'shipping')
    const firstRow = layout.rackRows.find((row) => row.active)!
    const to = { x: 0, y: 0.2, z: firstRow.origin.z }
    const leftPath = buildTravelPath(layout, from, to, {
      left: false,
      right: true,
    })
    const rightPath = buildTravelPath(layout, from, to, {
      left: true,
      right: false,
    })

    expect(leftPath.length).toBeGreaterThan(2)
    expect(rightPath.length).toBeGreaterThan(2)
    expect(leftPath).not.toEqual(rightPath)
  })
})
