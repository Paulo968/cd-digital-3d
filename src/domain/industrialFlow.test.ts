import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildIndustrialFlowPlan,
  vehicleCoversMission,
} from './industrialFlow'
import {
  createWarehouseBrainState,
  decideWarehouseBrain,
  type WarehouseBrainContext,
} from './warehouseBrain'
import { generateDemoWarehouse } from './warehouse'
import { useOperationsControlStore } from '../store/operationsControlStore'

const layout = DEFAULT_WAREHOUSE_LAYOUT
const locations = generateDemoWarehouse(layout)
const plan = buildIndustrialFlowPlan(
  layout,
  locations,
  { frontZ: 30, receivingX: -17, shippingX: 17 },
  false,
)

function context(
  palletStops: WarehouseBrainContext['palletStops'],
  overrides: Partial<WarehouseBrainContext> = {},
): WarehouseBrainContext {
  return {
    now: 0,
    compact: false,
    layout,
    locations,
    plan,
    palletStops,
    palletColors: Object.fromEntries(
      Object.keys(palletStops).map((palletId) => [palletId, '#38bdf8']),
    ),
    missions: [],
    statuses: {},
    ...overrides,
  }
}

beforeEach(() => {
  useOperationsControlStore.getState().resetSession()
})

describe('industrialFlow', () => {
  it('monta equipamentos especializados e empilhadeiras por grupos de ruas', () => {
    const ids = plan.vehicles.map((vehicle) => vehicle.id)

    expect(ids).toContain('RX-REC')
    expect(ids).toContain('TP-IN')
    expect(ids).toContain('TP-OUT')
    expect(ids).toContain('RX-LOAD')
    expect(ids).toContain('EMP-AB')
    expect(ids).toContain('EMP-CD')
    expect(ids).toContain('EMP-EF')
    expect(ids).toContain('EMP-G')

    expect(plan.vehicles.find((vehicle) => vehicle.id === 'RX-REC')?.roles).toEqual([
      'inbound-transfer',
    ])
    expect(plan.vehicles.find((vehicle) => vehicle.id === 'TP-OUT')?.roles).toEqual([
      'replenishment',
    ])
    expect(plan.vehicles.find((vehicle) => vehicle.id === 'RX-LOAD')?.roles).toEqual([
      'shipping',
    ])
  })

  it('cria a cadeia recebimento, descarga, buffer da rua e armazenagem', () => {
    const palletMissions = plan.missions
      .filter((mission) => mission.palletId === 'FLOW-IN-01')
      .sort((left, right) => left.sequence - right.sequence)

    expect(palletMissions).toHaveLength(3)
    expect(palletMissions[0].source.id).toMatch(/^inbound-truck:/)
    expect(palletMissions[0].destination.id).toMatch(/^receiving:/)
    expect(palletMissions[0].eligibleKinds).toEqual(['forklift'])
    expect(palletMissions[1].source.id).toMatch(/^receiving:/)
    expect(palletMissions[1].destination.id).toMatch(/^aisle-buffer:/)
    expect(palletMissions[1].eligibleKinds).toEqual(['pallet-jack'])
    expect(palletMissions[2].source.id).toMatch(/^aisle-buffer:/)
    expect(palletMissions[2].destination.id).toMatch(/^address:/)
    expect(palletMissions[2].role).toBe('putaway')
  })

  it('distribui a primeira descarga por ruas diferentes', () => {
    const aisles = plan.missions
      .filter((mission) => mission.id.startsWith('street-putaway-'))
      .map((mission) => mission.destination.address?.split('-')[0])

    expect(aisles.slice(0, 4)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('impede uma empilhadeira de atender uma rua fora da sua responsabilidade', () => {
    const missionA = plan.missions.find(
      (mission) =>
        mission.role === 'putaway' && mission.destination.address?.startsWith('A-'),
    )
    const missionC = plan.missions.find(
      (mission) =>
        mission.role === 'putaway' && mission.destination.address?.startsWith('C-'),
    )

    expect(missionA).toBeDefined()
    expect(missionC).toBeDefined()
    expect(vehicleCoversMission('EMP-AB', missionA!)).toBe(true)
    expect(vehicleCoversMission('EMP-CD', missionA!)).toBe(false)
    expect(vehicleCoversMission('EMP-CD', missionC!)).toBe(true)
    expect(vehicleCoversMission('EMP-AB', missionC!)).toBe(false)
  })

  it('faz o cérebro respeitar todas as passagens físicas do recebimento', () => {
    const palletId = 'PAL-IN-TEST'

    const unload = decideWarehouseBrain(
      createWarehouseBrainState(0),
      context({ [palletId]: plan.inboundTruckStops[0] }),
    )
    expect(unload.action.type).toBe('create-mission')
    if (unload.action.type !== 'create-mission') return
    expect(unload.action.mission.destination.id).toMatch(/^receiving:/)
    expect(unload.action.mission.eligibleKinds).toEqual(['forklift'])

    const streetTransfer = decideWarehouseBrain(
      unload.state,
      context({ [palletId]: unload.action.mission.destination }),
    )
    expect(streetTransfer.action.type).toBe('create-mission')
    if (streetTransfer.action.type !== 'create-mission') return
    expect(streetTransfer.action.mission.destination.id).toMatch(/^aisle-buffer:/)
    expect(streetTransfer.action.mission.eligibleKinds).toEqual(['pallet-jack'])

    const putaway = decideWarehouseBrain(
      streetTransfer.state,
      context({ [palletId]: streetTransfer.action.mission.destination }),
    )
    expect(putaway.action.type).toBe('create-mission')
    if (putaway.action.type !== 'create-mission') return
    const bufferAisle = streetTransfer.action.mission.destination.id.split(':')[1]
    expect(putaway.action.mission.role).toBe('putaway')
    expect(putaway.action.mission.destination.address?.startsWith(`${bufferAisle}-`)).toBe(
      true,
    )
  })

  it('encadeia retrátil, transpaleteira e RX antes do caminhão sair', () => {
    const outbound = plan.missions.find((mission) =>
      mission.id.startsWith('outbound-retrieve-'),
    )
    expect(outbound).toBeDefined()
    if (!outbound) return

    const palletId = 'PAL-OUT-TEST'
    const brain = {
      ...createWarehouseBrainState(0),
      pendingOutboundPalletIds: [palletId],
    }
    const retrieval = decideWarehouseBrain(
      brain,
      context({ [palletId]: outbound.source }),
    )
    expect(retrieval.action.type).toBe('create-mission')
    if (retrieval.action.type !== 'create-mission') return
    expect(retrieval.action.mission.destination.id).toMatch(/^outbound-buffer:/)
    expect(retrieval.action.mission.role).toBe('replenishment')
    expect(retrieval.action.mission.eligibleKinds).toEqual(['forklift'])

    const floorTransfer = decideWarehouseBrain(
      retrieval.state,
      context({ [palletId]: retrieval.action.mission.destination }),
    )
    expect(floorTransfer.action.type).toBe('create-mission')
    if (floorTransfer.action.type !== 'create-mission') return
    expect(floorTransfer.action.mission.source.id).toMatch(/^outbound-buffer:/)
    expect(floorTransfer.action.mission.destination.id).toMatch(/^shipping-buffer:/)
    expect(floorTransfer.action.mission.eligibleKinds).toEqual(['pallet-jack'])

    const loading = decideWarehouseBrain(
      floorTransfer.state,
      context({ [palletId]: floorTransfer.action.mission.destination }),
    )
    expect(loading.action.type).toBe('create-mission')
    if (loading.action.type !== 'create-mission') return
    expect(loading.action.mission.source.id).toMatch(/^shipping-buffer:/)
    expect(loading.action.mission.destination.id).toMatch(/^truck:/)
    expect(loading.action.mission.role).toBe('shipping')
    expect(loading.action.mission.eligibleKinds).toEqual(['forklift'])
  })
})
