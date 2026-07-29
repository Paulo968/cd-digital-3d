import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import type { PalletTransferSimulation } from '../domain/palletTransferSimulation'
import { getLocationWorldPoint, type WorldPoint } from '../domain/routePlanning'
import {
  findLocationRow,
  getLoadCenterY,
  getPalletCenterY,
  PALLET_HEIGHT,
  TRAVEL_FORK_HEIGHT,
} from '../domain/warehouseGeometry'
import type { WarehouseLocation } from '../domain/warehouse'
import { ForkliftModel } from './ForkliftModel'
import {
  angleTowards,
  approachSpeed,
  moveNumber,
  placeVehicle,
  roundPathCorners,
  routeDistance,
  routeLengths,
  sampleRoute,
} from './vehicleMotion'

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

const APPROACH_DISTANCE = 0.9
const EMPTY_TRAVEL_SPEED = 4.2
const LOADED_TRAVEL_SPEED = 3.2
const ACCELERATION = 3.8
const BRAKING = 5.2
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

function safeTargetSpeed(
  maximumSpeed: number,
  remainingDistance: number,
): number {
  return Math.min(
    maximumSpeed,
    Math.sqrt(Math.max(0, 2 * BRAKING * remainingDistance)),
  )
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
  const speedRef = useRef(0)
  const stageRef = useRef(0)
  const pickupDoneRef = useRef(false)
  const dropDoneRef = useRef(false)
  const [cargoVisible, setCargoVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const { invalidate } = useThree()

  const emptyPoints = useMemo(
    () => roundPathCorners(simulation?.emptyPoints ?? [], 0.9, 6),
    [simulation],
  )
  const loadedPoints = useMemo(
    () => roundPathCorners(simulation?.loadedPoints ?? [], 1.05, 7),
    [simulation],
  )
  const emptyLengths = useMemo(() => routeLengths(emptyPoints), [emptyPoints])
  const loadedLengths = useMemo(() => routeLengths(loadedPoints), [loadedPoints])
  const emptyTotal = useMemo(() => routeDistance(emptyLengths), [emptyLengths])
  const loadedTotal = useMemo(() => routeDistance(loadedLengths), [loadedLengths])
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
        simulation.sourceForkHeight + 1,
        simulation.destinationForkHeight + 1,
      )
    : 2.4

  useLayoutEffect(() => {
    if (
      !simulation ||
      runToken <= 0 ||
      !source ||
      !destination ||
      !vehicleRef.current ||
      !carriageRef.current
    ) {
      setReady(false)
      return
    }

    const first = emptyPoints[0]
    if (!first) {
      setReady(false)
      return
    }

    setReady(false)
    vehicleRef.current.position.set(first.x, 0.18, first.z)
    vehicleRef.current.rotation.y = 0
    carriageRef.current.position.y = TRAVEL_FORK_HEIGHT
    phaseRef.current = 'going-to-source'
    stepRef.current = 0
    distanceRef.current = 0
    speedRef.current = 0
    stageRef.current = 0
    pickupDoneRef.current = false
    dropDoneRef.current = false
    setCargoVisible(false)
    onVisual({
      hiddenSource: false,
      cargoAtDestination: false,
      phase: 'going-to-source',
    })
    setReady(true)
    invalidate()
  }, [
    destination,
    emptyPoints,
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
    if (!ready || !vehicle || !carriage || !plan) return

    const enterPhase = (phase: PalletTransferPhase) => {
      phaseRef.current = phase
      stepRef.current = 0
      stageRef.current = 0
      distanceRef.current = 0
      speedRef.current = 0
    }
    const nextStep = () => {
      stepRef.current += 1
      stageRef.current = 0
    }

    const phase = phaseRef.current
    if (phase === 'idle' || phase === 'completed') return

    if (phase === 'going-to-source') {
      const remaining = Math.max(0, emptyTotal - distanceRef.current)
      const targetSpeed = safeTargetSpeed(EMPTY_TRAVEL_SPEED, remaining)
      speedRef.current = approachSpeed(
        speedRef.current,
        targetSpeed,
        ACCELERATION,
        delta,
      )
      distanceRef.current += delta * speedRef.current
      const sample = sampleRoute(emptyPoints, emptyLengths, distanceRef.current)
      placeVehicle(vehicle, sample, 8.5, delta)
      if (sample.finished) {
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
          delta * 8,
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
      const remaining = Math.max(0, loadedTotal - distanceRef.current)
      const targetSpeed = safeTargetSpeed(LOADED_TRAVEL_SPEED, remaining)
      speedRef.current = approachSpeed(
        speedRef.current,
        targetSpeed,
        ACCELERATION,
        delta,
      )
      distanceRef.current += delta * speedRef.current
      const sample = sampleRoute(loadedPoints, loadedLengths, distanceRef.current)
      placeVehicle(vehicle, sample, 7.5, delta)
      if (sample.finished) {
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
          delta * 8,
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

  return (
    <group ref={vehicleRef} visible={ready}>
      <ForkliftModel
        carriageRef={carriageRef}
        mastHeight={mastHeight}
        cargoVisible={cargoVisible}
        cargoColor={colorForSku(simulation?.sku ?? 'SEM-SKU')}
      />
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
  const row = findLocationRow(layout, location)
  if (!row) return null

  const point = getLocationWorldPoint(layout, location)
  const loadHeight = location.zone === 'picking' ? 0.58 : 0.82
  const palletY = getPalletCenterY(layout, location)
  const loadY = getLoadCenterY(layout, location, loadHeight)

  return (
    <group position={[point.x, 0, point.z]} rotation={[0, row.rotationY, 0]}>
      <mesh position={[0, palletY, 0]} castShadow>
        <boxGeometry
          args={[row.bayWidth * 0.76, PALLET_HEIGHT, row.rackDepth * 0.76]}
        />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </mesh>
      <mesh position={[0, loadY, 0]} castShadow>
        <boxGeometry
          args={[row.bayWidth * 0.69, loadHeight, row.rackDepth * 0.69]}
        />
        <meshStandardMaterial color={colorForSku(sku)} roughness={0.68} />
      </mesh>
    </group>
  )
}
