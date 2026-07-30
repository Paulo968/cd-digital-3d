import type { WorldPoint } from './routePlanning'

export type DynamicHazardKind = 'vehicle' | 'person' | 'obstacle'

export interface PlanarVelocity {
  x: number
  z: number
}

export interface DynamicHazard {
  id: string
  kind: DynamicHazardKind
  point: WorldPoint
  radius: number
  active: boolean
  velocity?: PlanarVelocity
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
  ignoredHazardIds?: Iterable<string>
  predictionHorizon?: number
}

export interface SafetyProbeResult {
  hazardId: string | null
  hazardKind: DynamicHazardKind | null
  forwardDistance: number
  lateralDistance: number
  stoppingDistance: number
  safeSpeed: number
  emergency: boolean
  timeToCollision: number
  predictedClearance: number
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

export function sweptCircleTimeOfImpact(
  relativePosition: PlanarVelocity,
  relativeVelocity: PlanarVelocity,
  combinedRadius: number,
): number {
  const radius = Math.max(0, combinedRadius)
  const a =
    relativeVelocity.x * relativeVelocity.x +
    relativeVelocity.z * relativeVelocity.z
  const b =
    2 *
    (relativePosition.x * relativeVelocity.x +
      relativePosition.z * relativeVelocity.z)
  const c =
    relativePosition.x * relativePosition.x +
    relativePosition.z * relativePosition.z -
    radius * radius

  if (c <= 0) return 0
  if (a <= 0.000001) return Number.POSITIVE_INFINITY

  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return Number.POSITIVE_INFINITY

  const root = Math.sqrt(discriminant)
  const first = (-b - root) / (2 * a)
  const second = (-b + root) / (2 * a)
  if (first >= 0) return first
  if (second >= 0) return second
  return Number.POSITIVE_INFINITY
}

function clearanceAtTime(
  relativePosition: PlanarVelocity,
  relativeVelocity: PlanarVelocity,
  time: number,
  combinedRadius: number,
): number {
  const x = relativePosition.x + relativeVelocity.x * time
  const z = relativePosition.z + relativeVelocity.z * time
  return Math.max(0, Math.hypot(x, z) - combinedRadius)
}

function stationaryVehicleHasPriority(
  vehicleId: string,
  ownSpeed: number,
  hazard: DynamicHazard,
  separation: number,
  combinedRadius: number,
): boolean {
  if (hazard.kind !== 'vehicle' || ownSpeed > 0.08) return false
  const hazardVelocity = hazard.velocity ?? { x: 0, z: 0 }
  const hazardSpeed = Math.hypot(hazardVelocity.x, hazardVelocity.z)
  if (hazardSpeed > 0.12) return false
  if (separation > combinedRadius + 0.35) return false

  // Se dois equipamentos estiverem parados e sobrepostos no início,
  // apenas um recebe passagem. A regra é determinística, portanto não
  // permite que os dois avancem ao mesmo tempo nem fiquem travados para sempre.
  return vehicleId.localeCompare(hazard.id) < 0
}

export function probeDynamicSafety(input: SafetyProbeInput): SafetyProbeResult {
  // routePlanning usa atan2(deltaX, deltaZ): facing 0 aponta para +Z.
  const headingX = Math.sin(input.facing)
  const headingZ = Math.cos(input.facing)
  const ownVelocity = {
    x: headingX * Math.max(0, input.speed),
    z: headingZ * Math.max(0, input.speed),
  }
  const ignored = new Set(input.ignoredHazardIds ?? [])
  const predictionHorizon = Math.max(0.5, input.predictionHorizon ?? 3.5)
  let nearest:
    | {
        hazard: DynamicHazard
        forward: number
        lateral: number
        freeDistance: number
        timeToCollision: number
        predictedClearance: number
        urgency: number
      }
    | undefined

  for (const hazard of input.hazards) {
    if (
      !hazard.active ||
      hazard.id === input.vehicleId ||
      ignored.has(hazard.id)
    ) {
      continue
    }

    const deltaX = hazard.point.x - input.point.x
    const deltaZ = hazard.point.z - input.point.z
    const forward = deltaX * headingX + deltaZ * headingZ
    const lateral = Math.abs(deltaX * -headingZ + deltaZ * headingX)
    const combinedRadius =
      input.vehicleRadius + hazard.radius + input.lateralMargin
    const separation = Math.hypot(deltaX, deltaZ)

    if (
      stationaryVehicleHasPriority(
        input.vehicleId,
        input.speed,
        hazard,
        separation,
        combinedRadius,
      )
    ) {
      continue
    }

    const hazardVelocity = hazard.velocity ?? { x: 0, z: 0 }
    const relativeVelocity = {
      x: hazardVelocity.x - ownVelocity.x,
      z: hazardVelocity.z - ownVelocity.z,
    }
    const timeToCollision = sweptCircleTimeOfImpact(
      { x: deltaX, z: deltaZ },
      relativeVelocity,
      combinedRadius,
    )
    const predictedClearance = clearanceAtTime(
      { x: deltaX, z: deltaZ },
      relativeVelocity,
      Math.min(
        predictionHorizon,
        Number.isFinite(timeToCollision) ? timeToCollision : predictionHorizon,
      ),
      combinedRadius,
    )
    const inCurrentLane =
      forward >= -input.vehicleRadius && lateral <= combinedRadius
    const predictedContact =
      Number.isFinite(timeToCollision) && timeToCollision <= predictionHorizon

    if (!inCurrentLane && !predictedContact) continue

    const freeDistance = Math.max(
      0,
      forward - input.vehicleRadius - hazard.radius,
    )
    const urgency =
      freeDistance +
      (Number.isFinite(timeToCollision)
        ? timeToCollision * Math.max(0.5, input.speed)
        : 1000)
    if (!nearest || urgency < nearest.urgency) {
      nearest = {
        hazard,
        forward,
        lateral,
        freeDistance,
        timeToCollision,
        predictedClearance,
        urgency,
      }
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
      timeToCollision: Number.POSITIVE_INFINITY,
      predictedClearance: Number.POSITIVE_INFINITY,
    }
  }

  const availableDistance = Math.max(0, nearest.freeDistance - input.reactionBuffer)
  const distanceSafeSpeed = Math.sqrt(
    Math.max(0, 2 * input.brakingDeceleration * availableDistance),
  )
  const collisionSafeSpeed = Number.isFinite(nearest.timeToCollision)
    ? Math.max(
        0,
        nearest.freeDistance /
          Math.max(0.45, nearest.timeToCollision + input.reactionBuffer * 0.35),
      )
    : Number.POSITIVE_INFINITY
  const safeSpeed = Math.min(distanceSafeSpeed, collisionSafeSpeed)
  const emergencyByTime =
    Number.isFinite(nearest.timeToCollision) &&
    nearest.timeToCollision <= Math.max(0.55, input.reactionBuffer)

  return {
    hazardId: nearest.hazard.id,
    hazardKind: nearest.hazard.kind,
    forwardDistance: nearest.forward,
    lateralDistance: nearest.lateral,
    stoppingDistance: requiredStoppingDistance,
    safeSpeed,
    emergency:
      nearest.freeDistance <= requiredStoppingDistance || emergencyByTime,
    timeToCollision: nearest.timeToCollision,
    predictedClearance: nearest.predictedClearance,
  }
}
