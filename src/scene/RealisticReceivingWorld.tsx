import { Html, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import * as THREE from 'three'
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

function Pallet({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.16, 0.96]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.38, 0.86, 0.86]} />
        <meshStandardMaterial color={color} roughness={0.64} />
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
        <meshStandardMaterial color="#16a34a" roughness={0.5} />
      </mesh>
      {state.pallets
        .filter((pallet) => pallet.phase === 'truck')
        .map((pallet) => {
          const point = truckPalletPoint(
            pallet.index,
            GROWING_RECEIVING_CONFIG,
          )
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

function Warehouse() {
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
      <mesh position={[0, -0.08, center]} receiveShadow>
        <boxGeometry args={[config.floorWidth, 0.16, depth]} />
        <meshStandardMaterial color="#242d36" roughness={0.97} />
      </mesh>
      <gridHelper args={[150, 75, '#334155', '#283746']} position={[0, 0.01, center]} />

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
        <Text position={[0, 7.35, -0.2]} fontSize={0.7} color="#0f172a">
          DOCA 01 · RECEBIMENTO
        </Text>
      </group>

      <mesh
        position={[
          GROWING_STAGING.futureTranspalletLaneCenterX,
          0.025,
          laneCenterZ,
        ]}
      >
        <boxGeometry
          args={[GROWING_STAGING.futureTranspalletLaneWidth, 0.03, laneDepth]}
        />
        <meshStandardMaterial color="#0284c7" transparent opacity={0.16} />
      </mesh>
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
        CORREDOR FUTURO · TP-IN
      </Text>

      {EMPTY_WAREHOUSE_V3.rackRowXs.map((x) => (
        <group key={x}>
          {Array.from({ length: 8 }, (_, index) => {
            const z =
              EMPTY_WAREHOUSE_V3.rackStartZ -
              (rackLength * index) / 7
            return (
              <mesh key={z} position={[x, 3.5, z]} castShadow>
                <boxGeometry args={[1.8, 7, 0.16]} />
                <meshStandardMaterial color="#1f2937" metalness={0.62} />
              </mesh>
            )
          })}
          {[1.55, 3.25, 4.95, 6.65].map((y) => (
            <mesh key={y} position={[x, y, rackCenter]} castShadow>
              <boxGeometry args={[1.9, 0.16, rackLength]} />
              <meshStandardMaterial color="#f97316" metalness={0.35} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Hud({
  state,
  reset,
}: {
  state: ReceivingSimulationState
  reset: () => void
}) {
  const staged = state.pallets.filter(
    (pallet) => pallet.phase === 'staged',
  ).length
  return (
    <Html fullscreen zIndexRange={[80, 50]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 82,
          left: 12,
          width: 'min(340px, calc(100vw - 24px))',
          padding: '10px 12px',
          borderRadius: 12,
          border: `1px solid ${state.fault ? '#ef4444' : '#22c55e'}`,
          background: 'rgba(7,17,31,.92)',
          color: '#f8fafc',
          fontFamily: 'system-ui,sans-serif',
          pointerEvents: 'auto',
        }}
      >
        <strong style={{ display: 'block', fontSize: 12 }}>
          REALISTA · FUNDAÇÃO CONFIGURÁVEL
        </strong>
        <span style={{ fontSize: 10, color: '#bbf7d0' }}>{state.label}</span>
        <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.5 }}>
          <div>Lote: {String(state.batch).padStart(3, '0')}</div>
          <div>Staging: {staged}/{GROWING_RECEIVING_CONFIG.stagingCapacity}</div>
          <div>Caminhões concluídos: {state.completedTrucks}</div>
          <div>RX20: {state.forklift.phase}</div>
          <div>Falha: {state.fault ?? 'nenhuma'}</div>
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 7,
            border: '1px solid #64748b',
            borderRadius: 7,
            background: '#1e293b',
            color: '#f8fafc',
            padding: '6px 8px',
            fontSize: 9,
          }}
        >
          Reiniciar cenário
        </button>
      </div>
    </Html>
  )
}

export function RealisticReceivingWorld({ compact }: { compact: boolean }) {
  const forkliftRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const truckRef = useRef<THREE.Group | null>(null)
  const engineRef = useRef(createGrowingReceivingSimulation())
  const revisionRef = useRef(-1)
  const [snapshot, setSnapshot] = useState(() => engineRef.current.snapshot())
  const { camera, invalidate } = useThree()
  const get = useThree((state) => state.get)

  const centerCamera = useCallback(() => {
    camera.position.set(compact ? 38 : 48, compact ? 30 : 38, compact ? 56 : 66)
    const controls = get().controls as
      | { target?: THREE.Vector3; update?: () => void }
      | undefined
    controls?.target?.set(0, 2.2, -18)
    controls?.update?.()
    invalidate()
  }, [camera, compact, get, invalidate])

  useLayoutEffect(() => {
    const timer = window.setTimeout(centerCamera, 350)
    return () => window.clearTimeout(timer)
  }, [centerCamera])

  const reset = useCallback(() => {
    engineRef.current = createGrowingReceivingSimulation()
    revisionRef.current = -1
    setSnapshot(engineRef.current.snapshot())
    centerCamera()
  }, [centerCamera])

  useFrame((_, delta) => {
    const engine = engineRef.current
    engine.step(delta)
    const state = engine.read()

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

    if (revisionRef.current !== state.revision) {
      revisionRef.current = state.revision
      setSnapshot(engine.snapshot())
    }
    invalidate()
  })

  const carried = snapshot.pallets.find(
    (pallet) => pallet.id === snapshot.forklift.carryingPalletId,
  )

  return (
    <>
      <Warehouse />
      <Truck groupRef={truckRef} state={snapshot} />
      <StagedPallets pallets={snapshot.pallets} />
      <group ref={forkliftRef}>
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
        <Text position={[0, 3.25, 0]} fontSize={0.32} color="#dcfce7">
          RX 20-20 · RECEBIMENTO
        </Text>
      </group>
      <Hud state={snapshot} reset={reset} />
    </>
  )
}
