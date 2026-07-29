import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { probeDynamicSafety } from '../domain/dynamicSafety'
import type { WarehouseLayout } from '../domain/layout'
import {
  chooseMissionForVehicle,
  createMissionStatuses,
  readyMissions,
  type FleetMission,
  type FleetMissionStatus,
  type FleetVehicleDefinition,
  type RealisticFleetPlan,
} from '../domain/realisticFleet'
import type { RealisticMissionStop } from '../domain/realisticMissionQueue'
import { buildTravelPath, type WorldPoint } from '../domain/routePlanning'
import { TRAVEL_FORK_HEIGHT } from '../domain/warehouseGeometry'
import type { WarehouseLocation } from '../domain/warehouse'
import {
  resolveOperationalVehicleFacing,
  resolveOperationalVehiclePoint,
  useOperationalVehicleStore,
} from '../store/operationalVehicleStore'
import { ForkliftModel } from './ForkliftModel'
import { PalletJackModel } from './PalletJackModel'
import {
  isRuntimeVehicleFaulted,
  readRuntimeHazards,
  removeRuntimeVehicle,
  upsertRuntimeVehicle,
} from './dynamicSafetyRuntime'
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

interface RouteRuntime {
  points: WorldPoint[]
  lengths: number[]
  distance: number
}

interface VehiclePose {
  point: WorldPoint
  facing: number
}

interface VehicleAssignmentMap {
  [vehicleId: string]: string | null
}

type MissionPhase =
  | 'idle'
  | 'going-to-source'
  | 'pickup-turn'
  | 'pickup-lift'
  | 'pickup-approach'
  | 'pickup-attach'
  | 'pickup-retreat'
  | 'pickup-lower'
  | 'transporting'
  | 'drop-turn'
  | 'drop-lift'
  | 'drop-approach'
  | 'drop-detach'
  | 'drop-retreat'
  | 'drop-lower'

type SafetyVisualState = 'normal' | 'braking' | 'fault'

const EMPTY_SPEED = 3.7
const LOADED_SPEED = 2.8
const ACCELERATION = 3.4
const BRAKING = 4.8
const EMERGENCY_BRAKING = 8.6
const TURN_DURATION = 0.48
const APPROACH_DURATION = 0.72
const HANDLING_PAUSE = 0.65
const LIFT_SPEED = 2.25
const FORKLIFT_CARGO_LOCAL_Z = -1.62
const PALLET_JACK_CARGO_LOCAL_Z = -1.03

function rotatePoint(
  x: number,
  z: number,
  angle: number,
): { x: number; z: number } {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: x * cosine - z * sine,
    z: x * sine + z * cosine,
  }
}

function safePath(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
): WorldPoint[] {
  try {
    return roundPathCorners(
      buildTravelPath(layout, from, to, { left: false, right: false }),
      1.05,
      7,
    )
  } catch {
    return roundPathCorners([from, to], 1.05, 7)
  }
}

function routeRuntime(points: WorldPoint[]): RouteRuntime {
  const lengths = routeLengths(points)
  return {
    points,
    lengths,
    distance: routeDistance(lengths),
  }
}

function emptyRoute(): RouteRuntime {
  return { points: [], lengths: [], distance: 0 }
}

function currentVehiclePoint(vehicle: THREE.Group): WorldPoint {
  return {
    x: vehicle.position.x,
    y: 0.2,
    z: vehicle.position.z,
  }
}

function alignedVehiclePoint(
  stop: RealisticMissionStop,
  vehicle: FleetVehicleDefinition,
): WorldPoint {
  const localZ =
    vehicle.kind === 'pallet-jack'
      ? PALLET_JACK_CARGO_LOCAL_Z
      : FORKLIFT_CARGO_LOCAL_Z
  const cargoOffset = rotatePoint(0, localZ, stop.facing)
  return {
    x: stop.restingPoint.x - cargoOffset.x,
    y: 0.2,
    z: stop.restingPoint.z - cargoOffset.z,
  }
}

function interpolateVehicle(
  vehicle: THREE.Group,
  from: WorldPoint,
  to: WorldPoint,
  ratio: number,
): void {
  vehicle.position.set(
    THREE.MathUtils.lerp(from.x, to.x, ratio),
    0.18,
    THREE.MathUtils.lerp(from.z, to.z, ratio),
  )
}

function targetSpeed(maximum: number, remaining: number): number {
  return Math.min(maximum, Math.sqrt(Math.max(0, 2 * BRAKING * remaining)))
}

function vehicleRadius(vehicle: FleetVehicleDefinition): number {
  return vehicle.kind === 'forklift' ? 0.82 : 0.62
}

function VehicleMissionRunner({
  layout,
  vehicle,
  mission,
  compact,
  initialPose,
  onPickup,
  onDrop,
  onComplete,
}: {
  layout: WarehouseLayout
  vehicle: FleetVehicleDefinition
  mission?: FleetMission
  compact: boolean
  initialPose: VehiclePose
  onPickup: (mission: FleetMission) => void
  onDrop: (mission: FleetMission) => void
  onComplete: (
    vehicle: FleetVehicleDefinition,
    mission: FleetMission,
    pose: VehiclePose,
  ) => void
}) {
  const vehicleRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const initializedRef = useRef(false)
  const phaseRef = useRef<MissionPhase>('idle')
  const elapsedRef = useRef(0)
  const distanceRef = useRef(0)
  const speedRef = useRef(0)
  const delayRef = useRef(vehicle.startDelay)
  const emptyRouteRef = useRef<RouteRuntime>(emptyRoute())
  const loadedRouteRef = useRef<RouteRuntime>(emptyRoute())
  const activeMissionIdRef = useRef<string | null>(null)
  const pickupDoneRef = useRef(false)
  const dropDoneRef = useRef(false)
  const safetyVisualRef = useRef<SafetyVisualState>('normal')
  const [ready, setReady] = useState(false)
  const [carrying, setCarrying] = useState(false)
  const [safetyVisual, setSafetyVisual] = useState<SafetyVisualState>('normal')
  const { invalidate } = useThree()
  const parkAtPoint = useOperationalVehicleStore((state) => state.parkAtPoint)
  const radius = vehicleRadius(vehicle)

  const updateSafetyVisual = useCallback((next: SafetyVisualState) => {
    if (safetyVisualRef.current === next) return
    safetyVisualRef.current = next
    setSafetyVisual(next)
  }, [])

  const registerVehicle = useCallback(
    (root: THREE.Group, speed: number) => {
      upsertRuntimeVehicle({
        id: vehicle.id,
        point: currentVehiclePoint(root),
        radius,
        speed,
        active: root.visible,
      })
    },
    [radius, vehicle.id],
  )

  useLayoutEffect(() => {
    const root = vehicleRef.current
    const carriage = carriageRef.current
    if (!root || !carriage) return

    root.position.set(initialPose.point.x, 0.18, initialPose.point.z)
    root.rotation.y = initialPose.facing
    carriage.position.y = TRAVEL_FORK_HEIGHT
    initializedRef.current = true
    registerVehicle(root, 0)
    setReady(true)
    invalidate()

    return () => {
      removeRuntimeVehicle(vehicle.id)
      if (vehicle.id !== 'EMP-01' || !vehicleRef.current) return
      parkAtPoint(
        currentVehiclePoint(vehicleRef.current),
        'Última posição da EMP-01 no modo realista',
        vehicleRef.current.rotation.y,
      )
    }
  }, [initialPose, invalidate, parkAtPoint, registerVehicle, vehicle.id])

  useEffect(() => {
    const root = vehicleRef.current
    if (!ready || !root || !mission) {
      activeMissionIdRef.current = null
      phaseRef.current = 'idle'
      speedRef.current = 0
      updateSafetyVisual('normal')
      if (root) registerVehicle(root, 0)
      return
    }
    if (activeMissionIdRef.current === mission.id) return

    activeMissionIdRef.current = mission.id
    emptyRouteRef.current = routeRuntime(
      safePath(layout, currentVehiclePoint(root), mission.source.access),
    )
    loadedRouteRef.current = routeRuntime(
      safePath(layout, mission.source.access, mission.destination.access),
    )
    phaseRef.current = 'going-to-source'
    elapsedRef.current = 0
    distanceRef.current = 0
    speedRef.current = 0
    pickupDoneRef.current = false
    dropDoneRef.current = false
    setCarrying(false)
    updateSafetyVisual('normal')
    invalidate()
  }, [invalidate, layout, mission, ready, registerVehicle, updateSafetyVisual])

  useFrame((_, delta) => {
    const root = vehicleRef.current
    const carriage = carriageRef.current
    if (!initializedRef.current || !ready || !root || !carriage) return

    registerVehicle(root, speedRef.current)

    if (!mission || activeMissionIdRef.current !== mission.id) return

    if (isRuntimeVehicleFaulted(vehicle.id)) {
      speedRef.current = approachSpeed(
        speedRef.current,
        0,
        EMERGENCY_BRAKING,
        delta,
      )
      updateSafetyVisual('fault')
      registerVehicle(root, speedRef.current)
      if (speedRef.current > 0.01) invalidate()
      return
    }

    if (delayRef.current > 0) {
      delayRef.current = Math.max(0, delayRef.current - delta)
      updateSafetyVisual('normal')
      invalidate()
      return
    }

    const source = mission.source
    const destination = mission.destination
    const sourceAligned = alignedVehiclePoint(source, vehicle)
    const destinationAligned = alignedVehiclePoint(destination, vehicle)
    const phase = phaseRef.current
    const speedScale = vehicle.speedScale
    const liftScale = vehicle.kind === 'pallet-jack' ? 0.85 : 1

    const resetMotion = () => {
      elapsedRef.current = 0
      distanceRef.current = 0
      speedRef.current = 0
      updateSafetyVisual('normal')
    }

    const moveAlongRoute = (
      route: RouteRuntime,
      maximumSpeed: number,
      turnResponsiveness: number,
      nextPhase: MissionPhase,
    ) => {
      const remaining = Math.max(0, route.distance - distanceRef.current)
      const currentSample = sampleRoute(
        route.points,
        route.lengths,
        distanceRef.current,
      )
      const desiredSpeed = targetSpeed(maximumSpeed, remaining)
      const safety = probeDynamicSafety({
        vehicleId: vehicle.id,
        point: currentVehiclePoint(root),
        facing: currentSample.facing,
        speed: speedRef.current,
        vehicleRadius: radius,
        hazards: readRuntimeHazards(),
        brakingDeceleration: EMERGENCY_BRAKING,
        reactionBuffer: carrying ? 1.05 : 0.78,
        lateralMargin: compact ? 0.18 : 0.25,
      })
      const safeTarget = Math.min(desiredSpeed, safety.safeSpeed)
      const braking = Number.isFinite(safety.safeSpeed) && safeTarget < desiredSpeed - 0.08

      speedRef.current = approachSpeed(
        speedRef.current,
        safeTarget,
        braking ? EMERGENCY_BRAKING : ACCELERATION,
        delta,
      )
      updateSafetyVisual(braking || safety.emergency ? 'braking' : 'normal')

      distanceRef.current += speedRef.current * delta
      const sample = sampleRoute(route.points, route.lengths, distanceRef.current)
      placeVehicle(root, sample, turnResponsiveness, delta)
      registerVehicle(root, speedRef.current)

      if (sample.finished) {
        phaseRef.current = nextPhase
        resetMotion()
      }
    }

    if (phase === 'idle') return

    if (phase === 'going-to-source') {
      moveAlongRoute(
        emptyRouteRef.current,
        EMPTY_SPEED * speedScale,
        8,
        'pickup-turn',
      )
    } else if (phase === 'pickup-turn') {
      updateSafetyVisual('normal')
      elapsedRef.current += delta
      root.rotation.y = angleTowards(root.rotation.y, source.facing, delta * 7)
      if (elapsedRef.current >= TURN_DURATION) {
        root.rotation.y = source.facing
        phaseRef.current = 'pickup-lift'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-lift') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        source.forkHeight,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === source.forkHeight) {
        phaseRef.current = 'pickup-approach'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-approach') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(root, source.access, sourceAligned, ratio)
      registerVehicle(root, 0.7)
      if (ratio === 1) {
        phaseRef.current = 'pickup-attach'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-attach') {
      elapsedRef.current += delta
      if (!pickupDoneRef.current && elapsedRef.current >= 0.18) {
        pickupDoneRef.current = true
        setCarrying(true)
        onPickup(mission)
      }
      if (elapsedRef.current >= HANDLING_PAUSE) {
        phaseRef.current = 'pickup-retreat'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-retreat') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(root, sourceAligned, source.access, ratio)
      registerVehicle(root, 0.65)
      if (ratio === 1) phaseRef.current = 'pickup-lower'
    } else if (phase === 'pickup-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
        phaseRef.current = 'transporting'
        resetMotion()
      }
    } else if (phase === 'transporting') {
      moveAlongRoute(
        loadedRouteRef.current,
        LOADED_SPEED * speedScale,
        7,
        'drop-turn',
      )
    } else if (phase === 'drop-turn') {
      updateSafetyVisual('normal')
      elapsedRef.current += delta
      root.rotation.y = angleTowards(
        root.rotation.y,
        destination.facing,
        delta * 7,
      )
      if (elapsedRef.current >= TURN_DURATION) {
        root.rotation.y = destination.facing
        phaseRef.current = 'drop-lift'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-lift') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        destination.forkHeight,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === destination.forkHeight) {
        phaseRef.current = 'drop-approach'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-approach') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(root, destination.access, destinationAligned, ratio)
      registerVehicle(root, 0.7)
      if (ratio === 1) {
        phaseRef.current = 'drop-detach'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-detach') {
      elapsedRef.current += delta
      if (!dropDoneRef.current && elapsedRef.current >= 0.18) {
        dropDoneRef.current = true
        setCarrying(false)
        onDrop(mission)
      }
      if (elapsedRef.current >= HANDLING_PAUSE) {
        phaseRef.current = 'drop-retreat'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-retreat') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(root, destinationAligned, destination.access, ratio)
      registerVehicle(root, 0.65)
      if (ratio === 1) phaseRef.current = 'drop-lower'
    } else if (phase === 'drop-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
        const pose = {
          point: currentVehiclePoint(root),
          facing: root.rotation.y,
        }
        if (vehicle.id === 'EMP-01') {
          parkAtPoint(
            pose.point,
            `Ao lado de ${destination.label}`,
            pose.facing,
          )
        }
        phaseRef.current = 'idle'
        activeMissionIdRef.current = null
        speedRef.current = 0
        updateSafetyVisual('normal')
        registerVehicle(root, 0)
        onComplete(vehicle, mission, pose)
      }
    }

    invalidate()
  })

  return (
    <group ref={vehicleRef} visible={ready}>
      {vehicle.kind === 'forklift' ? (
        <ForkliftModel
          carriageRef={carriageRef}
          mastHeight={Math.max(
            2.4,
            mission?.source.forkHeight ?? 0,
            mission?.destination.forkHeight ?? 0,
          ) + 1}
          compact={compact}
          cargoVisible={carrying}
          cargoColor={mission?.color ?? '#38bdf8'}
          reportRuntimePose={vehicle.id === 'EMP-01'}
          accent={vehicle.color}
          emergencyBraking={safetyVisual === 'braking'}
          faulted={safetyVisual === 'fault'}
        />
      ) : (
        <PalletJackModel
          carriageRef={carriageRef}
          compact={compact}
          cargoVisible={carrying}
          cargoColor={mission?.color ?? '#38bdf8'}
          accent={vehicle.color}
          emergencyBraking={safetyVisual === 'braking'}
          faulted={safetyVisual === 'fault'}
        />
      )}
    </group>
  )
}

export function FleetOperation({
  layout,
  locations,
  plan,
  compact,
}: {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticFleetPlan
  compact: boolean
}) {
  const [palletStops, setPalletStops] = useState<
    Record<string, RealisticMissionStop | null>
  >(() => ({ ...plan.initialPalletStops }))
  const [statuses, setStatuses] = useState<Record<string, FleetMissionStatus>>(
    () => createMissionStatuses(plan.missions),
  )
  const [assignments, setAssignments] = useState<VehicleAssignmentMap>(() =>
    Object.fromEntries(plan.vehicles.map((vehicle) => [vehicle.id, null])),
  )
  const [, setWave] = useState(0)
  const resetTimerRef = useRef<number | null>(null)

  const initialPoses = useMemo<Record<string, VehiclePose>>(() => {
    const anchor = useOperationalVehicleStore.getState().anchor
    return Object.fromEntries(
      plan.vehicles.map((vehicle) => [
        vehicle.id,
        vehicle.id === 'EMP-01'
          ? {
              point: resolveOperationalVehiclePoint(layout, locations, anchor),
              facing: resolveOperationalVehicleFacing(anchor),
            }
          : {
              point: vehicle.startPoint,
              facing: vehicle.startFacing,
            },
      ]),
    )
  }, [layout, locations, plan.vehicles])

  useEffect(() => {
    setPalletStops({ ...plan.initialPalletStops })
    setStatuses(createMissionStatuses(plan.missions))
    setAssignments(
      Object.fromEntries(plan.vehicles.map((vehicle) => [vehicle.id, null])),
    )
  }, [plan])

  useEffect(() => {
    if (plan.missions.length === 0) return

    const available = readyMissions(plan.missions, statuses, palletStops)
    const reservedMissionIds = new Set(
      Object.values(assignments).filter((value): value is string => Boolean(value)),
    )
    const reservedDestinationIds = new Set(
      [...reservedMissionIds]
        .map((id) => plan.missions.find((mission) => mission.id === id)?.destination.id)
        .filter((value): value is string => Boolean(value)),
    )
    const nextAssignments = { ...assignments }
    const nextStatuses = { ...statuses }
    let changed = false

    plan.vehicles.forEach((vehicle) => {
      if (nextAssignments[vehicle.id]) return
      const mission = chooseMissionForVehicle(
        vehicle,
        available,
        reservedMissionIds,
        reservedDestinationIds,
      )
      if (!mission) return

      nextAssignments[vehicle.id] = mission.id
      nextStatuses[mission.id] = 'running'
      reservedMissionIds.add(mission.id)
      reservedDestinationIds.add(mission.destination.id)
      changed = true
    })

    if (changed) {
      setAssignments(nextAssignments)
      setStatuses(nextStatuses)
    }
  }, [assignments, palletStops, plan.missions, plan.vehicles, statuses])

  useEffect(() => {
    const allCompleted =
      plan.missions.length > 0 &&
      plan.missions.every((mission) => statuses[mission.id] === 'completed')
    const allIdle = Object.values(assignments).every((missionId) => !missionId)

    if (!allCompleted || !allIdle) return
    if (resetTimerRef.current !== null) return

    resetTimerRef.current = window.setTimeout(() => {
      setPalletStops({ ...plan.initialPalletStops })
      setStatuses(createMissionStatuses(plan.missions))
      setWave((current) => current + 1)
      resetTimerRef.current = null
    }, 1800)

    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
      }
    }
  }, [assignments, plan.initialPalletStops, plan.missions, statuses])

  const handlePickup = useCallback((mission: FleetMission) => {
    setPalletStops((current) => ({
      ...current,
      [mission.palletId]: null,
    }))
  }, [])

  const handleDrop = useCallback((mission: FleetMission) => {
    setPalletStops((current) => ({
      ...current,
      [mission.palletId]: mission.destination,
    }))
  }, [])

  const handleComplete = useCallback(
    (vehicle: FleetVehicleDefinition, mission: FleetMission) => {
      setStatuses((current) => ({
        ...current,
        [mission.id]: 'completed',
      }))
      setAssignments((current) => ({
        ...current,
        [vehicle.id]: null,
      }))
    },
    [],
  )

  const palletColors = useMemo(
    () =>
      Object.fromEntries(
        plan.missions.map((mission) => [mission.palletId, mission.color]),
      ),
    [plan.missions],
  )

  return (
    <group>
      {plan.vehicles.map((vehicle) => {
        const missionId = assignments[vehicle.id]
        const mission = missionId
          ? plan.missions.find((item) => item.id === missionId)
          : undefined
        return (
          <VehicleMissionRunner
            key={vehicle.id}
            layout={layout}
            vehicle={vehicle}
            mission={mission}
            compact={compact}
            initialPose={initialPoses[vehicle.id]}
            onPickup={handlePickup}
            onDrop={handleDrop}
            onComplete={handleComplete}
          />
        )
      })}

      {Object.entries(palletStops).map(([palletId, stop]) =>
        stop ? (
          <group
            key={palletId}
            position={[
              stop.restingPoint.x,
              stop.restingPoint.y,
              stop.restingPoint.z,
            ]}
            rotation={[0, stop.facing, 0]}
          >
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1.5, 0.14, 0.9]} />
              <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
            </mesh>
            <mesh position={[0, 0.57, 0]} castShadow>
              <boxGeometry args={[1.4, 0.82, 0.82]} />
              <meshStandardMaterial
                color={palletColors[palletId] ?? '#38bdf8'}
                roughness={0.68}
              />
            </mesh>
          </group>
        ) : null,
      )}
    </group>
  )
}
