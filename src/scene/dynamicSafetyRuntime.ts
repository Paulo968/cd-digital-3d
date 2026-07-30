import type { DynamicHazard } from '../domain/dynamicSafety'
import type { WorldPoint } from '../domain/routePlanning'
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

export function upsertRuntimeVehicle(state: RuntimeVehicleState): void {
  vehicles.set(state.id, state)
  hazards.set(state.id, {
    id: state.id,
    kind: 'vehicle',
    point: state.point,
    radius: state.radius,
    active: state.active,
  })
  publishTelemetry(state)
}

export function removeRuntimeVehicle(vehicleId: string): void {
  vehicles.delete(vehicleId)
  hazards.delete(vehicleId)
  faultedVehicles.delete(vehicleId)
  telemetryPublishedAt.delete(vehicleId)
  telemetryActiveState.delete(vehicleId)
}

export function readRuntimeVehicleState(
  vehicleId: string,
): RuntimeVehicleState | undefined {
  return vehicles.get(vehicleId)
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
}
