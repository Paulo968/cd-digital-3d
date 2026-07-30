import { describe, expect, it } from 'vitest'
import { probeDynamicSafety, stoppingDistance } from './dynamicSafety'

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
  it('aumenta a distância de parada conforme a velocidade', () => {
    expect(stoppingDistance(4, 7.5, 0.8)).toBeGreaterThan(
      stoppingDistance(2, 7.5, 0.8),
    )
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
})
