import { describe, expect, it } from 'vitest'
import './receivingPathRefinement'
import { ReceivingSimulation } from './receivingSimulation'

describe('receiving path refinement', () => {
  it('faz a sexta aproximação nascer do staging sem cruzar o lado oposto do CD', () => {
    const simulation = new ReceivingSimulation()
    let observedFrames = 0
    let minimumX = Number.POSITIVE_INFINITY

    for (let frame = 0; frame < 80_000; frame += 1) {
      simulation.step(1 / 30)
      const state = simulation.read()
      expect(state.fault).toBeNull()

      if (state.label.includes('RX20 APROXIMANDO DA DOCA · PALLET 6/6')) {
        observedFrames += 1
        minimumX = Math.min(minimumX, state.forklift.position.x)
      }
      if (observedFrames > 0 && !state.label.includes('PALLET 6/6')) break
    }

    expect(observedFrames).toBeGreaterThan(10)
    expect(minimumX).toBeGreaterThan(0.8)
  })
})
