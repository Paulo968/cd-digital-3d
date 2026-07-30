import { describe, expect, it } from 'vitest'
import {
  chooseMonteCarloDispatch,
  type MonteCarloDispatchCandidate,
} from './monteCarloDispatch'

const base: MonteCarloDispatchCandidate = {
  id: 'base',
  deterministicCost: 100,
  priority: 0,
  emptyTravel: 2,
  congestion: 0,
  routeCells: 10,
  rolePenalty: 0,
  sequence: 1,
}

describe('monteCarloDispatch', () => {
  it('é determinístico para a mesma semente e o mesmo estado', () => {
    const candidates = [
      base,
      { ...base, id: 'alternative', deterministicCost: 112, sequence: 2 },
    ]

    const first = chooseMonteCarloDispatch(candidates, {
      seed: 'EMP-AB|estado-1',
      rollouts: 96,
    })
    const second = chooseMonteCarloDispatch(candidates, {
      seed: 'EMP-AB|estado-1',
      rollouts: 96,
    })

    expect(first).toEqual(second)
  })

  it('prefere a alternativa próxima e sem congestionamento', () => {
    const selected = chooseMonteCarloDispatch(
      [
        {
          ...base,
          id: 'near-clear',
          deterministicCost: 80,
          emptyTravel: 1,
          congestion: 0,
        },
        {
          ...base,
          id: 'far-congested',
          deterministicCost: 145,
          emptyTravel: 7,
          congestion: 4,
          routeCells: 22,
          sequence: 2,
        },
      ],
      { seed: 'RX-REC|recebimento', rollouts: 120 },
    )

    expect(selected.candidateId).toBe('near-clear')
    expect(selected.visits).toBeGreaterThan(0)
    expect(selected.confidence).toBeGreaterThan(0)
    expect(selected.confidence).toBeLessThanOrEqual(1)
  })

  it('retorna um estado vazio quando não existem alternativas', () => {
    const selected = chooseMonteCarloDispatch([], {
      seed: 'sem-candidatos',
    })

    expect(selected.candidateId).toBe('')
    expect(selected.visits).toBe(0)
    expect(selected.confidence).toBe(0)
  })
})
