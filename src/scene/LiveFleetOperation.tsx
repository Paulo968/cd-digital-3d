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
import {
  buildAdaptiveFleetPath,
  chooseBrainMissionForVehicle,
} from '../domain/fleetDispatchBrain'
import type { WarehouseLayout } from '../domain/layout'
import {
  createMissionStatuses,
  readyMissions,
  type FleetMission,
  type FleetMissionStatus,
  type FleetVehicleDefinition,
  type RealisticFleetPlan,
} from '../domain/realisticFleet'
import type { RealisticMissionStop } from '../domain/realisticMissionQueue'
import type { WorldPoint } from '../domain/routePlanning'
import {
  createWarehouseBrainState,
  decideWarehouseBrain,
  type WarehouseBrainState,
} from '../domain/warehouseBrain'
import {
  LOAD_SUPPORT_CLEARANCE,
  PALLET_HEIGHT,
  TRAVEL_FORK_HEIGHT,
} from '../domain/warehouseGeometry'
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
  readRuntimeVehicleState,
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
const PALLET_LOAD_HEIGHT = 0.82

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

function routeRuntime(points: WorldPoint[]): RouteRuntime {
  const rounded = roundPathCorners(points, 1.05, 7)
  const lengths = routeLengths(rounded)
  return {
    points: rounded,
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

function LiveVehicleRunner({
  layout,
  vehicle,
  mission,
  compact,
  initialPose,
  occupiedTrafficCells,
  onPickup,
  onDrop,
  onComplete,
}: {
  layout: WarehouseLayout
  vehicle: FleetVehicleDefinition
  mission?: FleetMission
  compact: boolean
  initialPose: VehiclePose
  occupiedTrafficCells: Set<string>
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
  const [safetyVisual, setSafetyVisual] =
    useState<SafetyVisualState>('normal')
  const { invalidate } = useThree()
  const parkAtPoint = useOperationalVehicleStore((state) => state.parkAtPoint)
  const radius = vehicleRadius(vehicle)

  const updateSafetyVisual = useCallback((next: SafetyVisualState) => {
    if (safetyVisualRef.current === next) return
    safetyVisualRef.current = next
    setSafetyVisual(next)
  }, [])

  const registerVehicle = useCallback(
    (root: THREE.Group, speed: number, active: boolean) => {
      upsertRuntimeVehicle({
        id: vehicle.id,
        point: currentVehiclePoint(root),
        radius,
        speed,
        active,
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
    registerVehicle(root, 0, false)
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
      if (root) registerVehicle(root, 0, false)
      return
    }
    if (activeMissionIdRef.current === mission.id) return

    activeMissionIdRef.current = mission.id
    emptyRouteRef.current = routeRuntime(
      buildAdaptiveFleetPath(
        layout,
        currentVehiclePoint(root),
        mission.source.access,
        vehicle.id,
        occupiedTrafficCells,
      ),
    )
    loadedRouteRef.current = routeRuntime(
      buildAdaptiveFleetPath(
        layout,
        mission.source.access,
        mission.destination.access,
        vehicle.id,
        occupiedTrafficCells,
      ),
    )
    phaseRef.current = 'going-to-source'
    elapsedRef.current = 0
    distanceRef.current = 0
    speedRef.current = 0
    pickupDoneRef.current = false
    dropDoneRef.current = false
    setCarrying(false)
    updateSafetyVisual('normal')
    registerVehicle(root, 0, true)
    invalidate()
  }, [
    invalidate,
    layout,
    mission,
    occupiedTrafficCells,
    ready,
    registerVehicle,
    updateSafetyVisual,
    vehicle.id,
  ])

  useFrame((_, delta) => {
    const root = vehicleRef.current
    const carriage = carriageRef.current
    if (!initializedRef.current || !ready || !root || !carriage) return

    if (!mission || activeMissionIdRef.current !== mission.id) {
      registerVehicle(root, 0, false)
      return
    }

    registerVehicle(root, speedRef.current, true)

    if (isRuntimeVehicleFaulted(vehicle.id)) {
      speedRef.current = approachSpeed(
        speedRef.current,
        0,
        EMERGENCY_BRAKING,
        delta,
      )
      updateSafetyVisual('fault')
      registerVehicle(root, speedRef.current, true)
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
      const braking =
        Number.isFinite(safety.safeSpeed) && safeTarget < desiredSpeed - 0.08

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
      registerVehicle(root, speedRef.current, true)

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
      registerVehicle(root, 0.7, true)
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
      registerVehicle(root, 0.65, true)
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
      registerVehicle(root, 0.7, true)
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
      registerVehicle(root, 0.65, true)
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
        registerVehicle(root, 0, false)
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

function initialPalletColors(plan: RealisticFleetPlan): Record<string, string> {
  return Object.fromEntries(
    plan.missions.map((mission) => [mission.palletId, mission.color]),
  )
}

export function LiveFleetOperation({
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
  const [palletColors, setPalletColors] = useState<Record<string, string>>(() =>
    initialPalletColors(plan),
  )
  const [missions, setMissions] = useState<FleetMission[]>(() => [
    ...plan.missions,
  ])
  const [statuses, setStatuses] = useState<Record<string, FleetMissionStatus>>(
    () => createMissionStatuses(plan.missions),
  )
  const [assignments, setAssignments] = useState<VehicleAssignmentMap>(() =>
    Object.fromEntries(plan.vehicles.map((vehicle) => [vehicle.id, null])),
  )
  const [brain, setBrain] = useState<WarehouseBrainState>(() =>
    createWarehouseBrainState(Date.now()),
  )
  const [brainNow, setBrainNow] = useState(() => Date.now())

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
    const now = Date.now()
    setPalletStops({ ...plan.initialPalletStops })
    setPalletColors(initialPalletColors(plan))
    setMissions([...plan.missions])
    setStatuses(createMissionStatuses(plan.missions))
    setAssignments(
      Object.fromEntries(plan.vehicles.map((vehicle) => [vehicle.id, null])),
    )
    setBrain(createWarehouseBrainState(now))
    setBrainNow(now)
  }, [plan])

  useEffect(() => {
    const timer = window.setInterval(
      () => setBrainNow(Date.now()),
      compact ? 1200 : 850,
    )
    return () => window.clearInterval(timer)
  }, [compact])

  useEffect(() => {
    const decision = decideWarehouseBrain(brain, {
      now: brainNow,
      compact,
      layout,
      locations,
      plan,
      palletStops,
      palletColors,
      missions,
      statuses,
    })
    setBrain(decision.state)

    if (decision.action.type === 'receive-pallet') {
      setPalletStops((current) => ({
        ...current,
        [decision.action.palletId]: decision.action.stop,
      }))
      setPalletColors((current) => ({
        ...current,
        [decision.action.palletId]: decision.action.color,
      }))
    } else if (decision.action.type === 'create-mission') {
      const mission = decision.action.mission
      setMissions((current) =>
        current.some((item) => item.id === mission.id)
          ? current
          : [...current, mission],
      )
      setStatuses((current) => ({
        ...current,
        [mission.id]: 'pending',
      }))
    } else if (decision.action.type === 'depart-truck') {
      const departed = new Set(decision.action.palletIds)
      setPalletStops((current) => {
        const next = { ...current }
        departed.forEach((palletId) => {
          next[palletId] = null
        })
        return next
      })
      setPalletColors((current) => {
        const next = { ...current }
        departed.forEach((palletId) => delete next[palletId])
        return next
      })
    }
  }, [
    brainNow,
    compact,
    layout,
    locations,
    missions,
    palletColors,
    palletStops,
    plan,
    statuses,
  ])

  useEffect(() => {
    if (missions.length === 0) return

    const available = readyMissions(missions, statuses, palletStops)
    const reservedMissionIds = new Set(
      Object.values(assignments).filter(
        (value): value is string => Boolean(value),
      ),
    )
    const activeMissions = [...reservedMissionIds]
      .map((id) => missions.find((mission) => mission.id === id))
      .filter((mission): mission is FleetMission => Boolean(mission))
    const reservedDestinationIds = new Set(
      activeMissions.map((mission) => mission.destination.id),
    )
    const nextAssignments = { ...assignments }
    const nextStatuses = { ...statuses }
    let changed = false

    plan.vehicles.forEach((vehicle) => {
      if (nextAssignments[vehicle.id]) return
      const vehiclePoint =
        readRuntimeVehicleState(vehicle.id)?.point ??
        initialPoses[vehicle.id]?.point ??
        vehicle.startPoint
      const mission = chooseBrainMissionForVehicle({
        vehicle,
        vehiclePoint,
        availableMissions: available,
        activeMissions,
        reservedMissionIds,
        reservedDestinationIds,
      })
      if (!mission) return

      nextAssignments[vehicle.id] = mission.id
      nextStatuses[mission.id] = 'running'
      reservedMissionIds.add(mission.id)
      reservedDestinationIds.add(mission.destination.id)
      activeMissions.push(mission)
      changed = true
    })

    if (changed) {
      setAssignments(nextAssignments)
      setStatuses(nextStatuses)
    }
  }, [
    assignments,
    initialPoses,
    missions,
    palletStops,
    plan.vehicles,
    statuses,
  ])

  useEffect(() => {
    if (missions.length < 140) return
    const assigned = new Set(
      Object.values(assignments).filter(
        (value): value is string => Boolean(value),
      ),
    )
    const removable = missions
      .filter(
        (mission) =>
          statuses[mission.id] === 'completed' && !assigned.has(mission.id),
      )
      .slice(0, Math.max(0, missions.length - 90))
    if (removable.length === 0) return
    const removableIds = new Set(removable.map((mission) => mission.id))

    setMissions((current) =>
      current.filter((mission) => !removableIds.has(mission.id)),
    )
    setStatuses((current) => {
      const next = { ...current }
      removableIds.forEach((missionId) => delete next[missionId])
      return next
    })
  }, [assignments, missions, statuses])

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

  const activeMissionByVehicle = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(assignments).map(([vehicleId, missionId]) => [
          vehicleId,
          missionId
            ? missions.find((mission) => mission.id === missionId)
            : undefined,
        ]),
      ) as Record<string, FleetMission | undefined>,
    [assignments, missions],
  )

  return (
    <group>
      {plan.vehicles.map((vehicle) => {
        const mission = activeMissionByVehicle[vehicle.id]
        const occupiedTrafficCells = new Set(
          Object.entries(activeMissionByVehicle)
            .filter(([vehicleId, item]) => vehicleId !== vehicle.id && Boolean(item))
            .flatMap(([, item]) => item?.trafficCells ?? []),
        )

        return (
          <LiveVehicleRunner
            key={vehicle.id}
            layout={layout}
            vehicle={vehicle}
            mission={mission}
            compact={compact}
            initialPose={initialPoses[vehicle.id]}
            occupiedTrafficCells={occupiedTrafficCells}
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
              <boxGeometry args={[1.5, PALLET_HEIGHT, 0.9]} />
              <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
            </mesh>
            <mesh
              position={[
                0,
                PALLET_HEIGHT / 2 +
                  LOAD_SUPPORT_CLEARANCE +
                  PALLET_LOAD_HEIGHT / 2,
                0,
              ]}
              castShadow
            >
              <boxGeometry args={[1.4, PALLET_LOAD_HEIGHT, 0.82]} />
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
