import { describe, expect, it } from 'vitest'
import type { RealisticMissionStop } from './realisticMissionQueue'
import {
  palletActsAsTrafficHazard,
  palletTrafficRadius,
} from './palletCollisionPolicy'

function stop(
  id: string,
  kind: RealisticMissionStop['kind'],
  label = id,
): RealisticMissionStop {
  return {
    id,
    kind,
    label,
    access: { x: 0, y: 0.2, z: -2 },
    restingPoint: { x: 0, y: 0.5, z: 0 },
    facing: 0,
    forkHeight: 0.2,
  }
}

describe('palletCollisionPolicy', () => {
  it('não transforma pallets dentro do caminhão em obstáculos da pista', () => {
    expect(palletActsAsTrafficHazard(stop('truck:1', 'truck'))).toBe(false)
  })

  it('não transforma pallets armazenados no rack em obstáculos da pista', () => {
    expect(palletActsAsTrafficHazard(stop('address:A-01', 'address'))).toBe(
      false,
    )
  })

  it('mantém pallets de buffer como obstáculos com envelope de circulação reduzido', () => {
    const buffer = stop('shipping-buffer:1', 'receiving', 'Pré-embarque 1')

    expect(palletActsAsTrafficHazard(buffer)).toBe(true)
    expect(palletTrafficRadius(buffer)).toBeLessThan(0.5)
  })
})
