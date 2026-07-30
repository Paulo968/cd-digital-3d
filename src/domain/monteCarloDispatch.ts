export interface MonteCarloDispatchCandidate {
  id: string
  deterministicCost: number
  priority: number
  emptyTravel: number
  congestion: number
  routeCells: number
  rolePenalty: number
  sequence: number
}

export interface MonteCarloDispatchOptions {
  seed: string
  rollouts?: number
  horizon?: number
  exploration?: number
}

export interface MonteCarloDispatchResult {
  candidateId: string
  expectedCost: number
  robustCost: number
  visits: number
  confidence: number
}

interface CandidateStats {
  candidate: MonteCarloDispatchCandidate
  visits: number
  total: number
  totalSquares: number
}

function seedFromText(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function randomFromSeed(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function rolloutCost(
  candidate: MonteCarloDispatchCandidate,
  random: () => number,
  horizon: number,
): number {
  let cost = candidate.deterministicCost
  let congestion = candidate.congestion
  const routePressure = Math.max(1, candidate.routeCells)

  for (let step = 0; step < horizon; step += 1) {
    const discount = 1 / (1 + step * 0.72)
    const handlingVariation = 2.5 + random() * 8
    const queueDelay = congestion * (18 + random() * 42)
    const routeDelay = Math.sqrt(routePressure) * (1.5 + random() * 4.5)
    const interferenceChance = Math.min(
      0.72,
      congestion * 0.09 + routePressure * 0.0025,
    )
    const safetyPenalty =
      random() < interferenceChance ? 38 + random() * 110 : 0
    const emptyTravelVariation = candidate.emptyTravel * random() * 1.8
    const priorityRelief = candidate.priority === 0 ? 9 + random() * 9 : 0

    cost +=
      discount *
      (handlingVariation +
        queueDelay +
        routeDelay +
        safetyPenalty +
        emptyTravelVariation -
        priorityRelief)

    const congestionDelta = random() < 0.42 ? 1 : -1
    congestion = Math.max(0, congestion + congestionDelta)
  }

  return cost
}

function mean(stats: CandidateStats): number {
  return stats.total / Math.max(1, stats.visits)
}

function deviation(stats: CandidateStats): number {
  if (stats.visits <= 1) return 0
  const average = mean(stats)
  const variance = Math.max(0, stats.totalSquares / stats.visits - average * average)
  return Math.sqrt(variance)
}

export function chooseMonteCarloDispatch(
  candidates: MonteCarloDispatchCandidate[],
  options: MonteCarloDispatchOptions,
): MonteCarloDispatchResult | undefined {
  if (candidates.length === 0) return undefined

  const ordered = [...candidates].sort(
    (left, right) =>
      left.deterministicCost - right.deterministicCost ||
      left.sequence - right.sequence ||
      left.id.localeCompare(right.id),
  )
  const rollouts = Math.max(ordered.length, options.rollouts ?? 72)
  const horizon = Math.max(1, options.horizon ?? 4)
  const exploration = Math.max(0, options.exploration ?? 46)
  const random = randomFromSeed(
    seedFromText(`${options.seed}|${ordered.map((candidate) => candidate.id).join('|')}`),
  )
  const stats: CandidateStats[] = ordered.map((candidate) => ({
    candidate,
    visits: 0,
    total: 0,
    totalSquares: 0,
  }))

  for (let iteration = 0; iteration < rollouts; iteration += 1) {
    const unvisited = stats.find((entry) => entry.visits === 0)
    const selected =
      unvisited ??
      [...stats].sort((left, right) => {
        const totalVisits = Math.max(1, iteration)
        const leftUtility =
          -mean(left) +
          exploration * Math.sqrt(Math.log(totalVisits + 1) / left.visits)
        const rightUtility =
          -mean(right) +
          exploration * Math.sqrt(Math.log(totalVisits + 1) / right.visits)
        return rightUtility - leftUtility
      })[0]

    const sampled = rolloutCost(selected.candidate, random, horizon)
    selected.visits += 1
    selected.total += sampled
    selected.totalSquares += sampled * sampled
  }

  const selected = [...stats].sort((left, right) => {
    const leftRobust = mean(left) + deviation(left) * 0.32
    const rightRobust = mean(right) + deviation(right) * 0.32
    return (
      leftRobust - rightRobust ||
      left.candidate.sequence - right.candidate.sequence ||
      left.candidate.id.localeCompare(right.candidate.id)
    )
  })[0]
  const expectedCost = mean(selected)
  const robustCost = expectedCost + deviation(selected) * 0.32
  const confidence = 1 / (1 + deviation(selected) / Math.max(1, Math.abs(expectedCost)))

  return {
    candidateId: selected.candidate.id,
    expectedCost,
    robustCost,
    visits: selected.visits,
    confidence,
  }
}
