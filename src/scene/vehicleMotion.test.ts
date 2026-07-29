import { describe, expect, it } from 'vitest'
import type { WorldPoint } from '../domain/routePlanning'
import {
  roundPathCorners,
  routeDistance,
  routeLengths,
  sampleRoute,
} from './vehicleMotion'

const path: WorldPoint[] = [
  { x: 0, y: 0.2, z: 0 },
  { x: 8, y: 0.2, z: 0 },
  { x: 8, y: 0.2, z: 8 },
]

describe('vehicleMotion', () => {
  it('preserva origem e destino ao arredondar cantos', () => {
    const rounded = roundPathCorners(path, 1, 6)

    expect(rounded[0]).toEqual(path[0])
    expect(rounded.at(-1)).toEqual(path.at(-1))
    expect(rounded.length).toBeGreaterThan(path.length)
  })

  it('remove a passagem exata pelo vértice de 90 graus', () => {
    const rounded = roundPathCorners(path, 1, 6)
    const containsSharpCorner = rounded.some(
      (point) => point.x === 8 && point.z === 0,
    )

    expect(containsSharpCorner).toBe(false)
  })

  it('finaliza no último ponto da rota dentro da precisão numérica', () => {
    const rounded = roundPathCorners(path, 1, 6)
    const lengths = routeLengths(rounded)
    const total = routeDistance(lengths)
    const sample = sampleRoute(rounded, lengths, total)
    const expected = path.at(-1)!

    expect(sample.finished).toBe(true)
    expect(sample.point.x).toBeCloseTo(expected.x, 10)
    expect(sample.point.y).toBeCloseTo(expected.y, 10)
    expect(sample.point.z).toBeCloseTo(expected.z, 10)
  })
})
