import { Html } from '@react-three/drei'
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
import { buildAdaptiveFleetPath } from '../domain/fleetDispatchBrain'
import type { WarehouseLayout } from '../domain/layout'
import {
  chooseMiniWmsMissionForVehicle,
  createMiniWmsCycle,
  miniWmsAssignmentReason,
  miniWmsEquipmentClass,
  miniWmsMissionStage,
  miniWmsVehicleBadge,
} from '../domain/miniWms'
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
  LOAD_SUPPORT_CLEARANCE,
  PALLET_HEIGHT,
  TRAVEL_FORK_HEIGHT,
} from '../domain/warehouseGeometry'
import {
  assignOperationMission,
  operationVehicleIsAvailable,
  recordOperationMission,
  registerOperationVehicle,
} from '../store/operationsControlStore'
import { ForkliftModel } from './ForkliftModel'
import { PalletJackModel } from './PalletJackModel'
import {
  isRuntimeVehicleFaulted,
  readRuntimeHazards,
  removeRuntimeVehicle,
  resolveRuntimeVehicleMotion,
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
  | 'parking'

type SafetyVisualState = 'normal' | 'braking' | 'fault'

const EMPTY_SPEED = 3.1
const LOADED_SPEED = 2.35
const ACCELERATION = 2.8
const BRAKING = 4.8
const EMERGENCY_BRAKING = 9.5
const TURN_DURATION = 0.58
const APPROACH_DURATION = 0.9
const HANDLING_PAUSE = 0.72
const LIFT_SPEED = 2.05
const FORKLIFT_CARGO_LOCAL_Z = -1.62
const PALLET_JACK_CARGO_LOCAL_Z = -1.03
const PALLET_LOAD_HEIGHT = 0.82
const CYCLE_RESTART_DELAY = 2_600

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
  const rounded = roundPathCorners(points, 0.92, 6)
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

function safeRoute(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
  vehicleId: string,
  occupiedTrafficCells: Set<string>,
): RouteRuntime {
  try {
    return routeRuntime(
      buildAdaptiveFleetPath(
        layout,
        from,
        to,
        vehicleId,
        occupiedTrafficCells,
      ),
    )
  } catch {
    return routeRuntime([from, to])
  }
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

function interpolatedPoint(
  from: WorldPoint,
  to: WorldPoint,
  ratio: number,
): WorldPoint {
  return {
    x: THREE.MathUtils.lerp(from.x, to.x, ratio),
    y: 0.2,
    z: THREE.MathUtils.lerp(from.z, to.z, ratio),
  }
}

function targetSpeed(maximum: number, remaining: number): number {
  return Math.min(maximum, Math.sqrt(Math.max(0, 2 * BRAKING * remaining)))
}

function vehicleRadius(vehicle: FleetVehicleDefinition): number {
  const equipment = miniWmsEquipmentClass(vehicle)
  if (equipment === 'counterbalance') return 0.78
  if (equipment === 'reach-truck') return 0.69
  return 0.55
}

function missionStageLabel(mission?: FleetMission): string {
  if (!mission) return 'AGUARDANDO ORDEM DO WMS'
  const labels = {
    'unload-truck': 'DESCARREGANDO CAMINHÃO',
    'inbound-transfer': 'TRANSFERINDO PARA A RUA',
    putaway: 'ARMAZENANDO NO RACK',
    retrieve: 'RETIRANDO DO RACK',
    'outbound-transfer': 'LEVANDO AO PRÉ-EMBARQUE',
    'load-truck': 'CARREGANDO CAMINHÃO',
  }
  return labels[miniWmsMissionStage(mission)]
}

function VehicleIdentity({
  vehicle,
  mission,
}: {
  vehicle: FleetVehicleDefinition
  mission?: FleetMission
}) {
  return (
    <Html
      position={[0, 3.05, 0]}
      center
      distanceFactor={15}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      <div
        style={{
          minWidth: 170,
          padding: '7px 10px',
          borderRadius: 8,
          background: 'rgba(15, 23, 42, 0.9)',
          border: `1px solid ${vehicle.color}`,
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,.28)',
        }}
      >
        <strong style={{ display: 'block', fontSize: 12 }}>
          {miniWmsVehicleBadge(vehicle)}
        </strong>
        <span style={{ display: 'block', marginTop: 2, fontSize: 9, color: '#cbd5e1' }}>
          {missionStageLabel(mission)}
        </span>
      </div>
    </Html>
  )
}

function MiniWmsVehicleRunner({
  layout,
  vehicle,
  mission,
  compact,
  occupiedTrafficCells,
  onPickup,
  onDrop,
  onComplete,
}: {
  layout: WarehouseLayout
  vehicle: FleetVehicleDefinition
  mission?: FleetMission
  compact: boolean
  occupiedTrafficCells: Set<string>
  onPickup: (mission: FleetMission) => void
  onDrop: (mission: FleetMission) => void
  onComplete: (vehicle: FleetVehicleDefinition, mission: FleetMission) => void
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
  const parkingRouteRef = useRef<RouteRuntime>(emptyRoute())
  const activeMissionIdRef = useRef<string | null>(null)
  const pickupDoneRef = useRef(false)
  const dropDoneRef = useRef(false)
  const safetyVisualRef = useRef<SafetyVisualState>('normal')
  const [ready, setReady] = useState(false)
  const [carrying, setCarrying] = useState(false)
  const [safetyVisual, setSafetyVisual] =
    useState<SafetyVisualState>('normal')
  const { invalidate } = useThree()
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

    root.position.set(vehicle.startPoint.x, 0.18, vehicle.startPoint.z)
    root.rotation.y = vehicle.startFacing
    carriage.position.y = TRAVEL_FORK_HEIGHT
    initializedRef.current = true
    registerVehicle(root, 0, false)
    setReady(true)
    invalidate()

    return () => removeRuntimeVehicle(vehicle.id)
  }, [invalidate, registerVehicle, vehicle])

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
    emptyRouteRef.current = safeRoute(
      layout,
      currentVehiclePoint(root),
      mission.source.access,
      vehicle.id,
      occupiedTrafficCells,
    )
    loadedRouteRef.current = safeRoute(
      layout,
      mission.source.access,
      mission.destination.access,
      vehicle.id,
      occupiedTrafficCells,
    )
    parkingRouteRef.current = safeRoute(
      layout,
      mission.destination.access,
      vehicle.startPoint,
      vehicle.id,
      occupiedTrafficCells,
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
    vehicle.startPoint,
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
      speedRef.current = 0
      updateSafetyVisual('fault')
      registerVehicle(root, 0, true)
      invalidate()
      return
    }

    if (delayRef.current > 0) {
      delayRef.current = Math.max(0, delayRef.current - delta)
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

    const changePhase = (next: MissionPhase) => {
      phaseRef.current = next
      elapsedRef.current = 0
    }

    const resetMotion = () => {
      elapsedRef.current = 0
      distanceRef.current = 0
      speedRef.current = 0
      updateSafetyVisual('normal')
    }

    const finishAtParking = () => {
      phaseRef.current = 'idle'
      activeMissionIdRef.current = null
      speedRef.current = 0
      updateSafetyVisual('normal')
      registerVehicle(root, 0, false)
      onComplete(vehicle, mission)
    }

    const moveAlongRoute = (
      route: RouteRuntime,
      maximumSpeed: number,
      turnResponsiveness: number,
      nextPhase: MissionPhase,
      completeAtEnd = false,
    ) => {
      if (route.distance <= 0.001) {
        if (completeAtEnd) finishAtParking()
        else {
          changePhase(nextPhase)
          resetMotion()
        }
        return
      }

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
        reactionBuffer: carrying ? 0.95 : 0.72,
        lateralMargin: compact ? 0.15 : 0.2,
      })
      const safeTarget = Math.min(desiredSpeed, safety.safeSpeed)
      const predictiveBraking =
        Number.isFinite(safety.safeSpeed) && safeTarget < desiredSpeed - 0.06
      const nextSpeed = approachSpeed(
        speedRef.current,
        safeTarget,
        predictiveBraking ? EMERGENCY_BRAKING : ACCELERATION,
        delta,
      )
      const intendedStep = Math.max(0, nextSpeed * delta)
      const intendedDistance = Math.min(
        route.distance,
        distanceRef.current + intendedStep,
      )
      const intendedSample = sampleRoute(
        route.points,
        route.lengths,
        intendedDistance,
      )
      const contact = resolveRuntimeVehicleMotion({
        vehicleId: vehicle.id,
        current: currentVehiclePoint(root),
        proposed: intendedSample.point,
        radius,
      })
      const allowedDistance = Math.min(
        route.distance,
        distanceRef.current + intendedStep * contact.fraction,
      )
      const allowedSample = sampleRoute(
        route.points,
        route.lengths,
        allowedDistance,
      )

      distanceRef.current = allowedDistance
      placeVehicle(root, allowedSample, turnResponsiveness, delta)

      if (contact.touching) {
        speedRef.current = 0
        updateSafetyVisual('braking')
      } else {
        speedRef.current = nextSpeed
        updateSafetyVisual(
          predictiveBraking || safety.emergency ? 'braking' : 'normal',
        )
      }
      registerVehicle(root, speedRef.current, true)

      if (allowedSample.finished && !contact.touching) {
        if (completeAtEnd) finishAtParking()
        else {
          changePhase(nextPhase)
          resetMotion()
        }
      }
    }

    const moveLinearly = (
      from: WorldPoint,
      to: WorldPoint,
      nextPhase: MissionPhase,
      nominalSpeed: number,
    ) => {
      const nextElapsed = Math.min(APPROACH_DURATION, elapsedRef.current + delta)
      const nextRatio = nextElapsed / APPROACH_DURATION
      const proposed = interpolatedPoint(from, to, nextRatio)
      const contact = resolveRuntimeVehicleMotion({
        vehicleId: vehicle.id,
        current: currentVehiclePoint(root),
        proposed,
        radius,
        clearance: 0.05,
      })
      const elapsedStep = nextElapsed - elapsedRef.current
      elapsedRef.current += elapsedStep * contact.fraction
      root.position.set(contact.point.x, 0.18, contact.point.z)

      if (contact.touching) {
        speedRef.current = 0
        updateSafetyVisual('braking')
        registerVehicle(root, 0, true)
        return
      }

      speedRef.current = nominalSpeed
      updateSafetyVisual('normal')
      registerVehicle(root, nominalSpeed, true)
      if (nextRatio >= 1) changePhase(nextPhase)
    }

    if (phase === 'idle') return

    if (phase === 'going-to-source') {
      moveAlongRoute(
        emptyRouteRef.current,
        EMPTY_SPEED * speedScale,
        7,
        'pickup-turn',
      )
    } else if (phase === 'pickup-turn') {
      elapsedRef.current += delta
      root.rotation.y = angleTowards(root.rotation.y, source.facing, delta * 6)
      if (elapsedRef.current >= TURN_DURATION) {
        root.rotation.y = source.facing
        changePhase('pickup-lift')
      }
    } else if (phase === 'pickup-lift') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        source.forkHeight,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === source.forkHeight) {
        changePhase('pickup-approach')
      }
    } else if (phase === 'pickup-approach') {
      moveLinearly(source.access, sourceAligned, 'pickup-attach', 0.55)
    } else if (phase === 'pickup-attach') {
      elapsedRef.current += delta
      speedRef.current = 0
      if (!pickupDoneRef.current && elapsedRef.current >= 0.2) {
        pickupDoneRef.current = true
        setCarrying(true)
        onPickup(mission)
      }
      if (elapsedRef.current >= HANDLING_PAUSE) changePhase('pickup-retreat')
    } else if (phase === 'pickup-retreat') {
      moveLinearly(sourceAligned, source.access, 'pickup-lower', 0.5)
    } else if (phase === 'pickup-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
        changePhase('transporting')
        resetMotion()
      }
    } else if (phase === 'transporting') {
      moveAlongRoute(
        loadedRouteRef.current,
        LOADED_SPEED * speedScale,
        6,
        'drop-turn',
      )
    } else if (phase === 'drop-turn') {
      elapsedRef.current += delta
      root.rotation.y = angleTowards(
        root.rotation.y,
        destination.facing,
        delta * 6,
      )
      if (elapsedRef.current >= TURN_DURATION) {
        root.rotation.y = destination.facing
        changePhase('drop-lift')
      }
    } else if (phase === 'drop-lift') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        destination.forkHeight,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === destination.forkHeight) {
        changePhase('drop-approach')
      }
    } else if (phase === 'drop-approach') {
      moveLinearly(destination.access, destinationAligned, 'drop-detach', 0.55)
    } else if (phase === 'drop-detach') {
      elapsedRef.current += delta
      speedRef.current = 0
      if (!dropDoneRef.current && elapsedRef.current >= 0.2) {
        dropDoneRef.current = true
        setCarrying(false)
        onDrop(mission)
      }
      if (elapsedRef.current >= HANDLING_PAUSE) changePhase('drop-retreat')
    } else if (phase === 'drop-retreat') {
      moveLinearly(destinationAligned, destination.access, 'drop-lower', 0.5)
    } else if (phase === 'drop-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED * liftScale,
      )
      if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
        changePhase('parking')
        resetMotion()
      }
    } else if (phase === 'parking') {
      moveAlongRoute(
        parkingRouteRef.current,
        EMPTY_SPEED * speedScale * 0.78,
        7,
        'idle',
        true,
      )
    }

    invalidate()
  })

  return (
    <group ref={vehicleRef} visible={ready}>
      <VehicleIdentity vehicle={vehicle} mission={mission} />
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
          reportRuntimePose={false}
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

export function MiniWmsFleetOperation({
  layout,
  plan,
  compact,
}: {
  layout: WarehouseLayout
  plan: RealisticFleetPlan
  compact: boolean
}) {
  const initialCycle = useMemo(() => createMiniWmsCycle(plan, 1), [plan])
  const [cycleNumber, setCycleNumber] = useState(1)
  const [missions, setMissions] = useState<FleetMission[]>(
    initialCycle.missions,
  )
  const [palletStops, setPalletStops] = useState<
    Record<string, RealisticMissionStop | null>
  >(initialCycle.initialPalletStops)
  const [palletColors, setPalletColors] = useState<Record<string, string>>(
    initialCycle.palletColors,
  )
  const [statuses, setStatuses] = useState<Record<string, FleetMissionStatus>>(
    () => createMissionStatuses(initialCycle.missions),
  )
  const [assignments, setAssignments] = useState<VehicleAssignmentMap>(() =>
    Object.fromEntries(plan.vehicles.map((vehicle) => [vehicle.id, null])),
  )

  useEffect(() => {
    const cycle = createMiniWmsCycle(plan, 1)
    setCycleNumber(1)
    setMissions(cycle.missions)
    setPalletStops(cycle.initialPalletStops)
    setPalletColors(cycle.palletColors)
    setStatuses(createMissionStatuses(cycle.missions))
    setAssignments(
      Object.fromEntries(plan.vehicles.map((vehicle) => [vehicle.id, null])),
    )
    plan.vehicles.forEach((vehicle) => registerOperationVehicle(vehicle))
  }, [plan])

  useEffect(() => {
    if (missions.length === 0) return
    const available = readyMissions(missions, statuses, palletStops)
    const reservedMissionIds = new Set(
      Object.values(assignments).filter(
        (value): value is string => Boolean(value),
      ),
    )
    const reservedDestinationIds = new Set(
      [...reservedMissionIds]
        .map((missionId) => missions.find((mission) => mission.id === missionId))
        .filter((mission): mission is FleetMission => Boolean(mission))
        .map((mission) => mission.destination.id),
    )
    const nextAssignments = { ...assignments }
    const nextStatuses = { ...statuses }
    let changed = false

    plan.vehicles.forEach((vehicle) => {
      if (nextAssignments[vehicle.id]) return
      if (!operationVehicleIsAvailable(vehicle.id)) return
      const mission = chooseMiniWmsMissionForVehicle({
        vehicle,
        availableMissions: available,
        reservedMissionIds,
        reservedDestinationIds,
      })
      if (!mission) return

      const reason = miniWmsAssignmentReason(vehicle, mission)
      recordOperationMission({
        id: mission.id,
        palletId: mission.palletId,
        role: mission.role,
        sourceId: mission.source.id,
        sourceLabel: mission.source.label,
        destinationId: mission.destination.id,
        destinationLabel: mission.destination.label,
      })
      assignOperationMission(vehicle, mission.id, reason)
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
  }, [assignments, missions, palletStops, plan.vehicles, statuses])

  useEffect(() => {
    const allCompleted =
      missions.length > 0 &&
      missions.every((mission) => statuses[mission.id] === 'completed')
    const allVehiclesFree = Object.values(assignments).every(
      (missionId) => missionId === null,
    )
    if (!allCompleted || !allVehiclesFree) return

    const timer = window.setTimeout(() => {
      const nextCycleNumber = cycleNumber + 1
      const cycle = createMiniWmsCycle(plan, nextCycleNumber)
      setCycleNumber(nextCycleNumber)
      setMissions(cycle.missions)
      setPalletStops(cycle.initialPalletStops)
      setPalletColors(cycle.palletColors)
      setStatuses(createMissionStatuses(cycle.missions))
      setAssignments(
        Object.fromEntries(plan.vehicles.map((vehicle) => [vehicle.id, null])),
      )
    }, CYCLE_RESTART_DELAY)

    return () => window.clearTimeout(timer)
  }, [assignments, cycleNumber, missions, plan, statuses])

  const handlePickup = useCallback((mission: FleetMission) => {
    setPalletStops((current) => ({ ...current, [mission.palletId]: null }))
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
            .filter(
              ([vehicleId, activeMission]) =>
                vehicleId !== vehicle.id && Boolean(activeMission),
            )
            .flatMap(([, activeMission]) => activeMission?.trafficCells ?? []),
        )

        return (
          <MiniWmsVehicleRunner
            key={vehicle.id}
            layout={layout}
            vehicle={vehicle}
            mission={mission}
            compact={compact}
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
