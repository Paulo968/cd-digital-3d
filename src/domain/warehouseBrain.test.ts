import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildRealisticFleetPlan,
  type FleetMissionStatus,
} from './realisticFleet'
import type { RealisticMissionStop } from './realisticMissionQueue'
import {
  createWarehouseBrainState,
  decideWarehouseBrain,
  type WarehouseBrainContext,
} from './warehouseBrain'
import { generateWarehouseSkeleton } from './warehouse'

const layout = DEFAULT_WAREHOUSE_LAYOUT
const locations = generateWarehouseSkeleton(layout)
const plan = buildRealisticFleetPlan(
  layout,
  locations,
  { frontZ: 30, receivingX: -17, shippingX: 17 },
  false,
)

function colors(): Record<string, string> {
  return Object.fromEntries(
    plan.missions.map((mission) => [mission.palletId, mission.color]),
  )
}

function context(
  overrides: Partial<WarehouseBrainContext> = {},
): WarehouseBrainContext {
  return {
    now: 0,
    compact: false,
    layout,
    locations,
    plan,
    palletStops: {},
    palletColors: colors(),
    missions: [],
    statuses: {},
    ...overrides,
  }
}

function firstStop(
  role: 'putaway' | 'shipping',
  side: 'source' | 'destination',
): RealisticMissionStop {
  const mission = plan.missions.find((item) => item.role === role)
  if (!mission) throw new Error(`Missão ${role} ausente no plano de teste.`)
  return mission[side]
}

describe('warehouseBrain', () => {
  it('cria um pallet novo quando existe recebimento e reserva livres', () => {
    const decision = decideWarehouseBrain(createWarehouseBrainState(0),
      context({ now: 6_000 }),
    )

    expect(decision.action.type).toBe('receive-pallet')
    if (decision.action.type === 'receive-pallet') {
      expect(decision.action.palletId).toBe('LIVE-IN-0001')
      expect(decision.action.stop.id).toBe(plan.receivingStops[0].id)
    }
  })

  it('cria ordem automática para um pallet realmente armazenado', () => {
    const reserve = firstStop('putaway', 'destination')
    const pickingSources = plan.missions
      .filter((mission) => mission.role === 'shipping')
      .map((mission) => mission.source)
      .filter(
        (stop, index, values) =>
          values.findIndex((candidate) => candidate.id === stop.id) === index,
      )
      .slice(0, 2)
    const palletStops = {
      'PAL-RES': reserve,
      'PAL-PICK-1': pickingSources[0],
      'PAL-PICK-2': pickingSources[1],
    }

    const decision = decideWarehouseBrain(
      createWarehouseBrainState(0),
      context({ now: 5_000, palletStops }),
    )

    expect(decision.action.type).toBe('create-order')
    if (decision.action.type === 'create-order') {
      expect(Object.keys(palletStops)).toContain(decision.action.palletId)
    }
  })

  it('transforma uma ordem da reserva em missão de expedição', () => {
    const reserve = firstStop('putaway', 'destination')
    const brain = {
      ...createWarehouseBrainState(0),
      pendingOutboundPalletIds: ['PAL-RES'],
    }
    const decision = decideWarehouseBrain(
      brain,
      context({
        palletStops: { 'PAL-RES': reserve },
        palletColors: { 'PAL-RES': '#38bdf8' },
      }),
    )

    expect(decision.action.type).toBe('create-mission')
    if (decision.action.type === 'create-mission') {
      expect(decision.action.mission.role).toBe('shipping')
      expect(decision.action.mission.eligibleKinds).toEqual(['forklift'])
      expect(decision.action.mission.source.id).toBe(reserve.id)
    }
  })

  it('remove do estoque os pallets embarcados quando o caminhão parte', () => {
    const palletStops = Object.fromEntries(
      plan.truckStops.slice(0, 3).map((stop, index) => [
        `TRUCK-${index + 1}`,
        stop,
      ]),
    )
    const brain = {
      ...createWarehouseBrainState(0),
      truckLoadedAt: 0,
      pendingOutboundPalletIds: Object.keys(palletStops),
    }
    const decision = decideWarehouseBrain(
      brain,
      context({ now: 11_000, palletStops }),
    )

    expect(decision.action.type).toBe('depart-truck')
    if (decision.action.type === 'depart-truck') {
      expect(decision.action.palletIds).toHaveLength(3)
      expect(decision.state.shippedPallets).toBe(3)
      expect(decision.state.pendingOutboundPalletIds).toHaveLength(0)
    }
  })

  it('não duplica missão para um pallet que já está em execução', () => {
    const reserve = firstStop('putaway', 'destination')
    const existing = plan.missions.find((mission) => mission.role === 'shipping')!
    const mission = {
      ...existing,
      id: 'running-pal-res',
      palletId: 'PAL-RES',
      source: reserve,
    }
    const statuses: Record<string, FleetMissionStatus> = {
      [mission.id]: 'running',
    }
    const decision = decideWarehouseBrain(
      {
        ...createWarehouseBrainState(0),
        pendingOutboundPalletIds: ['PAL-RES'],
      },
      context({
        palletStops: { 'PAL-RES': reserve },
        palletColors: { 'PAL-RES': '#38bdf8' },
        missions: [mission],
        statuses,
      }),
    )

    expect(decision.action.type).not.toBe('create-mission')
  })
})
