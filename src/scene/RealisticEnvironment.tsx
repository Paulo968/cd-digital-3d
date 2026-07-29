import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { WarehouseLayout, WarehouseZone } from '../domain/layout'
import {
  buildTravelPath,
  getLocationAccessPoint,
  getLocationWorldPoint,
  type WorldPoint,
} from '../domain/routePlanning'
import {
  findLocationRow,
  getForkCarriageHeight,
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

interface LayoutBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

interface MissionStop {
  id: 'receiving' | 'reserve' | 'picking' | 'truck'
  label: string
  access: WorldPoint
  restingPoint: WorldPoint
  facing: number
  forkHeight: number
}

interface DemonstrationLeg {
  id: 'putaway' | 'replenishment' | 'shipping'
  source: MissionStop
  destination: MissionStop
  points: WorldPoint[]
  lengths: number[]
  distance: number
}

interface EnvironmentGeometry {
  bounds: LayoutBounds
  centerX: number
  centerZ: number
  width: number
  depth: number
  frontZ: number
  dockXs: [number, number]
}

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

const EMPTY_SPEED = 3.7
const LOADED_SPEED = 2.8
const ACCELERATION = 3.4
const BRAKING = 4.8
const TURN_DURATION = 0.48
const APPROACH_DURATION = 0.72
const HANDLING_PAUSE = 0.65
const LIFT_SPEED = 2.25
const CARGO_LOCAL_Z = -1.62
const CARGO_LOCAL_Y = 0.1

function rotatePoint(x: number, z: number, angle: number): { x: number; z: number } {
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
    dockXs: [
      receiving?.origin.x ?? centerX - width * 0.22,
      shipping?.origin.x ?? centerX + width * 0.22,
    ],
  }
}

function zonePoint(zone: WarehouseZone | undefined, fallback: WorldPoint): WorldPoint {
  return zone
    ? { x: zone.origin.x, y: PALLET_HEIGHT / 2 + 0.03, z: zone.origin.z }
    : fallback
}

function alignedVehiclePoint(stop: MissionStop): WorldPoint {
  const cargoOffset = rotatePoint(0, CARGO_LOCAL_Z, stop.facing)
  return {
    x: stop.restingPoint.x - cargoOffset.x,
    y: 0.2,
    z: stop.restingPoint.z - cargoOffset.z,
  }
}

function rackStop(
  id: 'reserve' | 'picking',
  label: string,
  layout: WarehouseLayout,
  location: WarehouseLocation,
): MissionStop {
  const point = getLocationWorldPoint(layout, location)
  const row = findLocationRow(layout, location)
  const facing = row
    ? row.rotationY + (location.side === 'left' ? 0 : Math.PI)
    : 0

  return {
    id,
    label,
    access: getLocationAccessPoint(layout, location),
    restingPoint: {
      x: point.x,
      y: getPalletCenterY(layout, location),
      z: point.z,
    },
    facing,
    forkHeight: getForkCarriageHeight(layout, location),
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

function buildMissionStops(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
  geometry: EnvironmentGeometry,
): MissionStop[] {
  const receivingZone = layout.zones.find((zone) => zone.type === 'receiving')
  const receivingRest = zonePoint(receivingZone, {
    x: geometry.dockXs[0],
    y: PALLET_HEIGHT / 2 + 0.03,
    z: geometry.frontZ - 4,
  })
  const receiving: MissionStop = {
    id: 'receiving',
    label: 'Recebimento',
    restingPoint: receivingRest,
    access: {
      x: receivingRest.x,
      y: 0.2,
      z: receivingRest.z + 3,
    },
    facing: 0,
    forkHeight: Math.max(0.03, receivingRest.y - PALLET_HEIGHT / 2 - 0.22),
  }

  const reserveLocation =
    locations.find(
      (location) => location.zone === 'reserve' && location.status === 'empty',
    ) ??
    locations.find((location) => location.zone === 'reserve') ??
    locations[0]
  const pickingLocation =
    locations.find(
      (location) => location.zone === 'picking' && location.status === 'empty',
    ) ??
    locations.find((location) => location.zone === 'picking') ??
    locations[Math.min(1, locations.length - 1)] ??
    reserveLocation

  const truckSupportY = 0.48
  const truckRest: WorldPoint = {
    x: geometry.dockXs[1],
    y: truckSupportY + PALLET_HEIGHT / 2 + 0.015,
    z: geometry.frontZ + 2.15,
  }
  const truck: MissionStop = {
    id: 'truck',
    label: 'Caminhão',
    restingPoint: truckRest,
    access: {
      x: truckRest.x,
      y: 0.2,
      z: geometry.frontZ - 1.2,
    },
    facing: Math.PI,
    forkHeight: Math.max(
      0.03,
      truckRest.y - PALLET_HEIGHT / 2 - 0.04 - 0.18,
    ),
  }

  return [
    receiving,
    rackStop('reserve', 'Reserva', layout, reserveLocation),
    rackStop('picking', 'Picking', layout, pickingLocation),
    truck,
  ]
}

function buildMissionLegs(
  layout: WarehouseLayout,
  stops: MissionStop[],
): DemonstrationLeg[] {
  const ids: DemonstrationLeg['id'][] = [
    'putaway',
    'replenishment',
    'shipping',
  ]

  return stops.slice(0, -1).map((source, index) => {
    const destination = stops[index + 1]
    const points = safePath(layout, source.access, destination.access)
    const lengths = routeLengths(points)
    return {
      id: ids[index],
      source,
      destination,
      points,
      lengths,
      distance: routeDistance(lengths),
    }
  })
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

function WarehouseShell({
  layout,
  geometry,
  compact,
}: {
  layout: WarehouseLayout
  geometry: EnvironmentGeometry
  compact: boolean
}) {
  const { bounds, centerX, centerZ, width, depth, frontZ, dockXs } = geometry
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
      <mesh
        position={[centerX, wallHeight / 2, bounds.minZ]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[width, wallHeight, 0.32]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.86} />
      </mesh>
      <mesh
        position={[bounds.minX, wallHeight / 2, centerZ]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[0.32, wallHeight, depth]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.88} />
      </mesh>
      <mesh
        position={[bounds.maxX, wallHeight / 2, centerZ]}
        receiveShadow
        castShadow
      >
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

      {dockXs.map((x, index) => (
        <DockPortal key={`dock-${index}`} x={x} frontZ={frontZ} />
      ))}
      <Truck
        x={dockXs[1]}
        z={frontZ + 5.1}
        accent="#0284c7"
        compact={compact}
      />
      {!compact && (
        <Truck
          x={dockXs[0]}
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

function RealisticMissionCycle({
  layout,
  stops,
  legs,
  animated,
  compact,
}: {
  layout: WarehouseLayout
  stops: MissionStop[]
  legs: DemonstrationLeg[]
  animated: boolean
  compact: boolean
}) {
  const vehicleRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const palletRef = useRef<THREE.Group | null>(null)
  const legIndexRef = useRef(0)
  const phaseRef = useRef<
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
    | 'returning'
    | 'reset-wait'
  >('pickup-turn')
  const elapsedRef = useRef(0)
  const distanceRef = useRef(0)
  const speedRef = useRef(0)
  const carryingRef = useRef(false)
  const { invalidate } = useThree()
  const returnPoints = useMemo(
    () => safePath(layout, stops.at(-1)!.access, stops[0].access),
    [layout, stops],
  )
  const returnLengths = useMemo(() => routeLengths(returnPoints), [returnPoints])
  const returnDistance = useMemo(
    () => routeDistance(returnLengths),
    [returnLengths],
  )
  const mastHeight = Math.max(
    2.4,
    ...stops.map((stop) => stop.forkHeight + 1),
  )

  const placePallet = (stop: MissionStop) => {
    const pallet = palletRef.current
    if (!pallet) return
    pallet.position.set(
      stop.restingPoint.x,
      stop.restingPoint.y,
      stop.restingPoint.z,
    )
    pallet.rotation.y = stop.facing
  }

  const syncCarriedPallet = () => {
    const vehicle = vehicleRef.current
    const carriage = carriageRef.current
    const pallet = palletRef.current
    if (!vehicle || !carriage || !pallet || !carryingRef.current) return
    const offset = new THREE.Vector3(
      0,
      carriage.position.y + CARGO_LOCAL_Y,
      CARGO_LOCAL_Z,
    )
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.rotation.y)
    pallet.position.set(
      vehicle.position.x + offset.x,
      vehicle.position.y + offset.y,
      vehicle.position.z + offset.z,
    )
    pallet.rotation.y = vehicle.rotation.y
  }

  useEffect(() => {
    const vehicle = vehicleRef.current
    const carriage = carriageRef.current
    if (!vehicle || !carriage || stops.length < 4 || legs.length < 3) return
    vehicle.position.set(stops[0].access.x, 0.18, stops[0].access.z)
    vehicle.rotation.y = stops[0].facing
    carriage.position.y = TRAVEL_FORK_HEIGHT
    legIndexRef.current = 0
    phaseRef.current = 'pickup-turn'
    elapsedRef.current = 0
    distanceRef.current = 0
    speedRef.current = 0
    carryingRef.current = false
    placePallet(stops[0])
    invalidate()
  }, [invalidate, legs, stops])

  useFrame((_, delta) => {
    if (!animated || legs.length === 0) return
    const vehicle = vehicleRef.current
    const carriage = carriageRef.current
    if (!vehicle || !carriage) return

    const leg = legs[legIndexRef.current]
    const source = leg.source
    const destination = leg.destination
    const sourceAligned = alignedVehiclePoint(source)
    const destinationAligned = alignedVehiclePoint(destination)
    const phase = phaseRef.current

    if (phase === 'pickup-turn') {
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
      vehicle.position.set(
        THREE.MathUtils.lerp(source.access.x, sourceAligned.x, ratio),
        0.18,
        THREE.MathUtils.lerp(source.access.z, sourceAligned.z, ratio),
      )
      if (ratio === 1) {
        phaseRef.current = 'pickup-attach'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-attach') {
      elapsedRef.current += delta
      if (!carryingRef.current && elapsedRef.current >= 0.18) {
        carryingRef.current = true
        syncCarriedPallet()
      }
      if (elapsedRef.current >= HANDLING_PAUSE) {
        phaseRef.current = 'pickup-retreat'
        elapsedRef.current = 0
      }
    } else if (phase === 'pickup-retreat') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      vehicle.position.set(
        THREE.MathUtils.lerp(sourceAligned.x, source.access.x, ratio),
        0.18,
        THREE.MathUtils.lerp(sourceAligned.z, source.access.z, ratio),
      )
      syncCarriedPallet()
      if (ratio === 1) phaseRef.current = 'pickup-lower'
    } else if (phase === 'pickup-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED,
      )
      syncCarriedPallet()
      if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
        phaseRef.current = 'transporting'
        distanceRef.current = 0
        speedRef.current = 0
      }
    } else if (phase === 'transporting') {
      const remaining = Math.max(0, leg.distance - distanceRef.current)
      const targetSpeed = Math.min(
        LOADED_SPEED,
        Math.sqrt(Math.max(0, 2 * BRAKING * remaining)),
      )
      speedRef.current = approachSpeed(
        speedRef.current,
        targetSpeed,
        ACCELERATION,
        delta,
      )
      distanceRef.current += speedRef.current * delta
      const sample = sampleRoute(leg.points, leg.lengths, distanceRef.current)
      placeVehicle(vehicle, sample, 7, delta)
      syncCarriedPallet()
      if (sample.finished) {
        phaseRef.current = 'drop-turn'
        elapsedRef.current = 0
        speedRef.current = 0
      }
    } else if (phase === 'drop-turn') {
      elapsedRef.current += delta
      vehicle.rotation.y = angleTowards(
        vehicle.rotation.y,
        destination.facing,
        delta * 7,
      )
      syncCarriedPallet()
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
      syncCarriedPallet()
      if (carriage.position.y === destination.forkHeight) {
        phaseRef.current = 'drop-approach'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-approach') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      vehicle.position.set(
        THREE.MathUtils.lerp(destination.access.x, destinationAligned.x, ratio),
        0.18,
        THREE.MathUtils.lerp(destination.access.z, destinationAligned.z, ratio),
      )
      syncCarriedPallet()
      if (ratio === 1) {
        phaseRef.current = 'drop-detach'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-detach') {
      elapsedRef.current += delta
      if (carryingRef.current && elapsedRef.current >= 0.18) {
        carryingRef.current = false
        placePallet(destination)
      }
      if (elapsedRef.current >= HANDLING_PAUSE) {
        phaseRef.current = 'drop-retreat'
        elapsedRef.current = 0
      }
    } else if (phase === 'drop-retreat') {
      elapsedRef.current += delta
      const ratio = Math.min(1, elapsedRef.current / APPROACH_DURATION)
      vehicle.position.set(
        THREE.MathUtils.lerp(destinationAligned.x, destination.access.x, ratio),
        0.18,
        THREE.MathUtils.lerp(destinationAligned.z, destination.access.z, ratio),
      )
      if (ratio === 1) phaseRef.current = 'drop-lower'
    } else if (phase === 'drop-lower') {
      carriage.position.y = moveNumber(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        delta * LIFT_SPEED,
      )
      if (carriage.position.y === TRAVEL_FORK_HEIGHT) {
        phaseRef.current = 'pause'
        elapsedRef.current = 0
      }
    } else if (phase === 'pause') {
      elapsedRef.current += delta
      if (elapsedRef.current >= 0.85) {
        elapsedRef.current = 0
        if (legIndexRef.current < legs.length - 1) {
          legIndexRef.current += 1
          phaseRef.current = 'pickup-turn'
        } else {
          phaseRef.current = 'returning'
          distanceRef.current = 0
          speedRef.current = 0
        }
      }
    } else if (phase === 'returning') {
      const remaining = Math.max(0, returnDistance - distanceRef.current)
      const targetSpeed = Math.min(
        EMPTY_SPEED,
        Math.sqrt(Math.max(0, 2 * BRAKING * remaining)),
      )
      speedRef.current = approachSpeed(
        speedRef.current,
        targetSpeed,
        ACCELERATION,
        delta,
      )
      distanceRef.current += speedRef.current * delta
      const sample = sampleRoute(returnPoints, returnLengths, distanceRef.current)
      placeVehicle(vehicle, sample, 8, delta)
      if (sample.finished) {
        phaseRef.current = 'reset-wait'
        elapsedRef.current = 0
      }
    } else {
      elapsedRef.current += delta
      if (elapsedRef.current >= 1.5) {
        placePallet(stops[0])
        legIndexRef.current = 0
        phaseRef.current = 'pickup-turn'
        elapsedRef.current = 0
        distanceRef.current = 0
        speedRef.current = 0
      }
    }

    invalidate()
  })

  return (
    <group>
      <group ref={vehicleRef}>
        <ForkliftModel
          carriageRef={carriageRef}
          mastHeight={mastHeight}
          compact={compact}
        />
      </group>
      <group ref={palletRef}>
        <mesh castShadow>
          <boxGeometry args={[1.5, PALLET_HEIGHT, 0.9]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
        </mesh>
        <mesh position={[0, 0.47, 0]} castShadow>
          <boxGeometry args={[1.4, 0.82, 0.82]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.68} />
        </mesh>
      </group>
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
  const stops = useMemo(
    () => buildMissionStops(layout, locations, geometry),
    [geometry, layout, locations],
  )
  const legs = useMemo(
    () => buildMissionLegs(layout, stops),
    [layout, stops],
  )

  return (
    <group>
      <WarehouseShell layout={layout} geometry={geometry} compact={compact} />
      <RealisticMissionCycle
        layout={layout}
        stops={stops}
        legs={legs}
        animated={animated}
        compact={compact}
      />
    </group>
  )
}
