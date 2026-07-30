import { beforeEach, describe, expect, it } from 'vitest'
import {
  probeDynamicSafety,
  resetTrafficFlowMemory,
  stoppingDistance,
  sweptCircleTimeOfImpact,
} from './dynamicSafety'

const baseInput = {
  vehicleId: 'EMP-01',
  point: { x: 0, y: 0.2, z: 0 },
  facing: 0,
  speed: 3,
  vehicleRadius: 0.8,
  brakingDeceleration: 7.5,
  reactionBuffer: 0.8,
  lateralMargin: 0.25,
}

describe('dynamicSafety', () => {
  beforeEach(() => {
    resetTrafficFlowMemory()
  })

  it('aumenta a distância de parada conforme a velocidade', () => {
    expect(stoppingDistance(4, 7.5, 0.8)).toBeGreaterThan(
      stoppingDistance(2, 7.5, 0.8),
    )
  })

  it('calcula o primeiro contato entre volumes circulares em movimento', () => {
    const time = sweptCircleTimeOfImpact(
      { x: 0, z: 5 },
      { x: 0, z: -2 },
      1,
    )

    expect(time).toBeCloseTo(2, 5)
  })

  it('aciona emergência para uma pessoa diretamente à frente', () => {
    const result = probeDynamicSafety({
      ...baseInput,
      hazards: [
        {
          id: 'person-1',
          kind: 'person',
          point: { x: 0, y: 0.2, z: 2.2 },
          radius: 0.35,
          active: true,
        },
      ],
    })

    expect(result.emergency).toBe(true)
    expect(result.hazardId).toBe('person-1')
    expect(result.safeSpeed).toBeLessThan(baseInput.speed)
    expect(result.timeToCollision).toBeLessThan(Number.POSITIVE_INFINITY)
  })

  it('ignora obstáculo fora da faixa lateral do veículo', () => {
    const result = probeDynamicSafety({
      ...baseInput,
      hazards: [
        {
          id: 'crate-1',
          kind: 'obstacle',
          point: { x: 4, y: 0.2, z: 2 },
          radius: 0.65,
          active: true,
        },
      ],
    })

    expect(result.hazardId).toBeNull()
    expect(result.emergency).toBe(false)
  })

  it('ignora veículo que já ficou para trás', () => {
    const result = probeDynamicSafety({
      ...baseInput,
      hazards: [
        {
          id: 'EMP-02',
          kind: 'vehicle',
          point: { x: 0, y: 0.2, z: -3 },
          radius: 0.8,
          active: true,
        },
      ],
    })

    expect(result.hazardId).toBeNull()
  })

  it('prevê a entrada lateral de outro veículo na trajetória', () => {
    const result = probeDynamicSafety({
      ...baseInput,
      speed: 2,
      predictionHorizon: 4,
      hazards: [
        {
          id: 'EMP-CROSS',
          kind: 'vehicle',
          point: { x: 4, y: 0.2, z: 4 },
          radius: 0.8,
          active: true,
          velocity: { x: -2, z: 0 },
        },
      ],
    })

    expect(result.hazardId).toBe('EMP-CROSS')
    expect(result.timeToCollision).toBeLessThan(4)
    expect(result.safeSpeed).toBeLessThan(Number.POSITIVE_INFINITY)
  })

  it('permite ignorar o pallet-alvo durante o encaixe dos garfos', () => {
    const result = probeDynamicSafety({
      ...baseInput,
      ignoredHazardIds: ['floor-pallet:PAL-01'],
      hazards: [
        {
          id: 'floor-pallet:PAL-01',
          kind: 'obstacle',
          point: { x: 0, y: 0.2, z: 1.5 },
          radius: 0.68,
          active: true,
        },
      ],
    })

    expect(result.hazardId).toBeNull()
  })

  it('escolhe o risco mais próximo no mesmo corredor', () => {
    const result = probeDynamicSafety({
      ...baseInput,
      hazards: [
        {
          id: 'far',
          kind: 'vehicle',
          point: { x: 0, y: 0.2, z: 8 },
          radius: 0.8,
          active: true,
        },
        {
          id: 'near',
          kind: 'obstacle',
          point: { x: 0.1, y: 0.2, z: 3 },
          radius: 0.6,
          active: true,
        },
      ],
    })

    expect(result.hazardId).toBe('near')
  })

  it('dá passagem a apenas um veículo quando dois agentes começam sobrepostos', () => {
    const hazard = {
      id: 'EMP-02',
      kind: 'vehicle' as const,
      point: { x: 0, y: 0.2, z: 0.15 },
      radius: 0.8,
      active: true,
      velocity: { x: 0, z: 0 },
      facing: Math.PI,
    }

    const first = probeDynamicSafety({
      ...baseInput,
      vehicleId: 'EMP-01',
      speed: 0,
      now: 1_000,
      hazards: [hazard],
    })
    const second = probeDynamicSafety({
      ...baseInput,
      vehicleId: 'EMP-02',
      point: hazard.point,
      facing: Math.PI,
      speed: 0,
      now: 1_010,
      hazards: [
        {
          ...hazard,
          id: 'EMP-01',
          point: baseInput.point,
          facing: 0,
        },
      ],
    })

    expect(first.hazardId).toBeNull()
    expect(first.safeSpeed).toBeGreaterThan(0.08)
    expect(second.hazardId).toBe('EMP-01')
    expect(second.safeSpeed).toBe(0)
  })

  it('mantém o vencedor em movimento até liberar o conflito', () => {
    const stopped = {
      id: 'EMP-02',
      kind: 'vehicle' as const,
      point: { x: 0, y: 0.2, z: 0.15 },
      radius: 0.8,
      active: true,
      velocity: { x: 0, z: 0 },
      facing: Math.PI,
    }

    probeDynamicSafety({
      ...baseInput,
      speed: 0,
      now: 2_000,
      hazards: [stopped],
    })
    const moving = probeDynamicSafety({
      ...baseInput,
      speed: 0.45,
      now: 2_700,
      hazards: [stopped],
    })

    expect(moving.hazardId).toBeNull()
    expect(moving.safeSpeed).toBeGreaterThan(0.08)
  })

  it('não transforma uma fila no mesmo sentido em ultrapassagem', () => {
    const result = probeDynamicSafety({
      ...baseInput,
      vehicleId: 'EMP-02',
      speed: 0,
      now: 5_000,
      hazards: [
        {
          id: 'EMP-01',
          kind: 'vehicle',
          point: { x: 0, y: 0.2, z: 2.5 },
          radius: 0.8,
          active: true,
          velocity: { x: 0, z: 0.2 },
          facing: 0,
        },
      ],
    })

    expect(result.hazardId).toBe('EMP-01')
    expect(result.safeSpeed).toBeLessThan(Number.POSITIVE_INFINITY)
  })
})
