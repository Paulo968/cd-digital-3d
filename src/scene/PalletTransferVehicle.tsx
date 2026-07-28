import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import type { PalletTransferSimulation } from '../domain/palletTransferSimulation'
import type { WorldPoint } from '../domain/routePlanning'
import type { WarehouseLocation } from '../domain/warehouse'

export type PalletTransferPhase =
  | 'idle'
  | 'going-to-source'
  | 'collecting'
  | 'transporting'
  | 'depositing'
  | 'completed'

export interface PalletTransferVisualState {
  hiddenSource: boolean
  cargoAtDestination: boolean
  phase: PalletTransferPhase
}

export const EMPTY_TRANSFER_VISUAL: PalletTransferVisualState = {
  hiddenSource: false,
  cargoAtDestination: false,
  phase: 'idle',
}

const TRAVEL_FORK_HEIGHT = 0.36
const APPROACH_DISTANCE = 0.9
const EMPTY_TRAVEL_SPEED = 4.2
const LOADED_TRAVEL_SPEED = 3.2
const LIFT_SPEED = 2.6
const TURN_DURATION = 0.45
const APPROACH_DURATION = 0.5
const HANDLING_PAUSE = 0.6

function colorForSku(sku: string): string {
  const palette = [
    '#60a5fa',
    '#34d399',
    '#fbbf24',
    '#f472b6',
    '#a78bfa',
    '#fb7185',
    '#22d3ee',
    '#c084fc',
  ]
  const hash = [...sku].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
  return palette[hash % palette.length]
}

function routeLengths(points: WorldPoint[]): number[] {
  return points.slice(1).map((point, index) => {
    return Math.hypot(point.x - points[index].x, point.z - points[index].z)
  })
}

function routeTotal(lengths: number[]): number {
  return lengths.reduce((total, value) => total + value, 0)
}

function placeOnRoute(
  group: THREE.Group,
  points: WorldPoint[],
  lengths: number[],
  distance: number,
): boolean {
  if (points.length === 0) return true
  if (points.length === 1) {
    group.position.set(points[0].x, 0.18, points[0].z)
    return true
  }

  const total = routeTotal(lengths)
  let remaining = Math.min(distance, total)
  let segment = 0

  while (segment < lengths.length && remaining > lengths[segment]) {
    remaining -= lengths[segment]
    segment += 1
  }

  if (segment >= lengths.length) {
    const last = points.at(-1)!
    group.position.set(last.x, 0.18, last.z)
    return true
  }

  const from = points[segment]
  const to = points[segment + 1]
  const ratio = lengths[segment] === 0 ? 1 : remaining / lengths[segment]
  group.position.set(
    THREE.MathUtils.lerp(from.x, to.x, ratio),
    0.18,
    THREE.MathUtils.lerp(from.z, to.z, ratio),
  )
  group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z)
  return distance >= total
}

function angleTowards(current: number, target: number, ratio: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * ratio
}

function forwardPoint(origin: WorldPoint, facing: number): WorldPoint {
  const forward = new THREE.Vector3(0, 0, -1)
  forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), facing)
  return {
    x: origin.x + forward.x * APPROACH_DISTANCE,
    y: 0.2,
    z: origin.z + forward.z * APPROACH_DISTANCE,
  }
}

function interpolatePosition(
  group: THREE.Group,
  from: WorldPoint,
  to: WorldPoint,
  ratio: number,
): void {
  group.position.set(
    THREE.MathUtils.lerp(from.x, to.x, ratio),
    0.18,
    THREE.MathUtils.lerp(from.z, to.z, ratio),
  )
}

function moveNumber(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target
  return current + Math.sign(target - current) * maximumDelta
}

export function PalletTransferVehicle({
  simulation,
  runToken,
  source,
  destination,
  onVisual,
  onComplete,
}: {
  simulation: PalletTransferSimulation | null
  runToken: number
  source?: WarehouseLocation
  destination?: WarehouseLocation
  onVisual: (state: PalletTransferVisualState) => void
  onComplete: () => void
}) {
  const vehicleRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const phaseRef = useRef<PalletTransferPhase>('idle')
  const stepRef = useRef(0)
  const distanceRef = useRef(0)
  const stageRef = useRef(0)
  const pickupDoneRef = useRef(false)
  const dropDoneRef = useRef(false)
  const [cargoVisible, setCargoVisible] = useState(false)
  const { invalidate } = useThree()

  const emptyLengths = useMemo(
    () => routeLengths(simulation?.emptyPoints ?? []),
    [simulation],
  )
  const loadedLengths = useMemo(
    () => routeLengths(simulation?.loadedPoints ?? []),
    [simulation],
  )
  const sourceAccess = simulation?.emptyPoints.at(-1)
  const destinationAccess = simulation?.loadedPoints.at(-1)
  const sourceApproach =
    simulation && sourceAccess
      ? forwardPoint(sourceAccess, simulation.sourceFacing)
      : undefined
  const destinationApproach =
    simulation && destinationAccess
      ? forwardPoint(destinationAccess, simulation.destinationFacing)
      : undefined
  const mastHeight = simulation
    ? Math.max(
        2.4,
        simulation.sourceForkHeight + 0.9,
        simulation.destinationForkHeight + 0.9,
      )
    : 2.4

  useEffect(() => {
    if (
      !simulation ||
      runToken <= 0 ||
      !source ||
      !destination ||
      !vehicleRef.current ||
      !carriageRef.current
    ) {
      return
    }

    const first = simulation.emptyPoints[0]
    if (!first) return

    vehicleRef.current.position.set(first.x, 0.18, first.z)
    carriageRef.current.position.y = TRAVEL_FORK_HEIGHT
    phaseRef.current = 'going-to-source'
    stepRef.current = 0
    distanceRef.current = 0
    stageRef.current = 0
    pickupDoneRef.current = false
    dropDoneRef.current = false
    setCargoVisible(false)
    onVisual({
      hiddenSource: false,
      cargoAtDestination: false,
      phase: 'going-to-source',
    })
    invalidate()
  }, [
    destination,
    invalidate,
    onVisual,
    runToken,
    simulation,
    source,
  ])

  useFrame((_, delta) => {
    const vehicle = vehicleRef.current
    const carriage = carriageRef.current
    const plan = simulation
    if (!vehicle || !carriage || !plan) return

    const enterPhase = (phase: PalletTransferPhase) => {
      phaseRef.current = phase
      stepRef.current = 0
      stageRef.current = 0
      distanceRef.current = 0
    }
    const nextStep = () => {
      stepRef.current += 1
      stageRef.current = 0
    }

    const phase = phaseRef.current
    if (phase === 'idle' || phase === 'completed') return

    if (phase === 'going-to-source') {
      distanceRef.current += delta * EMPTY_TRAVEL_SPEED
      const finished = placeOnRoute(
        vehicle,
        plan.emptyPoints,
        emptyLengths,
        distanceRef.current,
      )
      if (finished) {
        enterPhase('collecting')
        onVisual({
          hiddenSource: false,
          cargoAtDestination: false,
          phase: 'collecting',
        })
      }
    } else if (phase === 'collecting' && sourceAccess && sourceApproach) {
      const step = stepRef.current

      if (step === 0) {
        stageRef.current += delta
        vehicle.rotation.y = angleTowards(
          vehicle.rotation.y,
          plan.sourceFacing,
          Math.min(1, delta * 8),
        )
        if (stageRef.current >= TURN_DURATION) {
          vehicle.rotation.y = plan.sourceFacing
          nextStep()
        }
      } else if (step === 1) {
        carriage.position.y = moveNumber(
          carriage.position.y,
          plan.sourceForkHeight,
          delta * LIFT_SPEED,
        )
        if (carriage.position.y === plan.sourceForkHeight) nextStep()
      } else if (step === 2) {
        stageRef.current += delta
        const ratio = Math.min(1, stageRef.current / APPROACH_DURATION)
        interpolatePosition(vehicle, sourceAccess, sourceApproach, ratio)
        if (ratio === 1) nextStep()
      } else if (step === 3) {
        stageRef.current += delta
        if (!pickupDoneRef.current && stageRef.current >= 0.15) {
          pickupDoneRef.current = true
          setCargoVisible(true)
          onVisual({
            hiddenSource: true,
            cargoAtDestination: false,
            phase: 'collecting',
          })
        }
        if (stageRef.current >= HANDLING_PAUSE) nextStep()
      } else if (step === 4) {
        stageRef.current += delta
        const ratio = Math.min(1, stageRef.current / APPROACH_DURATION)
        interpolatePosition(vehicle, sourceApproach, sourceAccess, ratio)
        if (ratio === 1) nextStep()
      } else {
        carriage.position.y = moveNumber(
          carriage.position.y,
          TRAVEL_FORK_HEIGHT,
          delta * LIFT_SPEED,
        )
        if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
          enterPhase('transporting')
          onVisual({
            hiddenSource: true,
            cargoAtDestination: false,
            phase: 'transporting',
          })
        }
      }
    } else if (phase === 'transporting') {
      distanceRef.current += delta * LOADED_TRAVEL_SPEED
      const finished = placeOnRoute(
        vehicle,
        plan.loadedPoints,
        loadedLengths,
        distanceRef.current,
      )
      if (finished) {
        enterPhase('depositing')
        onVisual({
          hiddenSource: true,
          cargoAtDestination: false,
          phase: 'depositing',
        })
      }
    } else if (
      phase === 'depositing' &&
      destinationAccess &&
      destinationApproach
    ) {
      const step = stepRef.current

      if (step === 0) {
        stageRef.current += delta
        vehicle.rotation.y = angleTowards(
          vehicle.rotation.y,
          plan.destinationFacing,
          Math.min(1, delta * 8),
        )
        if (stageRef.current >= TURN_DURATION) {
          vehicle.rotation.y = plan.destinationFacing
          nextStep()
        }
      } else if (step === 1) {
        carriage.position.y = moveNumber(
          carriage.position.y,
          plan.destinationForkHeight,
          delta * LIFT_SPEED,
        )
        if (carriage.position.y === plan.destinationForkHeight) nextStep()
      } else if (step === 2) {
        stageRef.current += delta
        const ratio = Math.min(1, stageRef.current / APPROACH_DURATION)
        interpolatePosition(vehicle, destinationAccess, destinationApproach, ratio)
        if (ratio === 1) nextStep()
      } else if (step === 3) {
        stageRef.current += delta
        if (!dropDoneRef.current && stageRef.current >= 0.15) {
          dropDoneRef.current = true
          setCargoVisible(false)
          onVisual({
            hiddenSource: true,
            cargoAtDestination: true,
            phase: 'depositing',
          })
        }
        if (stageRef.current >= HANDLING_PAUSE) nextStep()
      } else if (step === 4) {
        stageRef.current += delta
        const ratio = Math.min(1, stageRef.current / APPROACH_DURATION)
        interpolatePosition(vehicle, destinationApproach, destinationAccess, ratio)
        if (ratio === 1) nextStep()
      } else {
        carriage.position.y = moveNumber(
          carriage.position.y,
          TRAVEL_FORK_HEIGHT,
          delta * LIFT_SPEED,
        )
        if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
          phaseRef.current = 'completed'
          onVisual({
            hiddenSource: true,
            cargoAtDestination: true,
            phase: 'completed',
          })
          onComplete()
        }
      }
    }

    invalidate()
  })

  const cargoColor = colorForSku(simulation?.sku ?? 'SEM-SKU')

  return (
    <group ref={vehicleRef}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.15, 0.65, 1.6]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[0, 0.95, 0.15]} castShadow>
        <boxGeometry args={[0.85, 0.75, 0.9]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[-0.34, mastHeight / 2, -0.88]}>
        <boxGeometry args={[0.12, mastHeight, 0.12]} />
        <meshStandardMaterial color="#334155" metalness={0.6} />
      </mesh>
      <mesh position={[0.34, mastHeight / 2, -0.88]}>
        <boxGeometry args={[0.12, mastHeight, 0.12]} />
        <meshStandardMaterial color="#334155" metalness={0.6} />
      </mesh>
      <group ref={carriageRef} position={[0, TRAVEL_FORK_HEIGHT, -0.9]}>
        <mesh position={[-0.28, 0, -0.65]}>
          <boxGeometry args={[0.12, 0.08, 1.35]} />
          <meshStandardMaterial color="#475569" metalness={0.7} />
        </mesh>
        <mesh position={[0.28, 0, -0.65]}>
          <boxGeometry args={[0.12, 0.08, 1.35]} />
          <meshStandardMaterial color="#475569" metalness={0.7} />
        </mesh>
        {cargoVisible && (
          <group position={[0, 0.16, -0.72]}>
            <mesh castShadow>
              <boxGeometry args={[1.02, 0.12, 0.92]} />
              <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
            </mesh>
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[0.94, 0.82, 0.84]} />
              <meshStandardMaterial color={cargoColor} roughness={0.68} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  )
}

export function SimulatedDestinationLoad({
  layout,
  location,
  sku,
}: {
  layout: WarehouseLayout
  location: WarehouseLocation
  sku: string
}) {
  const row =
    layout.rackRows.find((item) => item.id === location.rackRowId) ??
    layout.rackRows.find((item) => item.aisle === location.aisle)
  if (!row) return null

  const rackLength = row.baysPerSide * row.bayWidth
  const localX = (location.bay - 0.5) * row.bayWidth - rackLength / 2
  const sideDirection = location.side === 'left' ? -1 : 1
  const localZ = sideDirection * (row.aisleWidth / 2 + row.rackDepth / 2)
  const local = new THREE.Vector3(localX, 0, localZ)
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), row.rotationY)
  local.x += row.origin.x
  local.z += row.origin.z
  local.y = (location.level - 0.5) * row.levelHeight + 0.25

  return (
    <group position={[local.x, local.y, local.z]} rotation={[0, row.rotationY, 0]}>
      <mesh position={[0, -0.42, 0]} castShadow>
        <boxGeometry args={[row.bayWidth * 0.76, 0.12, row.rackDepth * 0.76]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[row.bayWidth * 0.69, 0.82, row.rackDepth * 0.69]} />
        <meshStandardMaterial color={colorForSku(sku)} roughness={0.68} />
      </mesh>
    </group>
  )
}
