import * as THREE from 'three'
import type { WorldPoint } from '../domain/routePlanning'

export interface RouteSample {
  point: WorldPoint
  facing: number
  finished: boolean
}

function distance(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function normalize(x: number, z: number): { x: number; z: number; length: number } {
  const length = Math.hypot(x, z)
  if (length <= 0.0001) return { x: 0, z: 0, length: 0 }
  return { x: x / length, z: z / length, length }
}

function append(points: WorldPoint[], point: WorldPoint): void {
  const previous = points.at(-1)
  if (!previous || distance(previous, point) > 0.001) points.push(point)
}

export function roundPathCorners(
  points: WorldPoint[],
  radius = 0.85,
  samplesPerCorner = 5,
): WorldPoint[] {
  if (points.length < 3) return points

  const rounded: WorldPoint[] = [points[0]]

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const incoming = normalize(corner.x - previous.x, corner.z - previous.z)
    const outgoing = normalize(next.x - corner.x, next.z - corner.z)
    const dot = incoming.x * outgoing.x + incoming.z * outgoing.z

    if (incoming.length === 0 || outgoing.length === 0 || dot > 0.995) {
      append(rounded, corner)
      continue
    }

    const cut = Math.min(radius, incoming.length * 0.32, outgoing.length * 0.32)
    const entry: WorldPoint = {
      x: corner.x - incoming.x * cut,
      y: corner.y,
      z: corner.z - incoming.z * cut,
    }
    const exit: WorldPoint = {
      x: corner.x + outgoing.x * cut,
      y: corner.y,
      z: corner.z + outgoing.z * cut,
    }
    append(rounded, entry)

    for (let sample = 1; sample <= samplesPerCorner; sample += 1) {
      const t = sample / samplesPerCorner
      const inverse = 1 - t
      append(rounded, {
        x:
          inverse * inverse * entry.x +
          2 * inverse * t * corner.x +
          t * t * exit.x,
        y: corner.y,
        z:
          inverse * inverse * entry.z +
          2 * inverse * t * corner.z +
          t * t * exit.z,
      })
    }
  }

  append(rounded, points.at(-1)!)
  return rounded
}

export function routeLengths(points: WorldPoint[]): number[] {
  return points.slice(1).map((point, index) => distance(points[index], point))
}

export function routeDistance(lengths: number[]): number {
  return lengths.reduce((total, value) => total + value, 0)
}

export function sampleRoute(
  points: WorldPoint[],
  lengths: number[],
  travelledDistance: number,
): RouteSample {
  if (points.length === 0) {
    return { point: { x: 0, y: 0.2, z: 0 }, facing: 0, finished: true }
  }
  if (points.length === 1) {
    return { point: points[0], facing: 0, finished: true }
  }

  const total = routeDistance(lengths)
  let remaining = Math.min(Math.max(0, travelledDistance), total)
  let segment = 0

  while (segment < lengths.length && remaining > lengths[segment]) {
    remaining -= lengths[segment]
    segment += 1
  }

  if (segment >= lengths.length) {
    const last = points.at(-1)!
    const before = points.at(-2)!
    return {
      point: last,
      facing: Math.atan2(last.x - before.x, last.z - before.z),
      finished: true,
    }
  }

  const from = points[segment]
  const to = points[segment + 1]
  const ratio = lengths[segment] === 0 ? 1 : remaining / lengths[segment]
  return {
    point: {
      x: THREE.MathUtils.lerp(from.x, to.x, ratio),
      y: THREE.MathUtils.lerp(from.y, to.y, ratio),
      z: THREE.MathUtils.lerp(from.z, to.z, ratio),
    },
    facing: Math.atan2(to.x - from.x, to.z - from.z),
    finished: travelledDistance >= total,
  }
}

export function angleTowards(current: number, target: number, ratio: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * Math.min(1, Math.max(0, ratio))
}

export function moveNumber(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target
  return current + Math.sign(target - current) * maximumDelta
}

export function approachSpeed(
  current: number,
  target: number,
  acceleration: number,
  delta: number,
): number {
  return moveNumber(current, target, acceleration * delta)
}

export function placeVehicle(
  group: THREE.Group,
  sample: RouteSample,
  turnResponsiveness: number,
  delta: number,
): void {
  group.position.set(sample.point.x, 0.18, sample.point.z)
  group.rotation.y = angleTowards(
    group.rotation.y,
    sample.facing,
    delta * turnResponsiveness,
  )
}
