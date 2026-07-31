import { describe, expect, it } from 'vitest'
import {
  forkliftCollisionReason,
  stagingPoint,
} from './receivingSimulation'
import {
  COMPACT_RECEIVING_CONFIG,
  COMPACT_STAGING_POINTS,
  FUTURE_TRANSPALLET_LANE,
  createCompactReceivingSimulation,
} from './compactStagingLayout'

describe('staging compacto com faixa futura', () => {
  it('organiza seis posições em duas colunas e três fileiras', () => {
    const points = Array.from({ length: 6 }, (_, index) =>
      stagingPoint(index, COMPACT_RECEIVING_CONFIG),
    )

    expect(points).toEqual(COMPACT_STAGING_POINTS)
    expect(new Set(points.map((point) => point.x)).size).toBe(2)
    expect(new Set(points.map((point) => point.z)).size).toBe(3)

    for (let index = 0; index < points.length; index += 1) {
      for (let other = index + 1; other < points.length; other += 1) {
        expect(
          Math.hypot(
            points[index].x - points[other].x,
            points[index].z - points[other].z,
          ),
        ).toBeGreaterThanOrEqual(4.49)
      }
    }
  })

  it('mantém uma faixa lateral livre para a futura transpaleteira', () => {
    const laneRight =
      FUTURE_TRANSPALLET_LANE.centerX + FUTURE_TRANSPALLET_LANE.width / 2
    const closestPalletEdge =
      Math.min(...COMPACT_STAGING_POINTS.map((point) => point.x)) - 1.875

    expect(closestPalletEdge - laneRight).toBeGreaterThan(0.8)
    expect(FUTURE_TRANSPALLET_LANE.width).toBeGreaterThanOrEqual(4)
    expect(FUTURE_TRANSPALLET_LANE.maneuverRadius).toBeGreaterThanOrEqual(2)
  })

  it('completa dez caminhões sem colisão no novo bloco', () => {
    const simulation = createCompactReceivingSimulation()

    for (let frame = 0; frame < 360_000; frame += 1) {
      simulation.step(1 / 30)
      const state = simulation.read()

      expect(state.fault).toBeNull()
      expect(
        forkliftCollisionReason(
          state,
          state.forklift.position,
          state.forklift.carryingPalletId ?? undefined,
          COMPACT_RECEIVING_CONFIG,
        ),
      ).toBeNull()

      if (state.completedTrucks >= 10) break
    }

    expect(simulation.read().completedTrucks).toBeGreaterThanOrEqual(10)
    expect(simulation.read().fault).toBeNull()
  })
})
