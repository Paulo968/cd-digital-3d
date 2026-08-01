import { Text, Trail } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import type {
  KernelEvent,
  KernelTelemetry,
} from '../realistic/core/livingWorldKernel'
import {
  createLayoutReceivingRuntime,
  createLayoutReceivingScenario,
  type LayoutReceivingScenario,
} from '../realistic/layoutReceivingScenario'
import {
  stagingPoint,
  truckPalletPoint,
  type ReceivingPallet,
  type ReceivingScenarioConfig,
  type ReceivingSimulationState,
} from '../realistic-v2/receivingSimulation'
import { ForkliftModel } from './ForkliftModel'
import {
  RealisticOperationsHud,
  type RealisticCameraMode,
} from './RealisticOperationsHud'

const DEFAULT_TIME_SCALE = 2
const HUD_REFRESH_SECONDS = 0.18

type ReceivingRuntime = ReturnType<typeof createLayoutReceivingRuntime>

type CameraControls = {
  target?: THREE.Vector3
  update?: () => void
}

function createExperienceRuntime(
  scenario: LayoutReceivingScenario,
  timeScale = DEFAULT_TIME_SCALE,
): ReceivingRuntime {
  const runtime = createLayoutReceivingRuntime(scenario)
  runtime.setTimeScale(timeScale)
  return runtime
}

function Pallet({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.16, 0.96]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.38, 0.86, 0.86]} />
        <meshStandardMaterial color={color} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[1.05, 0.05, 0.62]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.72} />
      </mesh>
    </group>
  )
}

function Truck({
  groupRef,
  state,
  config,
}: {
  groupRef: MutableRefObject<THREE.Group | null>
  state: ReceivingSimulationState
  config: ReceivingScenarioConfig
}) {
  return (
    <group ref={groupRef} position={[0, 0, state.truck.z]}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.5, 0.24, 13]} />
        <meshStandardMaterial color="#64748b" roughness={0.72} />
      </mesh>
      {[-2.22, 2.22].map((x) => (
        <mesh key={x} position={[x, 1.82, 0]} castShadow>
          <boxGeometry args={[0.16, 3.42, 13]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.62} />
        </mesh>
      ))}
      <mesh position={[0, 3.55, 0]} castShadow>
        <boxGeometry args={[4.5, 0.16, 13]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.58} />
      </mesh>
      <mesh position={[0, 1.2, 8.1]} castShadow>
        <boxGeometry args={[3.35, 2.4, 3]} />
        <meshStandardMaterial
          color="#16a34a"
          metalness={0.18}
          roughness={0.44}
        />
      </mesh>
      <mesh position={[0, 1.68, 9.59]}>
        <boxGeometry args={[2.75, 0.92, 0.08]} />
        <meshStandardMaterial
          color="#07111f"
          metalness={0.52}
          roughness={0.18}
        />
      </mesh>
      {[-1.68, 1.68].flatMap((x) =>
        [-4.5, 3.3, 7.65].map((z) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, 0.48, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.48, 0.48, 0.34, 18]} />
            <meshStandardMaterial color="#0f172a" roughness={0.92} />
          </mesh>
        )),
      )}
      {[-1.35, 1.35].map((x) => (
        <mesh key={x} position={[x, 1.05, 9.63]}>
          <boxGeometry args={[0.28, 0.18, 0.06]} />
          <meshBasicMaterial color="#fef3c7" />
        </mesh>
      ))}
      {state.pallets
        .filter((pallet) => pallet.phase === 'truck')
        .map((pallet) => {
          const point = truckPalletPoint(pallet.index, config)
          return (
            <group
              key={pallet.id}
              position={[point.x, 0.32, point.z - config.truckDockZ]}
            >
              <Pallet color={pallet.color} />
            </group>
          )
        })}
    </group>
  )
}

function StagedPallets({
  pallets,
  config,
}: {
  pallets: ReceivingPallet[]
  config: ReceivingScenarioConfig
}) {
  return (
    <>
      {pallets
        .filter((pallet) => pallet.phase === 'staged')
        .map((pallet) => {
          const point = stagingPoint(pallet.stagedSlot ?? 0, config)
          return (
            <group key={pallet.id} position={[point.x, 0.17, point.z]}>
              <Pallet color={pallet.color} />
            </group>
          )
        })}
    </>
  )
}

function StagingSlots({ scenario }: { scenario: LayoutReceivingScenario }) {
  return (
    <group>
      {scenario.stagingPoints.map((slot, index) => (
        <group key={index} position={[slot.x, 0.025, slot.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.35, 2.65]} />
            <meshBasicMaterial
              color="#22c55e"
              transparent
              opacity={0.12}
              side={THREE.DoubleSide}
            />
          </mesh>
          <Text
            position={[0, 0.045, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.22}
            color="#bbf7d0"
          >
            IN-{String(index + 1).padStart(2, '0')}
          </Text>
        </group>
      ))}
      <Text
        position={[-2, 0.06, scenario.config.stagingZ - 2.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.34}
        color="#86efac"
      >
        STAGING RECEBIMENTO
      </Text>
    </group>
  )
}

function DockSignals({
  active,
  dockWallZ,
}: {
  active: boolean
  dockWallZ: number
}) {
  const leftRef = useRef<THREE.Mesh | null>(null)
  const rightRef = useRef<THREE.Mesh | null>(null)

  useFrame(({ clock }) => {
    const pulse = 0.45 + Math.sin(clock.elapsedTime * 6) * 0.3
    for (const mesh of [leftRef.current, rightRef.current]) {
      if (!mesh) continue
      const material = mesh.material as THREE.MeshBasicMaterial
      material.opacity = active ? pulse : 0.18
    }
  })

  return (
    <group position={[0, 3.5, dockWallZ - 0.32]}>
      {[-5.2, 5.2].map((x, index) => (
        <mesh
          key={x}
          ref={index === 0 ? leftRef : rightRef}
          position={[x, 0, 0]}
        >
          <sphereGeometry args={[0.22, 18, 18]} />
          <meshBasicMaterial
            color={active ? '#22c55e' : '#f59e0b'}
            transparent
            opacity={0.4}
          />
        </mesh>
      ))}
    </group>
  )
}

function ForkliftBeacon({
  faulted,
  moving,
}: {
  faulted: boolean
  moving: boolean
}) {
  const ringRef = useRef<THREE.Mesh | null>(null)

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    ringRef.current.rotation.z = clock.elapsedTime * (moving ? 1.8 : 0.5)
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.08
    ringRef.current.scale.setScalar(pulse)
  })

  const color = faulted ? '#ef4444' : moving ? '#22d3ee' : '#f59e0b'
  return (
    <group>
      <mesh
        ref={ringRef}
        position={[0, 0.035, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.28, 1.42, 42]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight
        position={[0, 2.5, 0]}
        color={color}
        intensity={moving ? 1.2 : 0.45}
        distance={7}
      />
    </group>
  )
}

function DockDoor({
  x,
  z,
  label,
  color,
}: {
  x: number
  z: number
  label: string
  color: string
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.25, 0]} castShadow>
        <boxGeometry args={[6.6, 6.5, 0.35]} />
        <meshStandardMaterial color="#111827" roughness={0.74} />
      </mesh>
      <mesh position={[0, 3.2, -0.2]}>
        <boxGeometry args={[5.5, 5.2, 0.18]} />
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.28, 0.65]} castShadow>
        <boxGeometry args={[5.8, 0.42, 2.4]} />
        <meshStandardMaterial color="#1f2937" metalness={0.45} />
      </mesh>
      {[-3.25, 3.25].map((guideX) => (
        <mesh key={guideX} position={[guideX, 0.25, 3.4]}>
          <boxGeometry args={[0.22, 0.24, 7]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
      ))}
      <Text position={[0, 7.2, -0.15]} fontSize={0.52} color={color}>
        {label}
      </Text>
    </group>
  )
}

function SharedWarehouseInfrastructure({
  layout,
  scenario,
}: {
  layout: WarehouseLayout
  scenario: LayoutReceivingScenario
}) {
  const halfWidth = layout.floor.width / 2
  const halfDepth = layout.floor.depth / 2
  const wallHeight = 10.5
  const yardDepth = 24
  const receivingX = scenario.receivingZone.origin.x
  const shippingX = scenario.shippingZone.origin.x

  return (
    <group>
      <mesh position={[0, -0.09, halfDepth + yardDepth / 2]} receiveShadow>
        <boxGeometry args={[layout.floor.width + 24, 0.16, yardDepth]} />
        <meshStandardMaterial color="#171f29" roughness={0.94} />
      </mesh>

      <mesh position={[0, wallHeight / 2, -halfDepth]} castShadow>
        <boxGeometry args={[layout.floor.width, wallHeight, 0.36]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      {[-halfWidth, halfWidth].map((x) => (
        <mesh key={x} position={[x, wallHeight / 2, 0]} castShadow>
          <boxGeometry args={[0.36, wallHeight, layout.floor.depth]} />
          <meshStandardMaterial color="#b8c4d1" roughness={0.84} />
        </mesh>
      ))}
      <mesh position={[0, 9.1, halfDepth]} castShadow>
        <boxGeometry args={[layout.floor.width, 2.8, 0.36]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>

      {Array.from(
        { length: Math.max(3, Math.floor(layout.floor.depth / 18)) },
        (_, index) => -halfDepth + 9 + index * 18,
      ).map((z) => (
        <group key={z} position={[0, 9.25, z]}>
          <mesh>
            <boxGeometry args={[layout.floor.width - 4, 0.16, 0.34]} />
            <meshStandardMaterial
              color="#e2e8f0"
              emissive="#bae6fd"
              emissiveIntensity={0.7}
            />
          </mesh>
          {[-halfWidth * 0.55, 0, halfWidth * 0.55].map((x) => (
            <pointLight
              key={x}
              position={[x, -0.55, 0]}
              color="#e0f2fe"
              intensity={6}
              distance={24}
            />
          ))}
        </group>
      ))}

      <DockDoor
        x={receivingX}
        z={halfDepth}
        label="DOCA INBOUND"
        color="#86efac"
      />
      <DockDoor
        x={shippingX}
        z={halfDepth}
        label="DOCA OUTBOUND"
        color="#7dd3fc"
      />

      <group position={[shippingX, 0.03, halfDepth - 10]}>
        <mesh>
          <boxGeometry args={[18, 0.035, 10]} />
          <meshStandardMaterial
            color="#0284c7"
            transparent
            opacity={0.2}
          />
        </mesh>
        <Text
          position={[0, 0.05, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.44}
          color="#bae6fd"
        >
          STAGING EXPEDIÇÃO
        </Text>
      </group>

      <group position={[shippingX, 0, halfDepth + 8]}>
        <mesh position={[0, 1.05, 0]} castShadow>
          <boxGeometry args={[3.3, 2.1, 3.2]} />
          <meshStandardMaterial color="#2563eb" roughness={0.45} />
        </mesh>
        <mesh position={[0, 2.2, -4.6]} castShadow>
          <boxGeometry args={[4.5, 4.2, 9]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.65} />
        </mesh>
      </group>

      <Text position={[0, 10.8, -halfDepth + 1]} fontSize={0.9} color="#e2e8f0">
        {layout.name.toUpperCase()} · MESMA PLANTA OPERACIONAL
      </Text>
    </group>
  )
}

function effectiveCameraMode(
  selected: RealisticCameraMode,
  state: ReceivingSimulationState,
): Exclude<RealisticCameraMode, 'cinematic'> {
  if (selected !== 'cinematic') return selected
  if (state.truck.phase === 'arriving' || state.truck.phase === 'departing') {
    return 'dock'
  }
  if (state.forklift.phase === 'parked') return 'overview'
  return 'follow'
}

export function RealisticReceivingWorld({
  layout,
  compact,
}: {
  layout: WarehouseLayout
  compact: boolean
}) {
  const scenario = useMemo(
    () => createLayoutReceivingScenario(layout),
    [layout],
  )
  const engineRef = useRef<ReceivingRuntime | null>(null)
  const scenarioIdRef = useRef(scenario.id)
  if (!engineRef.current) {
    engineRef.current = createExperienceRuntime(scenario)
  }

  const forkliftRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const truckRef = useRef<THREE.Group | null>(null)
  const hudAccumulatorRef = useRef(0)
  const desiredCameraRef = useRef(new THREE.Vector3())
  const desiredTargetRef = useRef(new THREE.Vector3())

  const [snapshot, setSnapshot] = useState(() => engineRef.current!.snapshot())
  const [telemetry, setTelemetry] = useState<KernelTelemetry>(() =>
    engineRef.current!.telemetry(),
  )
  const [events, setEvents] = useState<KernelEvent[]>(() =>
    engineRef.current!.events(16),
  )
  const [timeScale, setTimeScaleState] = useState(DEFAULT_TIME_SCALE)
  const [paused, setPaused] = useState(false)
  const [cameraMode, setCameraMode] =
    useState<RealisticCameraMode>('cinematic')

  const { camera, invalidate } = useThree()
  const get = useThree((state) => state.get)

  const refreshPresentation = useCallback(() => {
    const runtime = engineRef.current
    if (!runtime) return
    setSnapshot(runtime.snapshot())
    setTelemetry(runtime.telemetry())
    setEvents(runtime.events(16))
  }, [])

  const centerCamera = useCallback(() => {
    const width = layout.floor.width
    const depth = layout.floor.depth
    camera.position.set(
      compact ? width * 0.42 : width * 0.56,
      compact ? 30 : Math.max(38, depth * 0.46),
      compact ? depth * 0.68 : depth * 0.78,
    )
    const controls = get().controls as CameraControls | undefined
    controls?.target?.set(0, 2.5, 0)
    controls?.update?.()
    invalidate()
  }, [camera, compact, get, invalidate, layout.floor.depth, layout.floor.width])

  useLayoutEffect(() => {
    const timer = window.setTimeout(centerCamera, 220)
    return () => window.clearTimeout(timer)
  }, [centerCamera])

  useEffect(() => {
    if (scenarioIdRef.current === scenario.id) return
    scenarioIdRef.current = scenario.id
    engineRef.current = createExperienceRuntime(scenario, timeScale)
    hudAccumulatorRef.current = 0
    setPaused(false)
    refreshPresentation()
    centerCamera()
  }, [centerCamera, refreshPresentation, scenario, timeScale])

  const reset = useCallback(() => {
    engineRef.current = createExperienceRuntime(scenario, timeScale)
    hudAccumulatorRef.current = 0
    setPaused(false)
    refreshPresentation()
    centerCamera()
  }, [centerCamera, refreshPresentation, scenario, timeScale])

  const changeTimeScale = useCallback((scale: number) => {
    const runtime = engineRef.current
    if (!runtime) return
    runtime.setTimeScale(scale)
    setTimeScaleState(scale)
    setTelemetry(runtime.telemetry())
  }, [])

  const togglePause = useCallback(() => {
    const runtime = engineRef.current
    if (!runtime) return
    const currentlyPaused = runtime.telemetry().paused
    if (currentlyPaused) runtime.resume()
    else runtime.pause()
    setPaused(!currentlyPaused)
    setTelemetry(runtime.telemetry())
  }, [])

  const stepOnce = useCallback(() => {
    const runtime = engineRef.current
    if (!runtime || !runtime.telemetry().paused) return
    runtime.stepOnce()
    refreshPresentation()
  }, [refreshPresentation])

  useFrame((_, delta) => {
    const runtime = engineRef.current
    if (!runtime) return
    runtime.step(delta)
    const state = runtime.read()

    if (forkliftRef.current) {
      forkliftRef.current.position.set(
        state.forklift.position.x,
        0.18,
        state.forklift.position.z,
      )
      forkliftRef.current.rotation.y = state.forklift.heading
    }
    if (carriageRef.current) {
      carriageRef.current.position.y = state.forklift.forkHeight
    }
    if (truckRef.current) truckRef.current.position.z = state.truck.z

    const activeMode = effectiveCameraMode(cameraMode, state)
    const desiredCamera = desiredCameraRef.current
    const desiredTarget = desiredTargetRef.current
    const worldForkliftX = state.forklift.position.x + scenario.offset.x
    const worldForkliftZ = state.forklift.position.z + scenario.offset.z
    const dockWorldX = scenario.offset.x
    const dockWorldZ = scenario.inboundDockZ

    if (activeMode === 'follow') {
      desiredCamera.set(
        worldForkliftX + (compact ? 8 : 11),
        compact ? 7 : 9,
        worldForkliftZ + (compact ? 11 : 15),
      )
      desiredTarget.set(worldForkliftX, 1.35, worldForkliftZ)
    } else if (activeMode === 'dock') {
      desiredCamera.set(
        dockWorldX + (compact ? 15 : 20),
        compact ? 12 : 16,
        dockWorldZ + (compact ? 20 : 27),
      )
      desiredTarget.set(dockWorldX, 1.8, dockWorldZ + 2)
    } else {
      desiredCamera.set(
        compact ? layout.floor.width * 0.42 : layout.floor.width * 0.56,
        compact ? 30 : Math.max(38, layout.floor.depth * 0.46),
        compact ? layout.floor.depth * 0.68 : layout.floor.depth * 0.78,
      )
      desiredTarget.set(0, 2.5, 0)
    }

    const smoothing = 1 - Math.exp(-delta * 2.8)
    camera.position.lerp(desiredCamera, smoothing)
    const controls = get().controls as CameraControls | undefined
    controls?.target?.lerp(desiredTarget, smoothing)
    controls?.update?.()

    hudAccumulatorRef.current += delta
    if (hudAccumulatorRef.current >= HUD_REFRESH_SECONDS) {
      hudAccumulatorRef.current = 0
      refreshPresentation()
    }
    invalidate()
  })

  const carried = snapshot.pallets.find(
    (pallet) => pallet.id === snapshot.forklift.carryingPalletId,
  )
  const moving = snapshot.forklift.speed > 0.08

  return (
    <>
      <SharedWarehouseInfrastructure layout={layout} scenario={scenario} />

      <group position={[scenario.offset.x, 0, scenario.offset.z]}>
        <DockSignals
          active={snapshot.truck.phase === 'docked'}
          dockWallZ={scenario.config.dockWallZ}
        />
        <StagingSlots scenario={scenario} />
        <Truck
          groupRef={truckRef}
          state={snapshot}
          config={scenario.config}
        />
        <StagedPallets
          pallets={snapshot.pallets}
          config={scenario.config}
        />
        <Trail
          width={0.55}
          length={7}
          color={snapshot.fault ? '#ef4444' : '#22d3ee'}
          attenuation={(value) => value * value}
        >
          <group ref={forkliftRef}>
            <ForkliftBeacon
              faulted={Boolean(snapshot.fault)}
              moving={moving}
            />
            <ForkliftModel
              carriageRef={carriageRef}
              mastHeight={3.3}
              compact={compact}
              cargoVisible={Boolean(carried)}
              cargoColor={carried?.color ?? '#38bdf8'}
              reportRuntimePose={false}
              accent="#16a34a"
              emergencyBraking={Boolean(snapshot.fault)}
              faulted={Boolean(snapshot.fault)}
            />
            <Text
              position={[0, 3.25, 0]}
              fontSize={0.32}
              color="#dcfce7"
              outlineWidth={0.02}
              outlineColor="#052e16"
            >
              RX 20-20 · RECEBIMENTO
            </Text>
          </group>
        </Trail>
      </group>

      <RealisticOperationsHud
        state={snapshot}
        telemetry={telemetry}
        events={events}
        timeScale={timeScale}
        paused={paused}
        cameraMode={cameraMode}
        onTimeScaleChange={changeTimeScale}
        onTogglePause={togglePause}
        onStepOnce={stepOnce}
        onReset={reset}
        onCameraModeChange={setCameraMode}
      />
    </>
  )
}
