import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import {
  buildRealisticMissionPlan,
  type RealisticDockGeometry,
  type RealisticMission,
  type RealisticMissionPlan,
  type RealisticMissionStop,
} from '../domain/realisticMissionQueue'
import { buildTravelPath, type WorldPoint } from '../domain/routePlanning'
import {
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

type MissionPhase =
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
  | 'pause'
  | 'wave-reset'

const EMPTY_SPEED = 3.7
const LOADED_SPEED = 2.8
const ACCELERATION = 3.4
const BRAKING = 4.8
const TURN_DURATION = 0.48
const APPROACH_DURATION = 0.72
const HANDLING_PAUSE = 0.65
const LIFT_SPEED = 2.25
const CARGO_LOCAL_Z = -1.62
const RECEIVING_PLATFORM_HEIGHT = 0.25
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

function currentVehiclePoint(vehicle: THREE.Group): WorldPoint {
  return {
    x: vehicle.position.x,
    y: 0.2,
    z: vehicle.position.z,
  }
}

function alignedVehiclePoint(stop: RealisticMissionStop): WorldPoint {
  const cargoOffset = rotatePoint(0, CARGO_LOCAL_Z, stop.facing)
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
      <mesh position={[0, PALLET_HEIGHT / 2 + 0.015 + PALLET_LOAD_HEIGHT / 2, 0]} castShadow>
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
      <mesh position={[-3.05, 1.15, 0]} castShadow>
        <boxGeometry args={[0.35, 2.65, 0.42]} />
        <meshStandardMaterial color="#475569" metalness={0.35} roughness={0.5} />
      </mesh>
      <mesh position={[3.05, 1.15, 0]} castShadow>
        <boxGeometry args={[0.35, 2.65, 0.42]} />
        <meshStandardMaterial color="#475569" metalness={0.35} roughness={0.5} />
      </mesh>
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
      <mesh position={[-1.32, 1.65, -1.65]} castShadow>
        <boxGeometry args={[0.12, 2.6, 6.7]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.12} roughness={0.64} />
      </mesh>
      <mesh position={[1.32, 1.65, -1.65]} castShadow>
        <boxGeometry args={[0.12, 2.6, 6.7]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.12} roughness={0.64} />
      </mesh>
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

function ReceivingPlatforms({
  stops,
}: {
  stops: RealisticMissionStop[]
}) {
  return (
    <>
      {stops.map((stop) => (
        <mesh
          key={`platform-${stop.id}`}
          position={[
            stop.restingPoint.x,
            RECEIVING_PLATFORM_HEIGHT / 2,
            stop.restingPoint.z,
          ]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[1.9, RECEIVING_PLATFORM_HEIGHT, 1.35]} />
          <meshStandardMaterial color="#475569" metalness={0.18} roughness={0.82} />
        </mesh>
      ))}
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

function ContinuousMissionCycle({
  layout,
  locations,
  plan,
  compact,
}: {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticMissionPlan
  compact: boolean
}) {
  const vehicleRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const missionIndexRef = useRef(0)
  const phaseRef = useRef<MissionPhase>('going-to-source')
  const elapsedRef = useRef(0)
  const distanceRef = useRef(0)
  const speedRef = useRef(0)
  const emptyRouteRef = useRef<RouteRuntime>({ points: [], lengths: [], distance: 0 })
  const loadedRouteRef = useRef<RouteRuntime>({ points: [], lengths: [], distance: 0 })
  const [ready, setReady] = useState(false)
  const [carryingPalletId, setCarryingPalletId] = useState<string | null>(null)
  const [palletStops, setPalletStops] = useState<
    Record<string, RealisticMissionStop | null>
  >({})
  const { invalidate } = useThree()
  const parkAtPoint = useOperationalVehicleStore((state) => state.parkAtPoint)

  const prepareMission = useCallback(
    (index: number, startPoint: WorldPoint) => {
      const mission = plan.missions[index]
      if (!mission) return

      missionIndexRef.current = index
      emptyRouteRef.current = routeRuntime(
        safePath(layout, startPoint, mission.source.access),
      )
      loadedRouteRef.current = routeRuntime(
        safePath(layout, mission.source.access, mission.destination.access),
      )
      phaseRef.current = 'going-to-source'
      elapsedRef.current = 0
      distanceRef.current = 0
      speedRef.current = 0
      setCarryingPalletId(null)
      invalidate()
    },
    [invalidate, layout, plan.missions],
  )

  useLayoutEffect(() => {
    const vehicle = vehicleRef.current
    const carriage = carriageRef.current
    if (!vehicle || !carriage || plan.missions.length === 0) {
      setReady(false)
      return
    }

    const anchor = useOperationalVehicleStore.getState().anchor
    const initialPoint = resolveOperationalVehiclePoint(layout, locations, anchor)
    const initialFacing = resolveOperationalVehicleFacing(anchor)

    setReady(false)
    vehicle.position.set(initialPoint.x, 0.18, initialPoint.z)
    vehicle.rotation.y = initialFacing
    carriage.position.y = TRAVEL_FORK_HEIGHT
    setPalletStops({ ...plan.initialPalletStops })
    setCarryingPalletId(null)
    prepareMission(0, initialPoint)
    setReady(true)

    return () => {
      const currentVehicle = vehicleRef.current
      if (!currentVehicle) return
      parkAtPoint(
        currentVehiclePoint(currentVehicle),
        'Última posição do modo realista',
        currentVehicle.rotation.y,
      )
    }
  }, [layout, locations, parkAtPoint, plan, prepareMission])

  useFrame((_, delta) => {
    const vehicle = vehicleRef.current
    const carriage = carriageRef.current
    const mission = plan.missions[missionIndexRef.current]
    if (!ready || !vehicle || !carriage || !mission) return

    const source = mission.source
    const destination = mission.destination
    const sourceAligned = alignedVehiclePoint(source)
    const destinationAligned = alignedVehiclePoint(destination)
    const phase = phaseRef.current

    const resetMotion = () => {
      elapsedRef.current = 0
      distanceRef.current = 0
      speedRef.current = 0
    }

    if (phase === 'going-to-source') {
      const route = emptyRouteRef.current
      const remaining = Math.max(0, route.distance - distanceRef.current)
      speedRef.current = approachSpeed(
        speedRef.current,
        targetSpeed(EMPTY_SPEED, remaining),
        ACCELERATION,
        delta,
      )
      distanceRef.current += speedRef.current * delta
      const sample = sampleRoute(route.points, route.lengths, distanceRef.current)
      placeVehicle(vehicle, sample, 8, delta)
      if (sample.finished) {
        phaseRef.current = 'pickup-turn'
        resetMotion()
      }
    } else if (phase === 'pickup-turn') {
      elapsedRef.current += delta
      vehicle.rotation.y = angleTowards(vehicle.rotation.y, source.facing, delta * 7)
      if (elapsedRef.current >= TURN_DURATION) {
        vehicle.rotation.y = source.facing
        phaseRef.current = 'pickup-lift'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-lift') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        source.forkHeight,
        delta * LIFT_SPEED,
      )
      if (carriage.position.y === source.forkHeight) {
        phaseRef.current = 'pickup-approach'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-approach') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(vehicle, source.access, sourceAligned, ratio)
      if (ratio === 1) {
        phaseRef.current = 'pickup-attach'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-attach') {
      elapsedRef.current += delta
      if (elapsedRef.current >= 0.18 && carryingPalletId !== mission.palletId) {
        setPalletStops((current) => ({
          ...current,
          [mission.palletId]: null,
        }))
        setCarryingPalletId(mission.palletId)
      }
      if (elapsedRef.current >= HANDLING_PAUSE) {
        phaseRef.current = 'pickup-retreat'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-retreat') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(vehicle, sourceAligned, source.access, ratio)
      if (ratio === 1) phaseRef.current = 'pickup-lower'
    } else if (phase === 'pickup-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED,
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
        targetSpeed(LOADED_SPEED, remaining),
        ACCELERATION,
        delta,
      )
      distanceRef.current += speedRef.current * delta
      const sample = sampleRoute(route.points, route.lengths, distanceRef.current)
      placeVehicle(vehicle, sample, 7, delta)
      if (sample.finished) {
        phaseRef.current = 'drop-turn'
        resetMotion()
      }
    } else if (phase === 'drop-turn') {
      elapsedRef.current += delta
      vehicle.rotation.y = angleTowards(
        vehicle.rotation.y,
        destination.facing,
        delta * 7,
      )
      if (elapsedRef.current >= TURN_DURATION) {
        vehicle.rotation.y = destination.facing
        phaseRef.current = 'drop-lift'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-lift') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        destination.forkHeight,
        delta * LIFT_SPEED,
      )
      if (carriage.position.y === destination.forkHeight) {
        phaseRef.current = 'drop-approach'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-approach') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(vehicle, destination.access, destinationAligned, ratio)
      if (ratio === 1) {
        phaseRef.current = 'drop-detach'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-detach') {
      elapsedRef.current += delta
      if (elapsedRef.current >= 0.18 && carryingPalletId === mission.palletId) {
        setPalletStops((current) => ({
          ...current,
          [mission.palletId]: destination,
        }))
        setCarryingPalletId(null)
      }
      if (elapsedRef.current >= HANDLING_PAUSE) {
        phaseRef.current = 'drop-retreat'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-retreat') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      interpolateVehicle(vehicle, destinationAligned, destination.access, ratio)
      if (ratio === 1) phaseRef.current = 'drop-lower'
    } else if (phase === 'drop-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED,
      )
      if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
        parkAtPoint(
          currentVehiclePoint(vehicle),
          `Ao lado de ${destination.label}`,
          vehicle.rotation.y,
        )
        phaseRef.current = 'pause'
        elapsedRef.current = 0
      }
    } else if (phase === 'pause') {
      elapsedRef.current += delta
      if (elapsedRef.current >= 0.7) {
        const nextIndex = missionIndexRef.current + 1
        if (nextIndex < plan.missions.length) {
          prepareMission(nextIndex, currentVehiclePoint(vehicle))
        } else {
          phaseRef.current = 'wave-reset'
          elapsedRef.current = 0
        }
      }
    } else {
      elapsedRef.current += delta
      if (elapsedRef.current >= 1.5) {
        setPalletStops({ ...plan.initialPalletStops })
        prepareMission(0, currentVehiclePoint(vehicle))
      }
    }

    invalidate()
  })

  const currentMission: RealisticMission | undefined =
    plan.missions[missionIndexRef.current]
  const mastHeight = Math.max(
    2.4,
    ...plan.missions.flatMap((mission) => [
      mission.source.forkHeight + 1,
      mission.destination.forkHeight + 1,
    ]),
  )

  return (
    <group>
      <group ref={vehicleRef} visible={ready}>
        <ForkliftModel
          carriageRef={carriageRef}
          mastHeight={mastHeight}
          compact={compact}
          cargoVisible={Boolean(carryingPalletId)}
          cargoColor={currentMission?.color ?? '#38bdf8'}
        />
      </group>
      {Object.entries(palletStops).map(([palletId, stop]) => {
        if (!stop) return null
        const mission = plan.missions.find((item) => item.palletId === palletId)
        return (
          <PalletVisual
            key={palletId}
            stop={stop}
            color={mission?.color ?? '#38bdf8'}
          />
        )
      })}
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
    () => buildRealisticMissionPlan(layout, locations, geometry),
    [geometry, layout, locations],
  )

  return (
    <group>
      <WarehouseShell layout={layout} geometry={geometry} compact={compact} />
      <ReceivingPlatforms stops={plan.receivingStops} />
      {animated && plan.missions.length > 0 && (
        <ContinuousMissionCycle
          layout={layout}
          locations={locations}
          plan={plan}
          compact={compact}
        />
      )}
    </group>
  )
}
