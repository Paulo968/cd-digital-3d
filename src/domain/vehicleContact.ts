import type { WorldPoint } from './routePlanning'

export interface VehicleContactBody {
  id: string
  point: WorldPoint
  radius: number
}

export interface VehicleContactResolution {
  point: WorldPoint
  fraction: number
  blockedBy: string | null
  touching: boolean
}

const POSITION_EPSILON = 0.0001
const CONTACT_PADDING = 0.015

function planarDistance(
  left: Pick<WorldPoint, 'x' | 'z'>,
  right: Pick<WorldPoint, 'x' | 'z'>,
): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function firstContactFraction(
  current: WorldPoint,
  proposed: WorldPoint,
  body: VehicleContactBody,
  minimumDistance: number,
): number {
  const movementX = proposed.x - current.x
  const movementZ = proposed.z - current.z
  const movementSquared = movementX * movementX + movementZ * movementZ
  const fromCenterX = current.x - body.point.x
  const fromCenterZ = current.z - body.point.z
  const currentDistance = Math.hypot(fromCenterX, fromCenterZ)
  const proposedDistance = planarDistance(proposed, body.point)

  if (movementSquared <= POSITION_EPSILON * POSITION_EPSILON) {
    return currentDistance < minimumDistance ? 0 : 1
  }

  // Se algum estado antigo já deixou os corpos sobrepostos, permitimos somente
  // movimento que aumente a separação. Isso corrige a penetração sem prender o
  // equipamento para sempre no ponto inválido.
  if (currentDistance < minimumDistance - POSITION_EPSILON) {
    return proposedDistance > currentDistance + POSITION_EPSILON ? 1 : 0
  }

  // Encostado e afastando: o contato não pode impedir a saída.
  const movementDot = fromCenterX * movementX + fromCenterZ * movementZ
  if (
    currentDistance <= minimumDistance + POSITION_EPSILON &&
    movementDot >= 0
  ) {
    return 1
  }

  const a = movementSquared
  const b = 2 * movementDot
  const c =
    fromCenterX * fromCenterX +
    fromCenterZ * fromCenterZ -
    minimumDistance * minimumDistance
  const discriminant = b * b - 4 * a * c

  if (discriminant < 0) return proposedDistance < minimumDistance ? 0 : 1

  const root = (-b - Math.sqrt(discriminant)) / (2 * a)
  if (root < 0 || root > 1) return proposedDistance < minimumDistance ? 0 : 1

  const movementLength = Math.sqrt(movementSquared)
  const paddingFraction = Math.min(root, CONTACT_PADDING / movementLength)
  return Math.max(0, root - paddingFraction)
}

/**
 * Resolve a translação no plano XZ usando corpos circulares rígidos.
 *
 * A segurança preditiva continua responsável por frear antes do contato. Esta
 * função é a barreira final: mesmo com atraso de sensor, queda de FPS ou um
 * veículo parado, o centro de um equipamento nunca atravessa o volume do outro.
 */
export function resolveVehicleContactMotion(input: {
  vehicleId: string
  current: WorldPoint
  proposed: WorldPoint
  radius: number
  bodies: Iterable<VehicleContactBody>
  clearance?: number
}): VehicleContactResolution {
  const clearance = input.clearance ?? 0.08
  let fraction = 1
  let blockedBy: string | null = null

  for (const body of input.bodies) {
    if (body.id === input.vehicleId) continue
    const minimumDistance = Math.max(0, input.radius + body.radius + clearance)
    const candidate = firstContactFraction(
      input.current,
      input.proposed,
      body,
      minimumDistance,
    )
    if (candidate >= fraction) continue
    fraction = candidate
    blockedBy = body.id
  }

  return {
    point: {
      x: input.current.x + (input.proposed.x - input.current.x) * fraction,
      y: input.current.y + (input.proposed.y - input.current.y) * fraction,
      z: input.current.z + (input.proposed.z - input.current.z) * fraction,
    },
    fraction,
    blockedBy,
    touching: fraction < 0.9999,
  }
}
