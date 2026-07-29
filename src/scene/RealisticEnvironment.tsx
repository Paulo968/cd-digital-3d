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
import type { WarehouseLayout } from '../domain/layout'
import {
  buildRealisticFleetPlan,
  chooseMissionForVehicle,
  createMissionStatuses,
  readyMissions,
  type FleetMission,
  type FleetMissionStatus,
  type FleetVehicleDefinition,
  type RealisticFleetPlan,
} from '../domain/realisticFleet'
import type {
  RealisticDockGeometry,
  RealisticMissionStop,
} from '../domain/realisticMissionQueue'
import { buildTravelPath, type WorldPoint } from '../domain/routePlanning'
import {
  PALLET_HEIGHT,
  PALLET_SUPPORT_CLEARANCE,
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
  angleTowards,
  approachSpeed,
  moveNumber,
  placeVehicle,
  roundPathCorners,
  routeDistance,
  routeLengths,
  sampleRoute,
} from './vehicleMotion'

interface LayoutBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

interface EnvironmentGeometry extends RealisticDockGeometry {
  bounds: LayoutBounds
  centerX: number
  centerZ: number
  width: number
  depth: number
}

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

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

const EMPTY_SPEED = 3.7
const LOADED_SPEED = 2.8
const ACCELERATION = 3.4
const BRAKING = 4.8
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

function getLayoutBounds(layout: WarehouseLayout): LayoutBounds {
  let minX = -layout.floor.width / 2
  let maxX = layout.floor.width / 2
  let minZ = -layout.floor.depth / 2
  let maxZ = layout.floor.depth / 2

  layout.rackRows
    .filter((row) => row.active)
    .forEach((row) => {
      const halfLength = (row.baysPerSide * row.bayWidth) / 2
      const halfDepth = row.aisleWidth / 2 + row.rackDepth
      const corners = [
        [-halfLength, -halfDepth],
        [-halfLength, halfDepth],
        [halfLength, -halfDepth],
        [halfLength, halfDepth],
      ] as const

      corners.forEach(([localX, localZ]) => {
        const rotated = rotatePoint(localX, localZ, row.rotationY)
        minX = Math.min(minX, row.origin.x + rotated.x)
        maxX = Math.max(maxX, row.origin.x + rotated.x)
        minZ = Math.min(minZ, row.origin.z + rotated.z)
        maxZ = Math.max(maxZ, row.origin.z + rotated.z)
      })
    })

  layout.zones.forEach((zone) => {
    minX = Math.min(minX, zone.origin.x - zone.width / 2)
    maxX = Math.max(maxX, zone.origin.x + zone.width / 2)
    minZ = Math.min(minZ, zone.origin.z - zone.depth / 2)
    maxZ = Math.max(maxZ, zone.origin.z + zone.depth / 2)
  })

  return { minX, maxX, minZ, maxZ }
}

function getEnvironmentGeometry(layout: WarehouseLayout): EnvironmentGeometry {
  const bounds = getLayoutBounds(layout)
  const padding = 3.5
  const minX = bounds.minX - padding
  const maxX = bounds.maxX + padding
  const minZ = bounds.minZ - padding
  const maxZ = bounds.maxZ + padding
  const width = maxX - minX
  const depth = maxZ - minZ
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const receiving = layout.zones.find((zone) => zone.type === 'receiving')
  const shipping = layout.zones.find((zone) => zone.type === 'shipping')

  return {
    bounds: { minX, maxX, minZ, maxZ },
    centerX,
    centerZ,
    width,
    depth,
    frontZ: maxZ,
    receivingX: receiving?.origin.x ?? centerX - width * 0.22,
    shippingX: shipping?.origin.x ?? centerX + width * 0.22,
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

function PalletVisual({
  stop,
  color,
}: {
  stop: RealisticMissionStop
  color: string
}) {
  return (
    <group
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
          PALLET_HEIGHT / 2 + 0.015 + PALLET_LOAD_HEIGHT / 2,
          0,
        ]}
        castShadow
      >
        <boxGeometry args={[1.4, PALLET_LOAD_HEIGHT, 0.82]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
    </group>
  )
}

function DockPortal({ x, frontZ }: { x: number; frontZ: number }) {
  return (
    <group position={[x, 0, frontZ]}>
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[6.2, 0.35, 0.42]} />
        <meshStandardMaterial color="#475569" metalness={0.35} roughness={0.5} />
      </mesh>
      {[-3.05, 3.05].map((postX) => (
        <mesh key={postX} position={[postX, 1.15, 0]} castShadow>
          <boxGeometry args={[0.35, 2.65, 0.42]} />
          <meshStandardMaterial color="#475569" metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.08, -1.05]} receiveShadow>
        <boxGeometry args={[6.2, 0.15, 2.2]} />
        <meshStandardMaterial color="#334155" roughness={0.92} />
      </mesh>
      {[-2.65, 2.65].map((defenseX) => (
        <mesh key={defenseX} position={[defenseX, 0.6, -0.5]}>
          <boxGeometry args={[0.22, 1.2, 0.35]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      ))}
    </group>
  )
}

function Truck({
  x,
  z,
  accent,
  compact,
}: {
  x: number
  z: number
  accent: string
  compact: boolean
}) {
  const wheelSegments = compact ? 10 : 16

  return (
    <group position={[x, 0.15, z]}>
      <mesh position={[0, 0.35, -1.65]} receiveShadow castShadow>
        <boxGeometry args={[2.75, 0.16, 6.7]} />
        <meshStandardMaterial color="#64748b" metalness={0.22} roughness={0.7} />
      </mesh>
      {[-1.32, 1.32].map((sideX) => (
        <mesh key={sideX} position={[sideX, 1.65, -1.65]} castShadow>
          <boxGeometry args={[0.12, 2.6, 6.7]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.12} roughness={0.64} />
        </mesh>
      ))}
      <mesh position={[0, 2.95, -1.65]} castShadow>
        <boxGeometry args={[2.75, 0.14, 6.7]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.12} roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.65, 1.65]} castShadow>
        <boxGeometry args={[2.75, 2.6, 0.12]} />
        <meshStandardMaterial color="#dbe3ec" metalness={0.12} roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.18, 2.75]} castShadow>
        <boxGeometry args={[2.6, 2.35, 2.25]} />
        <meshStandardMaterial color={accent} metalness={0.2} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.55, 3.9]} castShadow>
        <boxGeometry args={[2.35, 1.3, 0.24]} />
        <meshStandardMaterial color="#0f172a" metalness={0.35} roughness={0.2} />
      </mesh>
      {[-1.05, 1.05].flatMap((wheelX) =>
        [-3.6, -0.8, 2.85].map((wheelZ) => (
          <mesh
            key={`${wheelX}-${wheelZ}`}
            position={[wheelX, 0.42, wheelZ]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.42, 0.42, 0.24, wheelSegments]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  )
}

function FloorSupports({ stops }: { stops: RealisticMissionStop[] }) {
  return (
    <>
      {stops.map((stop) => {
        const supportHeight = Math.max(
          0.04,
          stop.restingPoint.y -
            PALLET_HEIGHT / 2 -
            PALLET_SUPPORT_CLEARANCE,
        )
        return (
          <mesh
            key={`support-${stop.id}`}
            position={[
              stop.restingPoint.x,
              supportHeight / 2,
              stop.restingPoint.z,
            ]}
            receiveShadow
            castShadow
          >
            <boxGeometry args={[1.9, supportHeight, 1.35]} />
            <meshStandardMaterial color="#475569" metalness={0.18} roughness={0.82} />
          </mesh>
        )
      })}
    </>
  )
}

function WarehouseShell({
  layout,
  geometry,
  compact,
}: {
  layout: WarehouseLayout
  geometry: EnvironmentGeometry
  compact: boolean
}) {
  const { bounds, centerX, centerZ, width, depth, frontZ } = geometry
  const maximumRackHeight = Math.max(
    ...layout.rackRows
      .filter((row) => row.active)
      .map((row) => row.levels * row.levelHeight),
    7,
  )
  const wallHeight = maximumRackHeight + 3.2
  const beamCount = compact ? 4 : 8
  const lightCount = compact ? 3 : 7

  return (
    <group>
      <mesh position={[centerX, wallHeight / 2, bounds.minZ]} receiveShadow castShadow>
        <boxGeometry args={[width, wallHeight, 0.32]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.86} />
      </mesh>
      <mesh position={[bounds.minX, wallHeight / 2, centerZ]} receiveShadow castShadow>
        <boxGeometry args={[0.32, wallHeight, depth]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.88} />
      </mesh>
      <mesh position={[bounds.maxX, wallHeight / 2, centerZ]} receiveShadow castShadow>
        <boxGeometry args={[0.32, wallHeight, depth]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.88} />
      </mesh>

      {Array.from({ length: beamCount }, (_, index) => {
        const ratio = index / Math.max(1, beamCount - 1)
        const z = THREE.MathUtils.lerp(bounds.minZ + 1.5, bounds.maxZ - 1.5, ratio)
        return (
          <mesh key={`roof-beam-${index}`} position={[centerX, wallHeight - 0.55, z]}>
            <boxGeometry args={[width - 0.8, 0.18, 0.18]} />
            <meshStandardMaterial color="#475569" metalness={0.55} roughness={0.42} />
          </mesh>
        )
      })}

      {Array.from({ length: lightCount }, (_, index) => {
        const ratio = index / Math.max(1, lightCount - 1)
        const z = THREE.MathUtils.lerp(bounds.minZ + 4, bounds.maxZ - 5, ratio)
        return (
          <mesh key={`light-${index}`} position={[centerX, wallHeight - 0.85, z]}>
            <boxGeometry args={[Math.min(8, width * 0.22), 0.12, 0.42]} />
            <meshStandardMaterial
              color="#f8fafc"
              emissive="#dbeafe"
              emissiveIntensity={compact ? 0.55 : 1}
            />
          </mesh>
        )
      })}

      <DockPortal x={geometry.receivingX} frontZ={frontZ} />
      <DockPortal x={geometry.shippingX} frontZ={frontZ} />
      <Truck
        x={geometry.shippingX}
        z={frontZ + 5.1}
        accent="#0284c7"
        compact={compact}
      />
      {!compact && (
        <Truck
          x={geometry.receivingX}
          z={frontZ + 5.1}
          accent="#16a34a"
          compact={compact}
        />
      )}

      <mesh position={[centerX, 0.018, frontZ + 5.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 11]} />
        <meshStandardMaterial color="#374151" roughness={0.98} />
      </mesh>
    </group>
  )
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
  const [ready, setReady] = useState(false)
  const [carrying, setCarrying] = useState(false)
  const { invalidate } = useThree()
  const parkAtPoint = useOperationalVehicleStore((state) => state.parkAtPoint)

  useLayoutEffect(() => {
    const root = vehicleRef.current
    const carriage = carriageRef.current
    if (!root || !carriage) return

    root.position.set(initialPose.point.x, 0.18, initialPose.point.z)
    root.rotation.y = initialPose.facing
    carriage.position.y = TRAVEL_FORK_HEIGHT
    initializedRef.current = true
    setReady(true)
    invalidate()

    return () => {
      if (vehicle.id !== 'EMP-01' || !vehicleRef.current) return
      parkAtPoint(
        currentVehiclePoint(vehicleRef.current),
        'Última posição da EMP-01 no modo realista',
        vehicleRef.current.rotation.y,
      )
    }
  }, [initialPose, invalidate, parkAtPoint, vehicle.id])

  useEffect(() => {
    const root = vehicleRef.current
    if (!ready || !root || !mission) {
      activeMissionIdRef.current = null
      phaseRef.current = 'idle'
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
    invalidate()
  }, [invalidate, layout, mission, ready])

  useFrame((_, delta) => {
    const root = vehicleRef.current
    const carriage = carriageRef.current
    if (!initializedRef.current || !ready || !root || !carriage || !mission) return
    if (activeMissionIdRef.current !== mission.id) return

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

    const resetMotion = () => {
      elapsedRef.current = 0
      distanceRef.current = 0
      speedRef.current = 0
    }

    if (phase === 'idle') return

    if (phase === 'going-to-source') {
      const route = emptyRouteRef.current
      const remaining = Math.max(0, route.distance - distanceRef.current)
      speedRef.current = approachSpeed(
        speedRef.current,
        targetSpeed(EMPTY_SPEED * speedScale, remaining),
        ACCELERATION,
        delta,
      )
      distanceRef.current += speedRef.current * delta
      const sample = sampleRoute(route.points, route.lengths, distanceRef.current)
      placeVehicle(root, sample, 8, delta)
      if (sample.finished) {
        phaseRef.current = 'pickup-turn'
        resetMotion()
      }
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
      const route = loadedRouteRef.current
      const remaining = Math.max(0, route.distance - distanceRef.current)
      speedRef.current = approachSpeed(
        speedRef.current,
        targetSpeed(LOADED_SPEED * speedScale, remaining),
        ACCELERATION,
        delta,
      )
      distanceRef.current += speedRef.current * delta
      const sample = sampleRoute(route.points, route.lengths, distanceRef.current)
      placeVehicle(root, sample, 7, delta)
      if (sample.finished) {
        phaseRef.current = 'drop-turn'
        resetMotion()
      }
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
        />
      ) : (
        <PalletJackModel
          carriageRef={carriageRef}
          compact={compact}
          cargoVisible={carrying}
          cargoColor={mission?.color ?? '#38bdf8'}
          accent={vehicle.color}
        />
      )}
    </group>
  )
}

function FleetOperation({
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
  const [wave, setWave] = useState(0)
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
  }, [layout, locations, plan.vehicles, wave])

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
    <group key={`fleet-wave-${wave}`}>
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
          <PalletVisual
            key={palletId}
            stop={stop}
            color={palletColors[palletId] ?? '#38bdf8'}
          />
        ) : null,
      )}
    </group>
  )
}

export function RealisticEnvironment({
  layout,
  locations,
  animated,
  compact,
}: RealisticEnvironmentProps) {
  const geometry = useMemo(() => getEnvironmentGeometry(layout), [layout])
  const plan = useMemo(
    () => buildRealisticFleetPlan(layout, locations, geometry, compact),
    [compact, geometry, layout, locations],
  )

  return (
    <group>
      <WarehouseShell layout={layout} geometry={geometry} compact={compact} />
      <FloorSupports stops={[...plan.receivingStops, ...plan.stagingStops]} />
      {animated && plan.missions.length > 0 && (
        <FleetOperation
          layout={layout}
          locations={locations}
          plan={plan}
          compact={compact}
        />
      )}
    </group>
  )
}
