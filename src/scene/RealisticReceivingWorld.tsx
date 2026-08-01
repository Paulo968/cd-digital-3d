import { Text, Trail } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import * as THREE from 'three'
import type { KernelEvent, KernelTelemetry } from '../realistic/core/livingWorldKernel'
import type { ReceivingOperationsTelemetry } from '../realistic/tasks/receivingTaskResourceSystem'
import {
  EMPTY_WAREHOUSE_V3,
  GROWING_RECEIVING_CONFIG,
  GROWING_STAGING,
  createGrowingReceivingSimulation,
  growingStagingPoint,
} from '../realistic-v2/growingReceivingOperation'
import {
  truckPalletPoint,
  type ReceivingPallet,
  type ReceivingSimulationState,
} from '../realistic-v2/receivingSimulation'
import { ForkliftModel } from './ForkliftModel'
import {
  RealisticOperationsHud,
  type RealisticCameraMode,
} from './RealisticOperationsHud'

const DEFAULT_TIME_SCALE = 2
const HUD_REFRESH_SECONDS = 0.18

type ReceivingRuntime = ReturnType<typeof createGrowingReceivingSimulation>

type CameraControls = {
  target?: THREE.Vector3
  update?: () => void
}

function createExperienceRuntime(timeScale = DEFAULT_TIME_SCALE): ReceivingRuntime {
  const runtime = createGrowingReceivingSimulation()
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
}: {
  groupRef: MutableRefObject<THREE.Group | null>
  state: ReceivingSimulationState
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
        <meshStandardMaterial color="#16a34a" metalness={0.18} roughness={0.44} />
      </mesh>
      <mesh position={[0, 1.68, 9.59]}>
        <boxGeometry args={[2.75, 0.92, 0.08]} />
        <meshStandardMaterial color="#07111f" metalness={0.52} roughness={0.18} />
      </mesh>
      {[-1.68, 1.68].flatMap((x) =>
        [-4.5, 3.3, 7.65].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.48, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
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
          const point = truckPalletPoint(pallet.index, GROWING_RECEIVING_CONFIG)
          return (
            <group
              key={pallet.id}
              position={[
                point.x,
                0.32,
                point.z - GROWING_RECEIVING_CONFIG.truckDockZ,
              ]}
            >
              <Pallet color={pallet.color} />
            </group>
          )
        })}
    </group>
  )
}

function StagedPallets({ pallets }: { pallets: ReceivingPallet[] }) {
  return (
    <>
      {pallets
        .filter((pallet) => pallet.phase === 'staged')
        .map((pallet) => {
          const point = growingStagingPoint(pallet.stagedSlot ?? 0)
          return (
            <group key={pallet.id} position={[point.x, 0.17, point.z]}>
              <Pallet color={pallet.color} />
            </group>
          )
        })}
    </>
  )
}

function StagingSlots() {
  const visibleSlots = useMemo(
    () => Array.from({ length: 32 }, (_, index) => ({ index, ...growingStagingPoint(index) })),
    [],
  )

  return (
    <group>
      {visibleSlots.map((slot) => (
        <group key={slot.index} position={[slot.x, 0.025, slot.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.7, 3.35]} />
            <meshBasicMaterial
              color={slot.index < 8 ? '#22c55e' : '#0ea5e9'}
              transparent
              opacity={0.08}
              side={THREE.DoubleSide}
            />
          </mesh>
          <Text
            position={[0, 0.045, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.22}
            color="#94a3b8"
          >
            D{String(slot.index + 1).padStart(2, '0')}
          </Text>
        </group>
      ))}
    </group>
  )
}

function FlowMarkers() {
  const groupRef = useRef<THREE.Group | null>(null)
  const count = 12
  const startZ = GROWING_STAGING.futureTranspalletEntryZ
  const endZ = GROWING_STAGING.approachZ
  const span = Math.abs(endZ - startZ)

  useFrame(({ clock }) => {
    const group = groupRef.current
    if (!group) return
    const offset = (clock.elapsedTime * 7.5) % span
    group.children.forEach((child, index) => {
      child.position.z = startZ + ((offset + index * (span / count)) % span)
    })
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: count }, (_, index) => (
        <mesh
          key={index}
          position={[GROWING_STAGING.futureTranspalletLaneCenterX, 0.055, startZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.22, 18]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  )
}

function DockSignals({ active }: { active: boolean }) {
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
    <group position={[0, 3.5, GROWING_RECEIVING_CONFIG.dockWallZ - 0.32]}>
      {[-5.2, 5.2].map((x, index) => (
        <mesh key={x} ref={index === 0 ? leftRef : rightRef} position={[x, 0, 0]}>
          <sphereGeometry args={[0.22, 18, 18]} />
          <meshBasicMaterial color={active ? '#22c55e' : '#f59e0b'} transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  )
}

function ForkliftBeacon({ faulted, moving }: { faulted: boolean; moving: boolean }) {
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
      <mesh ref={ringRef} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.28, 1.42, 42]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 2.5, 0]} color={color} intensity={moving ? 1.2 : 0.45} distance={7} />
    </group>
  )
}

function Warehouse({ truckDocked }: { truckDocked: boolean }) {
  const config = GROWING_RECEIVING_CONFIG
  const front = config.dockWallZ
  const back = EMPTY_WAREHOUSE_V3.backWallZ
  const depth = front - back
  const center = (front + back) / 2
  const rackCenter =
    (EMPTY_WAREHOUSE_V3.rackStartZ + EMPTY_WAREHOUSE_V3.rackEndZ) / 2
  const rackLength = Math.abs(
    EMPTY_WAREHOUSE_V3.rackEndZ - EMPTY_WAREHOUSE_V3.rackStartZ,
  )
  const laneCenterZ =
    (GROWING_STAGING.futureTranspalletEntryZ + GROWING_STAGING.approachZ) / 2
  const laneDepth = Math.abs(
    GROWING_STAGING.futureTranspalletEntryZ - GROWING_STAGING.approachZ,
  )

  return (
    <group>
      <hemisphereLight args={['#dbeafe', '#111827', 1.15]} />
      <directionalLight position={[35, 48, 26]} intensity={1.2} castShadow />
      <spotLight
        position={[0, 12, 35]}
        target-position={[0, 0, 30]}
        color="#dbeafe"
        intensity={95}
        distance={38}
        angle={0.72}
        penumbra={0.7}
      />

      <mesh position={[0, -0.08, center]} receiveShadow>
        <boxGeometry args={[config.floorWidth, 0.16, depth]} />
        <meshStandardMaterial color="#1b2632" roughness={0.88} metalness={0.08} />
      </mesh>
      <gridHelper args={[150, 75, '#334155', '#243445']} position={[0, 0.01, center]} />

      {[-config.floorWidth / 2, config.floorWidth / 2].map((x) => (
        <mesh key={x} position={[x, 5.3, center]} castShadow>
          <boxGeometry args={[0.34, 10.6, depth]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[0, 5.3, back]} castShadow>
        <boxGeometry args={[config.floorWidth, 10.6, 0.34]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>

      {[-18, -46, -74, -102].map((z) => (
        <group key={z} position={[0, 9.1, z]}>
          <mesh>
            <boxGeometry args={[72, 0.12, 0.32]} />
            <meshStandardMaterial color="#e2e8f0" emissive="#bae6fd" emissiveIntensity={1.5} />
          </mesh>
        </group>
      ))}

      <group position={[0, 0, config.dockWallZ]}>
        <mesh position={[-31, 4.75, 0]} castShadow>
          <boxGeometry args={[50, 9.5, 0.34]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
        </mesh>
        <mesh position={[31, 4.75, 0]} castShadow>
          <boxGeometry args={[50, 9.5, 0.34]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
        </mesh>
        <mesh position={[0, 8, 0]} castShadow>
          <boxGeometry args={[12, 3, 0.34]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
        </mesh>
        {[-5.15, 5.15].map((x) => (
          <mesh key={x} position={[x, 0.55, -0.34]} castShadow>
            <boxGeometry args={[0.48, 1.1, 0.75]} />
            <meshStandardMaterial color="#111827" roughness={0.72} />
          </mesh>
        ))}
        <Text position={[0, 7.35, -0.2]} fontSize={0.7} color="#0f172a">
          DOCA 01 · RECEBIMENTO
        </Text>
      </group>
      <DockSignals active={truckDocked} />

      <mesh
        position={[
          GROWING_STAGING.futureTranspalletLaneCenterX,
          0.025,
          laneCenterZ,
        ]}
      >
        <boxGeometry args={[GROWING_STAGING.futureTranspalletLaneWidth, 0.03, laneDepth]} />
        <meshStandardMaterial color="#0284c7" emissive="#0369a1" emissiveIntensity={0.35} transparent opacity={0.2} />
      </mesh>
      <FlowMarkers />
      <Text
        position={[
          GROWING_STAGING.futureTranspalletLaneCenterX,
          0.07,
          laneCenterZ,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.38}
        color="#7dd3fc"
      >
        CORREDOR TP-IN · PRÓXIMA EVOLUÇÃO
      </Text>
      <StagingSlots />

      {EMPTY_WAREHOUSE_V3.rackRowXs.map((x) => (
        <group key={x}>
          {Array.from({ length: 8 }, (_, index) => {
            const z = EMPTY_WAREHOUSE_V3.rackStartZ - (rackLength * index) / 7
            return (
              <mesh key={z} position={[x, 3.5, z]} castShadow>
                <boxGeometry args={[1.8, 7, 0.16]} />
                <meshStandardMaterial color="#1f2937" metalness={0.62} roughness={0.34} />
              </mesh>
            )
          })}
          {[1.55, 3.25, 4.95, 6.65].map((y) => (
            <mesh key={y} position={[x, y, rackCenter]} castShadow>
              <boxGeometry args={[1.9, 0.16, rackLength]} />
              <meshStandardMaterial color="#f97316" metalness={0.35} roughness={0.42} />
            </mesh>
          ))}
        </group>
      ))}

      {EMPTY_WAREHOUSE_V3.aisleNames.map((name, index) => {
        const left = EMPTY_WAREHOUSE_V3.rackRowXs[index]
        const right = EMPTY_WAREHOUSE_V3.rackRowXs[index + 1]
        return (
          <Text
            key={name}
            position={[(left + right) / 2, 0.07, EMPTY_WAREHOUSE_V3.rackStartZ + 3]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.48}
            color="#bae6fd"
          >
            {name}
          </Text>
        )
      })}

      <Text position={[0, 8.5, -78]} fontSize={1.05} color="#e2e8f0">
        CD REALISTA · OPERAÇÃO VIVA
      </Text>
    </group>
  )
}

function effectiveCameraMode(
  selected: RealisticCameraMode,
  state: ReceivingSimulationState,
): Exclude<RealisticCameraMode, 'cinematic'> {
  if (selected !== 'cinematic') return selected
  if (state.truck.phase === 'arriving' || state.truck.phase === 'departing') return 'dock'
  if (state.forklift.phase === 'parked') return 'overview'
  return 'follow'
}

export function RealisticReceivingWorld({ compact }: { compact: boolean }) {
  const engineRef = useRef<ReceivingRuntime | null>(null)
  if (!engineRef.current) engineRef.current = createExperienceRuntime()

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
  const [operations, setOperations] = useState<ReceivingOperationsTelemetry>(() =>
    engineRef.current!.operations(),
  )
  const [events, setEvents] = useState<KernelEvent[]>(() => engineRef.current!.events(16))
  const [timeScale, setTimeScaleState] = useState(DEFAULT_TIME_SCALE)
  const [paused, setPaused] = useState(false)
  const [cameraMode, setCameraMode] = useState<RealisticCameraMode>('cinematic')

  const { camera, invalidate } = useThree()
  const get = useThree((state) => state.get)

  const refreshPresentation = useCallback(() => {
    const runtime = engineRef.current
    if (!runtime) return
    setSnapshot(runtime.snapshot())
    setTelemetry(runtime.telemetry())
    setOperations(runtime.operations())
    setEvents(runtime.events(16))
  }, [])

  const centerCamera = useCallback(() => {
    camera.position.set(compact ? 38 : 48, compact ? 30 : 38, compact ? 56 : 66)
    const controls = get().controls as CameraControls | undefined
    controls?.target?.set(0, 2.2, -18)
    controls?.update?.()
    invalidate()
  }, [camera, compact, get, invalidate])

  useLayoutEffect(() => {
    const timer = window.setTimeout(centerCamera, 250)
    return () => window.clearTimeout(timer)
  }, [centerCamera])

  const reset = useCallback(() => {
    engineRef.current = createExperienceRuntime(timeScale)
    hudAccumulatorRef.current = 0
    setPaused(false)
    refreshPresentation()
    centerCamera()
  }, [centerCamera, refreshPresentation, timeScale])

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
    if (carriageRef.current) carriageRef.current.position.y = state.forklift.forkHeight
    if (truckRef.current) truckRef.current.position.z = state.truck.z

    const activeMode = effectiveCameraMode(cameraMode, state)
    const desiredCamera = desiredCameraRef.current
    const desiredTarget = desiredTargetRef.current

    if (activeMode === 'follow') {
      desiredCamera.set(
        state.forklift.position.x + (compact ? 8 : 11),
        compact ? 7 : 9,
        state.forklift.position.z + (compact ? 11 : 15),
      )
      desiredTarget.set(state.forklift.position.x, 1.35, state.forklift.position.z)
    } else if (activeMode === 'dock') {
      desiredCamera.set(compact ? 17 : 23, compact ? 12 : 16, 48)
      desiredTarget.set(0, 1.8, 31)
    } else {
      desiredCamera.set(compact ? 38 : 48, compact ? 30 : 38, compact ? 56 : 66)
      desiredTarget.set(0, 2.2, -18)
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
      <Warehouse truckDocked={snapshot.truck.phase === 'docked'} />
      <Truck groupRef={truckRef} state={snapshot} />
      <StagedPallets pallets={snapshot.pallets} />
      <Trail
        width={0.55}
        length={7}
        color={snapshot.fault ? '#ef4444' : '#22d3ee'}
        attenuation={(value) => value * value}
      >
        <group ref={forkliftRef}>
          <ForkliftBeacon faulted={Boolean(snapshot.fault)} moving={moving} />
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
      <RealisticOperationsHud
        state={snapshot}
        telemetry={telemetry}
        operations={operations}
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
