import { describe, expect, it } from 'vitest'
import {
  angleDistance,
  forkliftCollisionReason,
  forkliftInsideTrailer,
  RECEIVING_V2,
  ReceivingSimulation,
  stagingPoint,
  truckPalletPoint,
} from './receivingSimulation'

describe('ReceivingSimulation V2', () => {
  it('define seis posições distintas no caminhão e no staging', () => {
    const truckPoints = Array.from({ length: 6 }, (_, index) =>
      truckPalletPoint(index),
    )
    const stagePoints = Array.from({ length: 6 }, (_, index) =>
      stagingPoint(index),
    )

    expect(new Set(truckPoints.map((point) => `${point.x}:${point.z}`)).size).toBe(6)
    expect(new Set(stagePoints.map((point) => `${point.x}:${point.z}`)).size).toBe(6)
    expect(
      stagePoints.every((point, index) =>
        stagePoints
          .slice(index + 1)
          .every(
            (other) => Math.hypot(point.x - other.x, point.z - other.z) >= 5.9,
          ),
      ),
    ).toBe(true)
  })

  it('mantém a empilhadeira reta sempre que ela está dentro da carroceria', () => {
    const simulation = new ReceivingSimulation()
    let inspectedInside = 0

    for (let frame = 0; frame < 90_000; frame += 1) {
      simulation.step(1 / 30)
      const state = simulation.read()
      expect(state.fault).toBeNull()

      if (forkliftInsideTrailer(state.forklift.position)) {
        inspectedInside += 1
        expect(angleDistance(state.forklift.heading, Math.PI)).toBeLessThan(0.035)
      }
      if (state.completedTrucks >= 2) break
    }

    expect(inspectedInside).toBeGreaterThan(30)
    expect(simulation.read().completedTrucks).toBeGreaterThanOrEqual(2)
  })

  it('completa dez caminhões sem colisão, sobreposição ou parada permanente', () => {
    const simulation = new ReceivingSimulation()
    let maximumFramesWithoutRevision = 0
    let framesWithoutRevision = 0
    let previousRevision = simulation.read().revision

    for (let frame = 0; frame < 360_000; frame += 1) {
      simulation.step(1 / 30)
      const state = simulation.read()
      expect(state.fault).toBeNull()

      const collision = forkliftCollisionReason(
        state,
        state.forklift.position,
        state.forklift.carryingPalletId ?? undefined,
      )
      expect(collision).toBeNull()

      if (state.revision === previousRevision) {
        framesWithoutRevision += 1
        maximumFramesWithoutRevision = Math.max(
          maximumFramesWithoutRevision,
          framesWithoutRevision,
        )
      } else {
        previousRevision = state.revision
        framesWithoutRevision = 0
      }

      if (state.completedTrucks >= 10) break
    }

    const final = simulation.read()
    expect(final.completedTrucks).toBeGreaterThanOrEqual(10)
    expect(final.batch).toBeGreaterThanOrEqual(11)
    expect(final.fault).toBeNull()
    expect(maximumFramesWithoutRevision).toBeLessThan(1_800)
  })

  it('mantém a zona de manobra e os pallets dentro das dimensões do novo CD', () => {
    const halfWidth = RECEIVING_V2.floorWidth / 2
    const halfDepth = RECEIVING_V2.floorDepth / 2

    for (let index = 0; index < 6; index += 1) {
      const truck = truckPalletPoint(index)
      const stage = stagingPoint(index)
      expect(Math.abs(truck.x)).toBeLessThan(RECEIVING_V2.trailerHalfWidth)
      expect(truck.z).toBeGreaterThan(RECEIVING_V2.trailerRearZ)
      expect(truck.z).toBeLessThan(RECEIVING_V2.trailerFrontZ)
      expect(Math.abs(stage.x)).toBeLessThan(halfWidth)
      expect(Math.abs(stage.z)).toBeLessThan(halfDepth)
    }
    expect(RECEIVING_V2.truckClearZ).toBeLessThan(RECEIVING_V2.trailerRearZ - 8)
  })
})
