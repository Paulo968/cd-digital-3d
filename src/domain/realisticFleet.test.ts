import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildRealisticFleetPlan,
  buildTrafficCells,
  chooseMissionForVehicle,
  createMissionStatuses,
  readyMissions,
  trafficCellsConflict,
} from './realisticFleet'
import { generateDemoWarehouse } from './warehouse'

const locations = generateDemoWarehouse(DEFAULT_WAREHOUSE_LAYOUT)
const geometry = {
  receivingX: -17,
  shippingX: 17,
  frontZ: 32.5,
}

function desktopPlan() {
  return buildRealisticFleetPlan(
    DEFAULT_WAREHOUSE_LAYOUT,
    locations,
    geometry,
    false,
  )
}

describe('realisticFleet', () => {
  it('cria duas empilhadeiras e duas transpaleteiras no desktop', () => {
    const plan = desktopPlan()

    expect(plan.vehicles.filter((vehicle) => vehicle.kind === 'forklift')).toHaveLength(2)
    expect(plan.vehicles.filter((vehicle) => vehicle.kind === 'pallet-jack')).toHaveLength(2)
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

  it('aumenta o fluxo e prepara seis posições no caminhão', () => {
    const plan = desktopPlan()

    expect(plan.missions.length).toBeGreaterThanOrEqual(16)
    expect(plan.receivingStops).toHaveLength(3)
    expect(plan.truckStops).toHaveLength(6)
    expect(new Set(plan.missions.map((mission) => mission.palletId)).size).toBeGreaterThan(5)
  })

  it('só libera a armazenagem depois da transferência para a espera', () => {
    const plan = desktopPlan()
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

  it('mantém o pallet bloqueado enquanto o veículo anterior ainda recua', () => {
    const plan = desktopPlan()
    const statuses = createMissionStatuses(plan.missions)
    const stagedStops = {
      ...plan.initialPalletStops,
      'DEMO-IN-01': plan.missions.find((mission) => mission.id === 'putaway-1')!
        .source,
    }

    statuses['inbound-transfer-1'] = 'running'
    const whileRunning = readyMissions(plan.missions, statuses, stagedStops)
    expect(whileRunning.some((mission) => mission.id === 'putaway-1')).toBe(false)

    statuses['inbound-transfer-1'] = 'completed'
    const afterCompletion = readyMissions(plan.missions, statuses, stagedStops)
    expect(afterCompletion.some((mission) => mission.id === 'putaway-1')).toBe(true)
  })

  it('não entrega missão de elevação para a transpaleteira', () => {
    const plan = desktopPlan()
    const jack = plan.vehicles.find((vehicle) => vehicle.kind === 'pallet-jack')!
    const putaway = plan.missions.filter((mission) => mission.role === 'putaway')

    expect(
      chooseMissionForVehicle(jack, putaway, new Set(), new Set()),
    ).toBeUndefined()
  })

  it('evita atribuir duas missões ao mesmo destino reservado', () => {
    const plan = desktopPlan()
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

  it('transforma uma rota em células contínuas de circulação', () => {
    const cells = buildTrafficCells([
      { x: 0, y: 0.2, z: 0 },
      { x: 12, y: 0.2, z: 0 },
    ])

    expect(cells.length).toBeGreaterThan(3)
    expect(new Set(cells).size).toBe(cells.length)
  })

  it('detecta conflito quando duas rotas compartilham um cruzamento', () => {
    const horizontal = buildTrafficCells([
      { x: -8, y: 0.2, z: 0 },
      { x: 8, y: 0.2, z: 0 },
    ])
    const vertical = buildTrafficCells([
      { x: 0, y: 0.2, z: -8 },
      { x: 0, y: 0.2, z: 8 },
    ])

    expect(trafficCellsConflict(horizontal, vertical)).toBe(true)
  })

  it('mantém rotas distantes liberadas para trabalho paralelo', () => {
    const left = buildTrafficCells([
      { x: -20, y: 0.2, z: -8 },
      { x: -20, y: 0.2, z: 8 },
    ])
    const right = buildTrafficCells([
      { x: 20, y: 0.2, z: -8 },
      { x: 20, y: 0.2, z: 8 },
    ])

    expect(trafficCellsConflict(left, right)).toBe(false)
  })

  it('não despacha missão cuja rota cruza outra missão em execução', () => {
    const plan = desktopPlan()
    const conflictingPair = plan.missions
      .flatMap((left) =>
        plan.missions
          .filter(
            (right) =>
              right.id !== left.id &&
              trafficCellsConflict(left.trafficCells, right.trafficCells),
          )
          .map((right) => ({ left, right })),
      )
      .find(({ right }) =>
        plan.vehicles.some(
          (vehicle) =>
            right.eligibleKinds.includes(vehicle.kind) &&
            vehicle.roles.includes(right.role),
        ),
      )

    expect(conflictingPair).toBeDefined()
    const { left, right } = conflictingPair!
    const vehicle = plan.vehicles.find(
      (item) =>
        right.eligibleKinds.includes(item.kind) && item.roles.includes(right.role),
    )!

    expect(
      chooseMissionForVehicle(
        vehicle,
        [right],
        new Set([left.id]),
        new Set(),
      ),
    ).toBeUndefined()
  })
})
