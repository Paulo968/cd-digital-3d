import { Billboard, Line, OrbitControls, Text } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
} from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import { getLocationWorldPoint, type RoutePlan } from '../domain/routePlanning'
import {
  findLocationRow,
  getLoadCenterY,
  getLocationSupportY,
  getPalletCenterY,
  PALLET_HEIGHT,
} from '../domain/warehouseGeometry'
import type { SlotStatus, WarehouseLocation } from '../domain/warehouse'
import type { RenderMode } from '../store/digitalTwinStore'
import { usePalletTransferSimulationStore } from '../store/palletTransferSimulationStore'
import { ForkliftModel } from './ForkliftModel'
import {
  PalletTransferVehicle,
  SimulatedDestinationLoad,
} from './PalletTransferVehicle'
import {
  EMPTY_TRANSFER_VISUAL,
  type PalletTransferVisualState,
} from './palletTransferVisual'
import {
  approachSpeed,
  placeVehicle,
  roundPathCorners,
  routeDistance,
  routeLengths,
  sampleRoute,
} from './vehicleMotion'

const RealisticEnvironment = lazy(() =>
  import('./RealisticEnvironment').then(({ RealisticEnvironment: World }) => ({
    default: World,
  })),
)

const STATUS_COLOR: Record<SlotStatus, string> = {
  occupied: '#38bdf8',
  empty: '#64748b',
  blocked: '#ef4444',
  divergent: '#f59e0b',
}
const PRODUCT_COLORS = [
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#c084fc',
]
const DEFAULT_CAMERA = new THREE.Vector3(34, 30, 42)
const DEFAULT_TARGET = new THREE.Vector3(0, 3, 0)
const INSTANCE_DUMMY = new THREE.Object3D()

interface SceneProfile {
  compact: boolean
  reducedMotion: boolean
}

function readSceneProfile(): SceneProfile {
  if (typeof window === 'undefined') {
    return { compact: false, reducedMotion: false }
  }

  return {
    compact: window.matchMedia('(max-width: 700px), (pointer: coarse)').matches,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

function useSceneProfile(): SceneProfile {
  const [profile, setProfile] = useState(readSceneProfile)

  useEffect(() => {
    const compactMedia = window.matchMedia('(max-width: 700px), (pointer: coarse)')
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setProfile(readSceneProfile())

    compactMedia.addEventListener('change', update)
    motionMedia.addEventListener('change', update)
    window.addEventListener('resize', update)

    return () => {
      compactMedia.removeEventListener('change', update)
      motionMedia.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return profile
}

function productColor(location: WarehouseLocation): THREE.Color {
  if (location.status === 'divergent') return new THREE.Color('#f59e0b')
  const value = location.sku ?? location.address
  const hash = [...value].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
  return new THREE.Color(PRODUCT_COLORS[hash % PRODUCT_COLORS.length])
}

function configureInstance(
  mesh: THREE.InstancedMesh | null,
  index: number,
  position: THREE.Vector3,
  rotationY: number,
  scale: [number, number, number],
  color?: THREE.Color,
): void {
  if (!mesh) return
  INSTANCE_DUMMY.position.copy(position)
  INSTANCE_DUMMY.rotation.set(0, rotationY, 0)
  INSTANCE_DUMMY.scale.set(...scale)
  INSTANCE_DUMMY.updateMatrix()
  mesh.setMatrixAt(index, INSTANCE_DUMMY.matrix)
  if (color) mesh.setColorAt(index, color)
}

function RackInstances({
  layout,
  mode,
}: {
  layout: WarehouseLayout
  mode: RenderMode
}) {
  const postRef = useRef<THREE.InstancedMesh | null>(null)
  const beamRef = useRef<THREE.InstancedMesh | null>(null)
  const rows = useMemo(
    () => layout.rackRows.filter((row) => row.active),
    [layout.rackRows],
  )
  const postCount = rows.reduce(
    (total, row) => total + (row.baysPerSide + 1) * 4,
    0,
  )
  const beamCount = rows.reduce(
    (total, row) => total + row.levels * 4,
    0,
  )
  const { invalidate } = useThree()

  useLayoutEffect(() => {
    if (!postRef.current || !beamRef.current) return
    let postIndex = 0
    let beamIndex = 0

    rows.forEach((row) => {
      const rackLength = row.baysPerSide * row.bayWidth
      for (const sideDirection of [-1, 1]) {
        const sideCenter =
          sideDirection * (row.aisleWidth / 2 + row.rackDepth / 2)

        for (let frame = 0; frame <= row.baysPerSide; frame += 1) {
          const localX = frame * row.bayWidth - rackLength / 2
          for (const depthDirection of [-1, 1]) {
            const localZ = sideCenter + depthDirection * row.rackDepth / 2
            const vector = new THREE.Vector3(localX, 0, localZ)
            vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), row.rotationY)
            vector.x += row.origin.x
            vector.z += row.origin.z
            vector.y = (row.levels * row.levelHeight) / 2 + 0.2
            configureInstance(postRef.current, postIndex, vector, row.rotationY, [
              0.12,
              row.levels * row.levelHeight + 0.4,
              0.12,
            ])
            postIndex += 1
          }
        }

        for (let level = 0; level < row.levels; level += 1) {
          const y = level * row.levelHeight + 0.18
          for (const depthDirection of [-1, 1]) {
            const localZ = sideCenter + depthDirection * row.rackDepth / 2
            const vector = new THREE.Vector3(0, y, localZ)
            vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), row.rotationY)
            vector.x += row.origin.x
            vector.z += row.origin.z
            configureInstance(beamRef.current, beamIndex, vector, row.rotationY, [
              rackLength,
              0.11,
              0.11,
            ])
            beamIndex += 1
          }
        }
      }
    })

    postRef.current.instanceMatrix.needsUpdate = true
    beamRef.current.instanceMatrix.needsUpdate = true
    invalidate()
  }, [invalidate, rows])

  return (
    <>
      <instancedMesh
        ref={postRef}
        args={[undefined, undefined, postCount]}
        castShadow={mode === 'realistic'}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.42} />
      </instancedMesh>
      <instancedMesh
        ref={beamRef}
        args={[undefined, undefined, beamCount]}
        castShadow={mode === 'realistic'}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.48} />
      </instancedMesh>
    </>
  )
}

function SlotInstances({
  layout,
  locations,
  selectedAddress,
  hiddenAddress,
  reducedMotion,
  onSelect,
}: {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  selectedAddress: string | null
  hiddenAddress?: string
  reducedMotion: boolean
  onSelect: (address: string) => void
}) {
  const slotRef = useRef<THREE.InstancedMesh | null>(null)
  const loadRef = useRef<THREE.InstancedMesh | null>(null)
  const palletRef = useRef<THREE.InstancedMesh | null>(null)
  const occupied = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.quantity > 0 &&
          location.status !== 'blocked' &&
          location.address !== hiddenAddress,
      ),
    [hiddenAddress, locations],
  )
  const { invalidate } = useThree()

  useLayoutEffect(() => {
    if (slotRef.current) {
      locations.forEach((location, index) => {
        const row = findLocationRow(layout, location)
        if (!row) return
        const point = getLocationWorldPoint(layout, location)
        const position = new THREE.Vector3(
          point.x,
          getLocationSupportY(layout, location) - 0.025,
          point.z,
        )
        configureInstance(
          slotRef.current,
          index,
          position,
          row.rotationY,
          [row.bayWidth * 0.84, 0.05, row.rackDepth * 0.82],
          new THREE.Color(STATUS_COLOR[location.status]),
        )
      })
      slotRef.current.instanceMatrix.needsUpdate = true
      if (slotRef.current.instanceColor) {
        slotRef.current.instanceColor.needsUpdate = true
      }
    }

    if (loadRef.current && palletRef.current) {
      occupied.forEach((location, index) => {
        const row = findLocationRow(layout, location)
        if (!row) return
        const point = getLocationWorldPoint(layout, location)
        const loadHeight = location.zone === 'picking' ? 0.58 : 0.92
        configureInstance(
          palletRef.current,
          index,
          new THREE.Vector3(
            point.x,
            getPalletCenterY(layout, location),
            point.z,
          ),
          row.rotationY,
          [row.bayWidth * 0.76, PALLET_HEIGHT, row.rackDepth * 0.76],
        )
        configureInstance(
          loadRef.current,
          index,
          new THREE.Vector3(
            point.x,
            getLoadCenterY(layout, location, loadHeight),
            point.z,
          ),
          row.rotationY,
          [row.bayWidth * 0.69, loadHeight, row.rackDepth * 0.69],
          productColor(location),
        )
      })
      loadRef.current.instanceMatrix.needsUpdate = true
      palletRef.current.instanceMatrix.needsUpdate = true
      if (loadRef.current.instanceColor) {
        loadRef.current.instanceColor.needsUpdate = true
      }
    }
    invalidate()
  }, [invalidate, layout, locations, occupied])

  const selected = locations.find(
    (location) => location.address === selectedAddress,
  )

  return (
    <>
      <instancedMesh
        ref={slotRef}
        args={[undefined, undefined, locations.length]}
        onClick={(event) => {
          event.stopPropagation()
          const index = event.instanceId
          if (index !== undefined) onSelect(locations[index].address)
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          transparent
          opacity={0.24}
          roughness={0.8}
        />
      </instancedMesh>
      <instancedMesh
        ref={palletRef}
        args={[undefined, undefined, occupied.length]}
        onClick={(event) => {
          event.stopPropagation()
          const index = event.instanceId
          if (index !== undefined) onSelect(occupied[index].address)
        }}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </instancedMesh>
      <instancedMesh
        ref={loadRef}
        args={[undefined, undefined, occupied.length]}
        onClick={(event) => {
          event.stopPropagation()
          const index = event.instanceId
          if (index !== undefined) onSelect(occupied[index].address)
        }}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.68} />
      </instancedMesh>
      {selected && (
        <SelectedBeacon
          layout={layout}
          location={selected}
          reducedMotion={reducedMotion}
        />
      )}
    </>
  )
}

function SelectedBeacon({
  layout,
  location,
  reducedMotion,
}: {
  layout: WarehouseLayout
  location: WarehouseLocation
  reducedMotion: boolean
}) {
  const ringRef = useRef<THREE.Mesh | null>(null)
  const { invalidate } = useThree()

  useFrame(({ clock }) => {
    if (!ringRef.current || reducedMotion) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 4.2) * 0.12
    ringRef.current.scale.setScalar(pulse)
    ringRef.current.rotation.z += 0.012
    invalidate()
  })

  const point = getLocationWorldPoint(layout, location)
  const supportY = getLocationSupportY(layout, location)

  return (
    <group position={[point.x, supportY, point.z]}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.9, 0.055, 10, 36]} />
        <meshBasicMaterial color={STATUS_COLOR[location.status]} />
      </mesh>
      {!reducedMotion && (
        <pointLight
          position={[0, 0.5, 0]}
          color={STATUS_COLOR[location.status]}
          intensity={2}
          distance={5}
        />
      )}
      <Billboard position={[0, 1.4, 0]}>
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[2.35, 0.62]} />
          <meshBasicMaterial color="#07111f" transparent opacity={0.95} />
        </mesh>
        <Text
          fontSize={0.31}
          color="#fff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.025}
          outlineColor="#000"
        >
          {location.address}
        </Text>
      </Billboard>
    </group>
  )
}

function AisleLabels({ layout }: { layout: WarehouseLayout }) {
  return (
    <>
      {layout.rackRows
        .filter((row) => row.active)
        .map((row) => {
          const rackLength = row.baysPerSide * row.bayWidth
          const local = new THREE.Vector3(-rackLength / 2 - 0.7, 2.8, 0)
          local.applyAxisAngle(new THREE.Vector3(0, 1, 0), row.rotationY)
          local.x += row.origin.x
          local.z += row.origin.z
          return (
            <Billboard key={row.id} position={local}>
              <mesh>
                <planeGeometry args={[2.1, 0.8]} />
                <meshStandardMaterial color="#075985" />
              </mesh>
              <Text
                position={[0, 0, 0.02]}
                fontSize={0.38}
                color="#fff"
                anchorX="center"
                anchorY="middle"
              >
                RUA {row.aisle}
              </Text>
            </Billboard>
          )
        })}
    </>
  )
}

function FloorAndZones({
  layout,
  mode,
}: {
  layout: WarehouseLayout
  mode: RenderMode
}) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[layout.floor.width, layout.floor.depth]} />
        <meshStandardMaterial
          color={mode === 'operational' ? '#e5e7eb' : '#222b34'}
          roughness={0.96}
        />
      </mesh>
      <gridHelper
        args={[
          Math.max(layout.floor.width, layout.floor.depth),
          Math.round(Math.max(layout.floor.width, layout.floor.depth) * 1.5),
          mode === 'operational' ? '#b8c1cc' : '#334155',
          mode === 'operational' ? '#d3d9df' : '#263442',
        ]}
        position={[0, 0.012, 0]}
      />
      {layout.zones.map((zone) => (
        <group key={zone.id} position={[zone.origin.x, 0.03, zone.origin.z]}>
          <mesh>
            <boxGeometry args={[zone.width, 0.035, zone.depth]} />
            <meshStandardMaterial
              color={
                zone.type === 'receiving'
                  ? '#22c55e'
                  : zone.type === 'shipping'
                    ? '#38bdf8'
                    : '#f59e0b'
              }
              transparent
              opacity={0.25}
            />
          </mesh>
          <Text
            position={[0, 0.05, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.38}
            color={mode === 'operational' ? '#0f172a' : '#fff'}
            anchorX="center"
            anchorY="middle"
          >
            {zone.name.toUpperCase()}
          </Text>
        </group>
      ))}
    </>
  )
}

function RouteForklift({
  plan,
  runToken,
  compact,
}: {
  plan: RoutePlan | null
  runToken: number
  compact: boolean
}) {
  const groupRef = useRef<THREE.Group | null>(null)
  const progressRef = useRef(0)
  const speedRef = useRef(0)
  const runningRef = useRef(false)
  const { invalidate } = useThree()
  const points = useMemo(
    () => roundPathCorners(plan?.points ?? [], 0.9, 6),
    [plan],
  )
  const lengths = useMemo(() => routeLengths(points), [points])
  const total = useMemo(() => routeDistance(lengths), [lengths])

  useEffect(() => {
    progressRef.current = 0
    speedRef.current = 0
    runningRef.current = Boolean(plan && points.length > 1)
    if (groupRef.current && points[0]) {
      groupRef.current.position.set(points[0].x, 0.18, points[0].z)
    }
    invalidate()
  }, [invalidate, plan, points, runToken])

  useFrame((_, delta) => {
    if (!runningRef.current || !groupRef.current || !plan) return
    const remaining = Math.max(0, total - progressRef.current)
    const targetSpeed = Math.min(4.2, Math.sqrt(Math.max(0, 2 * 5 * remaining)))
    speedRef.current = approachSpeed(speedRef.current, targetSpeed, 4, delta)
    progressRef.current += delta * speedRef.current
    const sample = sampleRoute(points, lengths, progressRef.current)
    placeVehicle(groupRef.current, sample, 8, delta)
    if (sample.finished) runningRef.current = false
    invalidate()
  })

  if (!plan || points.length === 0) return null

  return (
    <group ref={groupRef}>
      <ForkliftModel compact={compact} />
    </group>
  )
}

function CameraRig({
  layout,
  selected,
  resetToken,
}: {
  layout: WarehouseLayout
  selected?: WarehouseLocation
  resetToken: number
}) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null)
  const { camera, invalidate } = useThree()
  const desiredCamera = useRef(DEFAULT_CAMERA.clone())
  const desiredTarget = useRef(DEFAULT_TARGET.clone())
  const animating = useRef(true)
  const previousReset = useRef(resetToken)

  useEffect(() => {
    if (selected) {
      const point = getLocationWorldPoint(layout, selected)
      const targetY = getLoadCenterY(
        layout,
        selected,
        selected.zone === 'picking' ? 0.58 : 0.92,
      )
      desiredTarget.current.set(point.x, targetY, point.z)
      desiredCamera.current.set(
        point.x + 5,
        Math.max(targetY + 3.2, 4.2),
        point.z + 5,
      )
      animating.current = true
    } else if (previousReset.current !== resetToken) {
      desiredCamera.current.copy(DEFAULT_CAMERA)
      desiredTarget.current.copy(DEFAULT_TARGET)
      animating.current = true
    }
    previousReset.current = resetToken
    invalidate()
  }, [invalidate, layout, resetToken, selected])

  useFrame(() => {
    if (!animating.current || !controlsRef.current) return
    camera.position.lerp(desiredCamera.current, 0.1)
    controlsRef.current.target.lerp(desiredTarget.current, 0.12)
    controlsRef.current.update()
    if (
      camera.position.distanceTo(desiredCamera.current) < 0.04 &&
      controlsRef.current.target.distanceTo(desiredTarget.current) < 0.04
    ) {
      animating.current = false
    } else {
      invalidate()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      enablePan
      screenSpacePanning
      dampingFactor={0.08}
      minDistance={2}
      maxDistance={180}
      maxPolarAngle={Math.PI / 2.01}
      onStart={() => {
        animating.current = false
      }}
    />
  )
}

export function WarehouseScene({
  layout,
  locations,
  selectedAddress,
  visibleStatuses,
  mode,
  routePlan,
  routeRunToken,
  cameraResetToken,
  onSelect,
}: {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  selectedAddress: string | null
  visibleStatuses: Record<SlotStatus, boolean>
  mode: RenderMode
  routePlan: RoutePlan | null
  routeRunToken: number
  cameraResetToken: number
  onSelect: (address: string | null) => void
}) {
  const profile = useSceneProfile()
  const transfer = usePalletTransferSimulationStore((state) => state.simulation)
  const transferRunToken = usePalletTransferSimulationStore((state) => state.runToken)
  const completeTransfer = usePalletTransferSimulationStore((state) => state.complete)
  const [transferVisual, setTransferVisual] =
    useState<PalletTransferVisualState>(EMPTY_TRANSFER_VISUAL)
  const visibleLocations = useMemo(
    () => locations.filter((location) => visibleStatuses[location.status]),
    [locations, visibleStatuses],
  )
  const selected = locations.find(
    (location) => location.address === selectedAddress,
  )
  const source = transfer
    ? locations.find((location) => location.address === transfer.sourceAddress)
    : undefined
  const destination = transfer
    ? locations.find((location) => location.address === transfer.destinationAddress)
    : undefined
  const routeLinePoints =
    !transfer && routePlan
      ? routePlan.points.map(
          (point) => [point.x, 0.09, point.z] as [number, number, number],
        )
      : []
  const emptyTransferLine =
    transfer?.emptyPoints.map(
      (point) => [point.x, 0.1, point.z] as [number, number, number],
    ) ?? []
  const loadedTransferLine =
    transfer?.loadedPoints.map(
      (point) => [point.x, 0.11, point.z] as [number, number, number],
    ) ?? []
  const realisticShadows = mode === 'realistic' && !profile.compact
  useEffect(() => {
    if (!transfer) setTransferVisual(EMPTY_TRANSFER_VISUAL)
  }, [transfer])

  return (
    <Canvas
      frameloop="demand"
      shadows={realisticShadows}
      dpr={[1, profile.compact ? 1.05 : 1.2]}
      camera={{
        position: [DEFAULT_CAMERA.x, DEFAULT_CAMERA.y, DEFAULT_CAMERA.z],
        fov: 46,
        near: 0.1,
        far: 320,
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <color
        attach="background"
        args={[mode === 'operational' ? '#f4f7fa' : '#111820']}
      />
      <fog
        attach="fog"
        args={[mode === 'operational' ? '#f4f7fa' : '#111820', 70, 210]}
      />
      <ambientLight intensity={mode === 'operational' ? 1.4 : 0.62} />
      <hemisphereLight
        args={[
          mode === 'operational' ? '#ffffff' : '#eef6ff',
          mode === 'operational' ? '#cbd5e1' : '#1f2937',
          mode === 'operational' ? 1.1 : 0.9,
        ]}
      />
      <directionalLight
        position={[24, 32, 18]}
        intensity={mode === 'operational' ? 1.4 : 2.05}
        castShadow={realisticShadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {mode === 'realistic' && (
        <Suspense fallback={null}>
          <RealisticEnvironment
            layout={layout}
            compact={profile.compact}
          />
        </Suspense>
      )}
      {mode === 'operational' && (
        <>
          <FloorAndZones layout={layout} mode={mode} />
          <RackInstances layout={layout} mode={mode} />
          <SlotInstances
            layout={layout}
            locations={visibleLocations}
            selectedAddress={selectedAddress}
            hiddenAddress={
              transferVisual.hiddenSource ? transfer?.sourceAddress : undefined
            }
            reducedMotion={profile.reducedMotion}
            onSelect={(address) => onSelect(address)}
          />
          <AisleLabels layout={layout} />

          {routeLinePoints.length > 1 && (
            <Line
              points={routeLinePoints}
              color="#2563eb"
              lineWidth={3}
              dashed
              dashSize={0.55}
              gapSize={0.28}
            />
          )}
          {emptyTransferLine.length > 1 && (
            <Line
              points={emptyTransferLine}
              color="#64748b"
              lineWidth={2}
              dashed
              dashSize={0.35}
              gapSize={0.24}
            />
          )}
          {loadedTransferLine.length > 1 && (
            <Line points={loadedTransferLine} color="#0284c7" lineWidth={3.5} />
          )}

          {!transfer && (
            <RouteForklift
              plan={routePlan}
              runToken={routeRunToken}
              compact={profile.compact}
            />
          )}
          {transfer && (
            <PalletTransferVehicle
              simulation={transfer}
              runToken={transferRunToken}
              source={source}
              destination={destination}
              onVisual={setTransferVisual}
              onComplete={completeTransfer}
            />
          )}
          {transfer &&
            destination &&
            transferVisual.cargoAtDestination && (
              <SimulatedDestinationLoad
                layout={layout}
                location={destination}
                sku={transfer.sku}
              />
            )}
        </>
      )}
      <CameraRig
        layout={layout}
        selected={selected}
        resetToken={cameraResetToken}
      />
    </Canvas>
  )
}
