import { describe, expect, it } from 'vitest'
import { DEFAULT_WAREHOUSE_LAYOUT } from './layout'
import {
  buildTravelPath,
  getAisleClearanceIssues,
  type WorldPoint,
} from './routePlanning'

const rowA = DEFAULT_WAREHOUSE_LAYOUT.rackRows[0]
const rowG = DEFAULT_WAREHOUSE_LAYOUT.rackRows.at(-1)!
const from: WorldPoint = { x: -5, y: 0.2, z: rowA.origin.z }
const to: WorldPoint = { x: 5, y: 0.2, z: rowG.origin.z }

describe('routePlanning graph', () => {
  it('mantém deslocamento direto quando os pontos estão na mesma rua', () => {
    const sameRowTarget: WorldPoint = { x: 6, y: 0.2, z: rowA.origin.z }
    const path = buildTravelPath(
      DEFAULT_WAREHOUSE_LAYOUT,
      from,
      sameRowTarget,
      { left: false, right: false },
    )

    expect(path).toEqual([from, sameRowTarget])
  })

  it('respeita o bloqueio da cabeceira esquerda', () => {
    const path = buildTravelPath(DEFAULT_WAREHOUSE_LAYOUT, from, to, {
      left: true,
      right: false,
    })

    expect(path.some((point) => point.x > 10)).toBe(true)
  })

  it('bloqueia viagens entre ruas quando as duas cabeceiras estão fechadas', () => {
    expect(() =>
      buildTravelPath(DEFAULT_WAREHOUSE_LAYOUT, from, to, {
        left: true,
        right: true,
      }),
    ).toThrow(/duas cabeceiras estão bloqueadas/i)
  })

  it('considera a largura padrão adequada para a empilhadeira demonstrativa', () => {
    expect(getAisleClearanceIssues(DEFAULT_WAREHOUSE_LAYOUT)).toEqual([])
  })
})
