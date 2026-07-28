import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { WarehouseLayout, WarehouseZone } from '../domain/layout'
import { getLocationAccessPoint, type WorldPoint } from '../domain/routePlanning'
import type { WarehouseLocation } from '../domain/warehouse'

interface LayoutBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

interface DemonstrationLeg {
  id: 'receiving' | 'replenishment' | 'shipping' | 'return'
  points: WorldPoint[]
  carriesLoad: boolean
}

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

const FORKLIFT_SPEED = 3.1
const EMPTY_SPEED = 3.8
const HANDLING_TIME = 1.1

function rotateCorner(x: number, z: number, angle: number): { x: number; z: number } {
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
        const rotated = rotateCorner(localX, localZ, row.rotationY)
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

function pointDistance(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function polylineDistance(points: WorldPoint[]): number {
  return points.slice(1).reduce((total, point, index) => {
    return total + pointDistance(points[index], point)
  }, 0)
}

function routeBetween(
  layout: WarehouseLayout,
  from: WorldPoint,
  to: WorldPoint,
): WorldPoint[] {
  if (Math.abs(from.z - to.z) < 0.15) return [from, to]

  const maxHalfLength = Math.max(
    ...layout.rackRows
      .filter((row) => row.active)
      .map((row) => (row.baysPerSide * row.bayWidth) / 2),
    6,
  )
  const leftX = -maxHalfLength - 2.2
  const rightX = maxHalfLength + 2.2
  const candidates = [leftX, rightX].map((crossX) => [
    from,
    { x: crossX, y: 0.2, z: from.z },
    { x: crossX, y: 0.2, z: to.z },
    to,
  ])

  return candidates.sort(
    (left, right) => polylineDistance(left) - polylineDistance(right),
  )[0]
}

function routeLengths(points: WorldPoint[]): number[] {
  return points.slice(1).map((point, index) => pointDistance(points[index], point))
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

  const total = lengths.reduce((sum, value) => sum + value, 0)
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

function zonePoint(zone: WarehouseZone | undefined, fallback: WorldPoint): WorldPoint {
  return zone
    ? { x: zone.origin.x, y: 0.2, z: zone.origin.z }
    : fallback
}

function chooseLocation(
  locations: WarehouseLocation[],
  predicate: (location: WarehouseLocation) => boolean,
  fallback: WorldPoint,
  layout: WarehouseLayout,
): WorldPoint {
  const match = locations.find(predicate)
  return match ? getLocationAccessPoint(layout, match) : fallback
}

function buildDemonstrationLegs(
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
): DemonstrationLeg[] {
  const rows = layout.rackRows.filter((row) => row.active)
  const middleRow = rows[Math.floor(rows.length / 2)] ?? rows[0]
  const nextRow = rows[Math.min(rows.length - 1, Math.floor(rows.length / 2) + 1)] ?? middleRow
  const receivingFallback: WorldPoint = { x: -12, y: 0.2, z: 12 }
  const shippingFallback: WorldPoint = { x: 12, y: 0.2, z: 12 }
  const reserveFallback: WorldPoint = {
    x: 0,
    y: 0.2,
    z: middleRow?.origin.z ?? 0,
  }
  const pickingFallback: WorldPoint = {
    x: 4,
    y: 0.2,
    z: nextRow?.origin.z ?? 4,
  }
  const receiving = zonePoint(
    layout.zones.find((zone) => zone.type === 'receiving'),
    receivingFallback,
  )
  const shipping = zonePoint(
    layout.zones.find((zone) => zone.type === 'shipping'),
    shippingFallback,
  )
  const reserve = chooseLocation(
    locations,
    (location) =>
      location.zone === 'reserve' &&
      (!middleRow || location.aisle === middleRow.aisle) &&
      location.level === Math.min(2, middleRow?.levels ?? 2),
    reserveFallback,
    layout,
  )
  const picking = chooseLocation(
    locations,
    (location) =>
      location.zone === 'picking' &&
      (!nextRow || location.aisle === nextRow.aisle),
    pickingFallback,
    layout,
  )

  return [
    {
      id: 'receiving',
      points: routeBetween(layout, receiving, reserve),
      carriesLoad: true,
    },
    {
      id: 'replenishment',
      points: routeBetween(layout, reserve, picking),
      carriesLoad: true,
    },
    {
      id: 'shipping',
      points: routeBetween(layout, picking, shipping),
      carriesLoad: true,
    },
    {
      id: 'return',
      points: routeBetween(layout, shipping, receiving),
      carriesLoad: false,
    },
  ]
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
      <mesh position={[0, 1.14, 0.14]}>
        <planeGeometry args={[5.65, 2.2]} />
        <meshStandardMaterial color="#172033" metalness={0.18} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.08, -1.05]} receiveShadow>
        <boxGeometry args={[6.2, 0.15, 2.2]} />
        <meshStandardMaterial color="#334155" roughness={0.92} />
      </mesh>
      <mesh position={[-2.65, 0.6, -0.5]}>
        <boxGeometry args={[0.22, 1.2, 0.35]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[2.65, 0.6, -0.5]}>
        <boxGeometry args={[0.22, 1.2, 0.35]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
    </group>
  )
}

function Truck({ x, z, accent }: { x: number; z: number; accent: string }) {
  return (
    <group position={[x, 0.15, z]}>
      <mesh position={[0, 1.45, -1.65]} castShadow>
        <boxGeometry args={[2.75, 2.75, 6.7]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.12} roughness={0.64} />
      </mesh>
      <mesh position={[0, 1.18, 2.6]} castShadow>
        <boxGeometry args={[2.6, 2.35, 2.25]} />
        <meshStandardMaterial color={accent} metalness={0.2} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.55, 3.75]} castShadow>
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
            <cylinderGeometry args={[0.42, 0.42, 0.24, 16]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
        )),
      )}
      <mesh position={[-0.75, 1.05, 3.82]}>
        <boxGeometry args={[0.36, 0.18, 0.08]} />
        <meshStandardMaterial color="#fef08a" emissive="#facc15" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0.75, 1.05, 3.82]}>
        <boxGeometry args={[0.36, 0.18, 0.08]} />
        <meshStandardMaterial color="#fef08a" emissive="#facc15" emissiveIntensity={1.2} />
      </mesh>
    </group>
  )
}

function WarehouseShell({
  layout,
  compact,
}: {
  layout: WarehouseLayout
  compact: boolean
}) {
  const bounds = useMemo(() => getLayoutBounds(layout), [layout])
  const padding = 3.5
  const minX = bounds.minX - padding
  const maxX = bounds.maxX + padding
  const minZ = bounds.minZ - padding
  const maxZ = bounds.maxZ + padding
  const width = maxX - minX
  const depth = maxZ - minZ
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const maximumRackHeight = Math.max(
    ...layout.rackRows
      .filter((row) => row.active)
      .map((row) => row.levels * row.levelHeight),
    7,
  )
  const wallHeight = maximumRackHeight + 3.2
  const frontZ = maxZ
  const receiving = layout.zones.find((zone) => zone.type === 'receiving')
  const shipping = layout.zones.find((zone) => zone.type === 'shipping')
  const dockXs = [receiving?.origin.x ?? centerX - width * 0.22, shipping?.origin.x ?? centerX + width * 0.22]
  const beamCount = compact ? 4 : 8
  const lightCount = compact ? 3 : 7

  return (
    <group>
      <mesh position={[centerX, -0.1, centerZ]} receiveShadow>
        <boxGeometry args={[width, 0.2, depth]} />
        <meshStandardMaterial color="#1f2937" roughness={0.96} />
      </mesh>
      <mesh position={[centerX, wallHeight / 2, minZ]} receiveShadow castShadow>
        <boxGeometry args={[width, wallHeight, 0.32]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.86} />
      </mesh>
      <mesh position={[minX, wallHeight / 2, centerZ]} receiveShadow castShadow>
        <boxGeometry args={[0.32, wallHeight, depth]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.88} />
      </mesh>
      <mesh position={[maxX, wallHeight / 2, centerZ]} receiveShadow castShadow>
        <boxGeometry args={[0.32, wallHeight, depth]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.88} />
      </mesh>

      {Array.from({ length: beamCount }, (_, index) => {
        const ratio = beamCount === 1 ? 0.5 : index / (beamCount - 1)
        const z = THREE.MathUtils.lerp(minZ + 1.5, maxZ - 1.5, ratio)
        return (
          <mesh key={`roof-beam-${index}`} position={[centerX, wallHeight - 0.55, z]}>
            <boxGeometry args={[width - 0.8, 0.18, 0.18]} />
            <meshStandardMaterial color="#475569" metalness={0.55} roughness={0.42} />
          </mesh>
        )
      })}

      {Array.from({ length: lightCount }, (_, index) => {
        const ratio = lightCount === 1 ? 0.5 : index / (lightCount - 1)
        const z = THREE.MathUtils.lerp(minZ + 4, maxZ - 5, ratio)
        return (
          <group key={`light-${index}`} position={[centerX, wallHeight - 0.85, z]}>
            <mesh>
              <boxGeometry args={[Math.min(8, width * 0.22), 0.12, 0.42]} />
              <meshStandardMaterial
                color="#f8fafc"
                emissive="#dbeafe"
                emissiveIntensity={compact ? 0.6 : 1.1}
              />
            </mesh>
          </group>
        )
      })}

      {dockXs.map((x, index) => (
        <DockPortal key={`dock-${index}`} x={x} frontZ={frontZ} />
      ))}

      <Truck x={dockXs[0]} z={frontZ + 5.1} accent="#16a34a" />
      {!compact && <Truck x={dockXs[1]} z={frontZ + 5.1} accent="#0284c7" />}

      <mesh position={[centerX, 0.018, frontZ + 5.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 11]} />
        <meshStandardMaterial color="#374151" roughness={0.98} />
      </mesh>
      {dockXs.map((x, index) => (
        <mesh
          key={`yard-line-${index}`}
          position={[x, 0.03, frontZ + 5.1]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[6.4, 0.16]} />
          <meshBasicMaterial color="#f8fafc" />
        </mesh>
      ))}
    </group>
  )
}

function AmbientForklift({ legs, animated }: { legs: DemonstrationLeg[]; animated: boolean }) {
  const vehicleRef = useRef<THREE.Group | null>(null)
  const cargoRef = useRef<THREE.Group | null>(null)
  const legIndexRef = useRef(0)
  const phaseRef = useRef<'handling-start' | 'travelling' | 'handling-end'>('handling-start')
  const elapsedRef = useRef(0)
  const distanceRef = useRef(0)
  const { invalidate } = useThree()
  const lengthsByLeg = useMemo(() => legs.map((leg) => routeLengths(leg.points)), [legs])

  useEffect(() => {
    const vehicle = vehicleRef.current
    const cargo = cargoRef.current
    const first = legs[0]?.points[0]
    if (!vehicle || !cargo || !first) return

    vehicle.position.set(first.x, 0.18, first.z)
    cargo.visible = false
    legIndexRef.current = 0
    phaseRef.current = 'handling-start'
    elapsedRef.current = 0
    distanceRef.current = 0
    invalidate()
  }, [invalidate, legs])

  useFrame((_, delta) => {
    if (!animated || legs.length === 0) return
    const vehicle = vehicleRef.current
    const cargo = cargoRef.current
    if (!vehicle || !cargo) return

    const legIndex = legIndexRef.current
    const leg = legs[legIndex]
    const lengths = lengthsByLeg[legIndex]
    const phase = phaseRef.current

    if (phase === 'handling-start') {
      elapsedRef.current += delta
      if (leg.carriesLoad && elapsedRef.current >= 0.35) cargo.visible = true
      if (elapsedRef.current >= (leg.carriesLoad ? HANDLING_TIME : 0.35)) {
        phaseRef.current = 'travelling'
        elapsedRef.current = 0
        distanceRef.current = 0
      }
    } else if (phase === 'travelling') {
      distanceRef.current += delta * (leg.carriesLoad ? FORKLIFT_SPEED : EMPTY_SPEED)
      const finished = placeOnRoute(vehicle, leg.points, lengths, distanceRef.current)
      if (finished) {
        phaseRef.current = 'handling-end'
        elapsedRef.current = 0
      }
    } else {
      elapsedRef.current += delta
      if (leg.carriesLoad && elapsedRef.current >= 0.35) cargo.visible = false
      if (elapsedRef.current >= (leg.carriesLoad ? HANDLING_TIME : 0.35)) {
        legIndexRef.current = (legIndex + 1) % legs.length
        phaseRef.current = 'handling-start'
        elapsedRef.current = 0
        distanceRef.current = 0
      }
    }

    invalidate()
  })

  return (
    <group ref={vehicleRef}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.05, 0.62, 1.5]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.92, 0.14]} castShadow>
        <boxGeometry args={[0.78, 0.7, 0.82]} />
        <meshStandardMaterial color="#1f2937" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.92, -0.78]}>
        <boxGeometry args={[0.12, 1.75, 0.12]} />
        <meshStandardMaterial color="#334155" metalness={0.58} roughness={0.4} />
      </mesh>
      <mesh position={[-0.25, 0.2, -1.18]}>
        <boxGeometry args={[0.1, 0.07, 1.1]} />
        <meshStandardMaterial color="#475569" metalness={0.62} roughness={0.38} />
      </mesh>
      <mesh position={[0.25, 0.2, -1.18]}>
        <boxGeometry args={[0.1, 0.07, 1.1]} />
        <meshStandardMaterial color="#475569" metalness={0.62} roughness={0.38} />
      </mesh>
      <group ref={cargoRef} position={[0, 0.37, -1.2]}>
        <mesh castShadow>
          <boxGeometry args={[0.92, 0.12, 0.82]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.86, 0.72, 0.76]} />
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
  const legs = useMemo(
    () => buildDemonstrationLegs(layout, locations),
    [layout, locations],
  )

  return (
    <group>
      <WarehouseShell layout={layout} compact={compact} />
      <AmbientForklift legs={legs} animated={animated} />
    </group>
  )
}
