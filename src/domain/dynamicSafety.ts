import type { WorldPoint } from './routePlanning'

export type DynamicHazardKind = 'vehicle' | 'person' | 'obstacle'

export interface DynamicHazard {
  id: string
  kind: DynamicHazardKind
  point: WorldPoint
  radius: number
  active: boolean
}

export interface SafetyProbeInput {
  vehicleId: string
  point: WorldPoint
  facing: number
  speed: number
  vehicleRadius: number
  hazards: Iterable<DynamicHazard>
  brakingDeceleration: number
  reactionBuffer: number
  lateralMargin: number
}

export interface SafetyProbeResult {
  hazardId: string | null
  hazardKind: DynamicHazardKind | null
  forwardDistance: number
  lateralDistance: number
  stoppingDistance: number
  safeSpeed: number
  emergency: boolean
}

const NO_HAZARD_DISTANCE = Number.POSITIVE_INFINITY

export function stoppingDistance(
  speed: number,
  brakingDeceleration: number,
  reactionBuffer: number,
): number {
  if (speed <= 0) return reactionBuffer
  return (speed * speed) / (2 * Math.max(0.01, brakingDeceleration)) + reactionBuffer
}

export function probeDynamicSafety(input: SafetyProbeInput): SafetyProbeResult {
  // routePlanning usa atan2(deltaX, deltaZ): facing 0 aponta para +Z.
  const headingX = Math.sin(input.facing)
  const headingZ = Math.cos(input.facing)
  let nearest:
    | {
        hazard: DynamicHazard
        forward: number
        lateral: number
        freeDistance: number
      }
    | undefined

  for (const hazard of input.hazards) {
    if (!hazard.active || hazard.id === input.vehicleId) continue

    const deltaX = hazard.point.x - input.point.x
    const deltaZ = hazard.point.z - input.point.z
    const forward = deltaX * headingX + deltaZ * headingZ
    const lateral = Math.abs(deltaX * -headingZ + deltaZ * headingX)
    const clearance = input.vehicleRadius + hazard.radius + input.lateralMargin

    if (forward < -input.vehicleRadius || lateral > clearance) continue

    const freeDistance = Math.max(
      0,
      forward - input.vehicleRadius - hazard.radius,
    )
    if (!nearest || freeDistance < nearest.freeDistance) {
      nearest = { hazard, forward, lateral, freeDistance }
    }
  }

  const requiredStoppingDistance = stoppingDistance(
    input.speed,
    input.brakingDeceleration,
    input.reactionBuffer,
  )

  if (!nearest) {
    return {
      hazardId: null,
      hazardKind: null,
      forwardDistance: NO_HAZARD_DISTANCE,
      lateralDistance: NO_HAZARD_DISTANCE,
      stoppingDistance: requiredStoppingDistance,
      safeSpeed: Number.POSITIVE_INFINITY,
      emergency: false,
    }
  }

  const availableDistance = Math.max(0, nearest.freeDistance - input.reactionBuffer)
  const safeSpeed = Math.sqrt(
    Math.max(0, 2 * input.brakingDeceleration * availableDistance),
  )

  return {
    hazardId: nearest.hazard.id,
    hazardKind: nearest.hazard.kind,
    forwardDistance: nearest.forward,
    lateralDistance: nearest.lateral,
    stoppingDistance: requiredStoppingDistance,
    safeSpeed,
    emergency: nearest.freeDistance <= requiredStoppingDistance,
  }
}
