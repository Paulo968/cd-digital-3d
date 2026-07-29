import { useMemo } from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import { buildRealisticFleetPlan } from '../domain/realisticFleet'
import type {
  RealisticDockGeometry,
  RealisticMissionStop,
} from '../domain/realisticMissionQueue'
import {
  PALLET_HEIGHT,
  PALLET_SUPPORT_CLEARANCE,
} from '../domain/warehouseGeometry'
import type { WarehouseLocation } from '../domain/warehouse'
import { FleetOperation } from './FleetOperation'
import { SafetyScenarioActors } from './SafetyScenarioActors'

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
        <>
          <FleetOperation
            layout={layout}
            locations={locations}
            plan={plan}
            compact={compact}
          />
          <SafetyScenarioActors
            centerX={geometry.centerX}
            receivingX={geometry.receivingX}
            shippingX={geometry.shippingX}
            frontZ={geometry.frontZ}
            compact={compact}
          />
        </>
      )}
    </group>
  )
}
