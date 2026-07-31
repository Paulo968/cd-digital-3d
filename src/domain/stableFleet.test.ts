import { describe, expect, it } from 'vitest'
import { buildIndustrialFlowPlan } from './industrialFlow'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import { buildStableFleetPlan } from './stableFleet'
import { generateDemoWarehouse } from './warehouse'

function stablePlan() {
  const layout = DEFAULT_WAREHOUSE_LAYOUT
  const locations = generateDemoWarehouse(layout)
  const base = buildIndustrialFlowPlan(
    layout,
    locations,
    { frontZ: 49.5, receivingX: -31, shippingX: 31 },
    false,
  )
  return {
    stable: buildStableFleetPlan(base, layout, locations),
    locations,
  }
}

describe('buildStableFleetPlan', () => {
  it('mantém somente os três equipamentos da expedição', () => {
    const { stable } = stablePlan()

    expect(stable.vehicles.map((vehicle) => vehicle.id)).toEqual([
      'REACH-PICK',
      'TP-OUT',
      'RX-LOAD',
    ])
    expect(stable.vehicles.map((vehicle) => vehicle.roles)).toEqual([
      ['replenishment'],
      ['replenishment'],
      ['shipping'],
    ])
  })

  it('remove completamente as missões de recebimento e armazenagem', () => {
    const { stable } = stablePlan()

    expect(stable.missions.length).toBeGreaterThan(0)
    expect(
      stable.missions.every(
        (mission) =>
          mission.role === 'replenishment' || mission.role === 'shipping',
      ),
    ).toBe(true)
    expect(
      stable.missions.some(
        (mission) =>
          mission.source.id.startsWith('inbound-truck:') ||
          mission.destination.id.startsWith('receiving:'),
      ),
    ).toBe(false)
  })

  it('coloca todo endereço ocupado e não bloqueado na fila móvel', () => {
    const { stable, locations } = stablePlan()
    const movableAddresses = locations
      .filter(
        (location) =>
          location.quantity > 0 && location.status !== 'blocked',
      )
      .map((location) => location.address)
      .sort()
    const plannedAddresses = stable.missions
      .filter((mission) => mission.source.kind === 'address')
      .map((mission) => mission.source.address)
      .filter((address): address is string => Boolean(address))
      .sort()

    expect(plannedAddresses).toEqual(movableAddresses)
  })

  it('mantém cada pallet em uma cadeia retrátil, TP e RX20', () => {
    const { stable } = stablePlan()
    const groups = new Map<string, typeof stable.missions>()

    stable.missions.forEach((mission) => {
      const group = groups.get(mission.palletId) ?? []
      group.push(mission)
      groups.set(mission.palletId, group)
    })

    expect(groups.size).toBeGreaterThan(0)
    ;[...groups.values()].forEach((missions) => {
      expect(missions).toHaveLength(3)
      expect(missions.map((mission) => mission.role)).toEqual([
        'replenishment',
        'replenishment',
        'shipping',
      ])
      expect(missions[0].source.kind).toBe('address')
      expect(missions[1].eligibleKinds).toEqual(['pallet-jack'])
      expect(missions[2].destination.kind).toBe('truck')
    })
  })

  it('separa as três vagas para criar uma área real de manobra', () => {
    const { stable } = stablePlan()

    stable.vehicles.forEach((vehicle, index) => {
      stable.vehicles.slice(index + 1).forEach((other) => {
        const distance = Math.hypot(
          vehicle.startPoint.x - other.startPoint.x,
          vehicle.startPoint.z - other.startPoint.z,
        )
        expect(distance).toBeGreaterThan(7)
      })
    })
  })
})
