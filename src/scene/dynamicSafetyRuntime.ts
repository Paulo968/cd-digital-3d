import {
  forgetTrafficFlowVehicle,
  resetTrafficFlowMemory,
  type DynamicHazard,
  type PlanarVelocity,
} from '../domain/dynamicSafety'
import type { WorldPoint } from '../domain/routePlanning'
import {
  resolveVehicleContactMotion,
  type VehicleContactResolution,
} from '../domain/vehicleContact'
import {
  publishOperationVehicleRuntime,
  setOperationVehicleFault,
} from '../store/operationsControlStore'

export interface RuntimeVehicleState {
  id: string
  point: WorldPoint
  radius: number
  speed: number
  active: boolean
  velocity?: PlanarVelocity
  updatedAt?: number
}

const hazards = new Map<string, DynamicHazard>()
const vehicles = new Map<string, RuntimeVehicleState>()
const faultedVehicles = new Set<string>()
const telemetryPublishedAt = new Map<string, number>()
const telemetryActiveState = new Map<string, boolean>()

function publishTelemetry(state: RuntimeVehicleState): void {
  const now = Date.now()
  const previousAt = telemetryPublishedAt.get(state.id) ?? 0
  const previousActive = telemetryActiveState.get(state.id)
  const activeChanged = previousActive !== state.active
  const interval = state.active ? 300 : 750
  if (!activeChanged && now - previousAt < interval) return

  telemetryPublishedAt.set(state.id, now)
  telemetryActiveState.set(state.id, state.active)
  publishOperationVehicleRuntime(state.id, state.speed, state.active, now)
}

function measuredVelocity(
  previous: RuntimeVehicleState | undefined,
  next: RuntimeVehicleState,
  now: number,
): PlanarVelocity {
  if (!next.active || !previous || previous.updatedAt === undefined) {
    return { x: 0, z: 0 }
  }

  const elapsedMilliseconds = now - previous.updatedAt
  const deltaX = next.point.x - previous.point.x
  const deltaZ = next.point.z - previous.point.z

  // Alguns componentes publicam o estado antes e depois do movimento no mesmo
  // quadro. Uma leitura duplicada sem deslocamento não pode apagar a direção
  // que os demais sensores ainda precisam enxergar.
  if (elapsedMilliseconds <= 4 && Math.hypot(deltaX, deltaZ) <= 0.0005) {
    return previous.velocity ?? { x: 0, z: 0 }
  }

  const seconds = Math.max(0.008, elapsedMilliseconds / 1000)
  let x = deltaX / seconds
  let z = deltaZ / seconds
  const magnitude = Math.hypot(x, z)
  const limit = Math.max(1.2, next.speed * 1.65, 7)
  if (magnitude > limit) {
    const scale = limit / magnitude
    x *= scale
    z *= scale
  }

  const previousVelocity = previous.velocity ?? { x: 0, z: 0 }
  return {
    x: previousVelocity.x * 0.58 + x * 0.42,
    z: previousVelocity.z * 0.58 + z * 0.42,
  }
}

function syncVehicleHazard(state: RuntimeVehicleState): void {
  const previousFacing = hazards.get(state.id)?.facing
  const velocity = state.velocity ?? { x: 0, z: 0 }
  const velocityMagnitude = Math.hypot(velocity.x, velocity.z)
  const facing =
    velocityMagnitude > 0.05
      ? Math.atan2(velocity.x, velocity.z)
      : previousFacing

  hazards.set(state.id, {
    id: state.id,
    kind: 'vehicle',
    point: state.point,
    radius: state.radius,
    // O sensor preditivo ignora equipamentos estacionados para não transformar
    // a vaga em um congestionamento permanente. A barreira física abaixo,
    // porém, considera todos os corpos registrados, inclusive os ociosos.
    active: state.active || faultedVehicles.has(state.id),
    velocity: state.velocity,
    facing,
  })
}

export function upsertRuntimeVehicle(state: RuntimeVehicleState): void {
  const now = Date.now()
  const previous = vehicles.get(state.id)
  const velocity = measuredVelocity(previous, state, now)
  const next = { ...state, velocity, updatedAt: now }
  vehicles.set(state.id, next)
  syncVehicleHazard(next)
  publishTelemetry(next)
}

export function removeRuntimeVehicle(vehicleId: string): void {
  vehicles.delete(vehicleId)
  hazards.delete(vehicleId)
  faultedVehicles.delete(vehicleId)
  telemetryPublishedAt.delete(vehicleId)
  telemetryActiveState.delete(vehicleId)
  forgetTrafficFlowVehicle(vehicleId)
}

export function readRuntimeVehicleState(
  vehicleId: string,
): RuntimeVehicleState | undefined {
  return vehicles.get(vehicleId)
}

/**
 * Resolve o movimento final contra todos os equipamentos existentes no mundo,
 * mesmo que estejam sem missão. Essa camada não decide prioridade: ela apenas
 * garante a propriedade física de não penetração.
 */
export function resolveRuntimeVehicleMotion(input: {
  vehicleId: string
  current: WorldPoint
  proposed: WorldPoint
  radius: number
  clearance?: number
}): VehicleContactResolution {
  return resolveVehicleContactMotion({
    ...input,
    bodies: vehicles.values(),
  })
}

export function upsertRuntimeHazard(hazard: DynamicHazard): void {
  hazards.set(hazard.id, hazard)
}

export function removeRuntimeHazard(hazardId: string): void {
  hazards.delete(hazardId)
}

export function readRuntimeHazards(): Iterable<DynamicHazard> {
  return hazards.values()
}

export function setRuntimeVehicleFault(vehicleId: string, faulted: boolean): void {
  if (faulted) faultedVehicles.add(vehicleId)
  else faultedVehicles.delete(vehicleId)
  const vehicle = vehicles.get(vehicleId)
  if (vehicle) syncVehicleHazard(vehicle)
  setOperationVehicleFault(vehicleId, faulted)
}

export function isRuntimeVehicleFaulted(vehicleId: string): boolean {
  return faultedVehicles.has(vehicleId)
}

export function chooseMovingVehicleForFault(): string | null {
  let candidate: RuntimeVehicleState | null = null

  for (const vehicle of vehicles.values()) {
    if (!vehicle.active || vehicle.speed <= 0.55) continue
    if (!candidate || vehicle.speed > candidate.speed) candidate = vehicle
  }

  return candidate?.id ?? null
}

export function resetDynamicSafetyRuntime(): void {
  hazards.clear()
  vehicles.clear()
  faultedVehicles.clear()
  telemetryPublishedAt.clear()
  telemetryActiveState.clear()
  resetTrafficFlowMemory()
}
