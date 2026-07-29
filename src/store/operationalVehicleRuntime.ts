import type { WorldPoint } from '../domain/routePlanning'

export interface OperationalVehicleRuntimePose {
  point: WorldPoint
  facing: number
  label: string
  updatedAt: number
}

let runtimePose: OperationalVehicleRuntimePose | null = null

function safeCoordinate(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

export function setOperationalVehicleRuntimePose(
  point: WorldPoint,
  facing: number,
  label = 'Em deslocamento',
): void {
  runtimePose = {
    point: {
      x: safeCoordinate(point.x),
      y: safeCoordinate(point.y, 0.2),
      z: safeCoordinate(point.z),
    },
    facing: safeCoordinate(facing),
    label: label.trim() || 'Em deslocamento',
    updatedAt: performance.now(),
  }
}

export function getOperationalVehicleRuntimePose():
  | OperationalVehicleRuntimePose
  | null {
  return runtimePose
}

export function clearOperationalVehicleRuntimePose(): void {
  runtimePose = null
}
