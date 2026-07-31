import { Html, Text } from '@react-three/drei'
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
import {
  RECEIVING_V2,
  ReceivingSimulation,
  stagingPoint,
  truckPalletPoint,
  type ReceivingPallet,
  type ReceivingSimulationState,
} from '../realistic-v2/receivingSimulation'
import { ForkliftModel } from './ForkliftModel'

const PALLET_HEIGHT = 0.16
const LOAD_HEIGHT = 0.86

function isDescendantOf(
  object: THREE.Object3D,
  ancestor: THREE.Object3D,
): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

function isRenderableObject(object: THREE.Object3D): boolean {
  const candidate = object as THREE.Object3D & {
    isMesh?: boolean
    isLine?: boolean
    isPoints?: boolean
    isSprite?: boolean
  }
  return Boolean(
    candidate.isMesh ||
      candidate.isLine ||
      candidate.isPoints ||
      candidate.isSprite,
  )
}

function SceneIsolation({
  rootRef,
}: {
  rootRef: MutableRefObject<THREE.Group | null>
}) {
  const { scene, invalidate } = useThree()

  useLayoutEffect(() => {
    const hidden = new Map<THREE.Object3D, boolean>()

    const suppressOperationalWorld = () => {
      const root = rootRef.current
      if (!root) return
      scene.traverse((object) => {
        if (!isRenderableObject(object) || isDescendantOf(object, root)) return
        if (!hidden.has(object)) hidden.set(object, object.visible)
        object.visible = false
      })
      invalidate()
    }

    suppressOperationalWorld()
    const frame = window.requestAnimationFrame(suppressOperationalWorld)
    const timer = window.setTimeout(suppressOperationalWorld, 120)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      hidden.forEach((visible, object) => {
        object.visible = visible
      })
      hidden.clear()
      invalidate()
    }
  }, [invalidate, rootRef, scene])

  return null
}

function PalletModel({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, PALLET_HEIGHT, 0.96]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </mesh>
      <mesh
        position={[0, PALLET_HEIGHT / 2 + LOAD_HEIGHT / 2 + 0.025, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1.38, LOAD_HEIGHT, 0.86]} />
        <meshStandardMaterial color={color} roughness={0.64} />
      </mesh>
      {[-0.52, 0, 0.52].map((x) => (
        <mesh key={x} position={[x, -0.08, 0]} castShadow>
          <boxGeometry args={[0.12, 0.13, 0.9]} />
          <meshStandardMaterial color="#6b4423" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function ReceivingTruck({
  groupRef,
  state,
}: {
  groupRef: MutableRefObject<THREE.Group | null>
  state: ReceivingSimulationState
}) {
  return (
    <group ref={groupRef} position={[0, 0, state.truck.z]}>
      <mesh position={[0, 0.11, 0]} receiveShadow castShadow>
        <boxGeometry args={[4.5, 0.22, 13]} />
        <meshStandardMaterial color="#64748b" metalness={0.24} roughness={0.72} />
      </mesh>
      {[-2.22, 2.22].map((x) => (
        <mesh key={`wall-${x}`} position={[x, 1.82, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 3.42, 13]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.12} roughness={0.62} />
        </mesh>
      ))}
      <mesh position={[0, 3.55, 0]} castShadow>
        <boxGeometry args={[4.5, 0.16, 13]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.12} roughness={0.58} />
      </mesh>
      <mesh position={[0, 1.82, 6.42]} castShadow receiveShadow>
        <boxGeometry args={[4.5, 3.42, 0.16]} />
        <meshStandardMaterial color="#dbe3ec" metalness={0.12} roughness={0.66} />
      </mesh>

      <mesh position={[0, 1.18, 8.05]} castShadow>
        <boxGeometry args={[3.35, 2.35, 2.9]} />
        <meshStandardMaterial color="#16a34a" metalness={0.16} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.68, 9.46]} castShadow>
        <boxGeometry args={[3.05, 1.35, 0.18]} />
        <meshStandardMaterial color="#0f172a" metalness={0.28} roughness={0.22} />
      </mesh>
      <mesh position={[0, 2.58, 8.2]} castShadow>
        <boxGeometry args={[3.2, 0.28, 2.4]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.55} />
      </mesh>

      {[-1.62, 1.62].flatMap((x) =>
        [-4.25, 2.2, 8.25].map((z) => (
          <mesh
            key={`wheel-${x}-${z}`}
            position={[x, 0.44, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.44, 0.44, 0.3, 16]} />
            <meshStandardMaterial color="#111827" roughness={0.92} />
          </mesh>
        )),
      )}

      {state.pallets
        .filter((pallet) => pallet.phase === 'truck')
        .map((pallet) => {
          const point = truckPalletPoint(pallet.index)
          return (
            <group
              key={pallet.id}
              position={[point.x, 0.32, point.z - RECEIVING_V2.truckDockZ]}
            >
              <PalletModel color={pallet.color} />
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
          const point = stagingPoint(pallet.stagedSlot ?? pallet.index)
          return (
            <group key={pallet.id} position={[point.x, 0.17, point.z]}>
              <PalletModel color={pallet.color} />
            </group>
          )
        })}
    </>
  )
}

function DockDoor() {
  return (
    <group position={[0, 0, RECEIVING_V2.dockWallZ]}>
      <mesh position={[-20.25, 4.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[31.5, 9.5, 0.36]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[20.25, 4.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[31.5, 9.5, 0.36]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[0, 8.05, 0]} castShadow>
        <boxGeometry args={[9, 2.9, 0.36]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      {[-3.25, 3.25].map((x) => (
        <mesh key={x} position={[x, 1.55, -0.32]} castShadow>
          <boxGeometry args={[0.34, 3.1, 0.56]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.66} />
        </mesh>
      ))}
      <mesh position={[0, 0.12, -0.9]} receiveShadow>
        <boxGeometry args={[6.8, 0.24, 1.8]} />
        <meshStandardMaterial color="#334155" roughness={0.9} />
      </mesh>
      <Text
        position={[0, 7.4, -0.25]}
        fontSize={0.72}
        color="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        DOCA 01 · RECEBIMENTO
      </Text>
    </group>
  )
}

function SafetyMarkings() {
  return (
    <group>
      <mesh position={[0, 0.055, 20]}>
        <ringGeometry args={[3.7, 4.05, 48]} />
        <meshStandardMaterial color="#f59e0b" side={THREE.DoubleSide} />
      </mesh>
      <Text
        position={[0, 0.08, 20]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.38}
        color="#fef3c7"
        anchorX="center"
        anchorY="middle"
      >
        ZONA LIVRE PARA GIRO
      </Text>

      {RECEIVING_V2.stageXs.map((x, index) => (
        <group key={x} position={[x, 0.055, RECEIVING_V2.stagingZ]}>
          <mesh>
            <boxGeometry args={[3.75, 0.055, 2.35]} />
            <meshStandardMaterial
              color="#16a34a"
              transparent
              opacity={0.38}
            />
          </mesh>
          <Text
            position={[0, 0.04, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.32}
            color="#ecfdf5"
          >
            D{index + 1}
          </Text>
        </group>
      ))}

      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 2.65, 0.045, 23.2]}>
          <boxGeometry args={[0.08, 0.04, 9]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}

      <Text
        position={[0, 0.08, -20.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.52}
        color="#bbf7d0"
      >
        STAGING DE RECEBIMENTO · SEIS POSIÇÕES EXCLUSIVAS
      </Text>
    </group>
  )
}

function WarehouseBuilding() {
  const beamPositions = useMemo(
    () => Array.from({ length: 8 }, (_, index) => -37 + index * 9.8),
    [],
  )

  return (
    <group>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry
          args={[RECEIVING_V2.floorWidth, 0.16, RECEIVING_V2.floorDepth]}
        />
        <meshStandardMaterial color="#242d36" roughness={0.97} />
      </mesh>
      <gridHelper
        args={[RECEIVING_V2.floorDepth, 86, '#334155', '#283746']}
        position={[0, 0.012, 0]}
      />
      <mesh position={[-36, 5.3, -7.5]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 10.6, 71]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.86} />
      </mesh>
      <mesh position={[36, 5.3, -7.5]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 10.6, 71]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.86} />
      </mesh>
      <mesh position={[0, 5.3, -43]} castShadow receiveShadow>
        <boxGeometry args={[72, 10.6, 0.34]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <DockDoor />

      {beamPositions.map((z) => (
        <mesh key={z} position={[0, 9.6, z]} castShadow>
          <boxGeometry args={[70.5, 0.18, 0.2]} />
          <meshStandardMaterial color="#475569" metalness={0.58} roughness={0.38} />
        </mesh>
      ))}
      {[-22, 0, 22].flatMap((x) =>
        [-31, -15, 1, 17].map((z) => (
          <mesh key={`light-${x}-${z}`} position={[x, 9.22, z]}>
            <boxGeometry args={[5.5, 0.12, 0.42]} />
            <meshStandardMaterial
              color="#f8fafc"
              emissive="#dbeafe"
              emissiveIntensity={1.25}
            />
          </mesh>
        )),
      )}

      <mesh position={[0, 0.015, 49]} receiveShadow>
        <boxGeometry args={[72, 0.04, 42]} />
        <meshStandardMaterial color="#374151" roughness={0.98} />
      </mesh>
      {[-5.1, 5.1].map((x) => (
        <mesh key={`yard-${x}`} position={[x, 0.045, 49]}>
          <boxGeometry args={[0.12, 0.04, 40]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
      <SafetyMarkings />
    </group>
  )
}

function RealisticV2Hud({
  state,
  onReset,
}: {
  state: ReceivingSimulationState
  onReset: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const staged = state.pallets.filter((pallet) => pallet.phase === 'staged').length
  const inTruck = state.pallets.filter((pallet) => pallet.phase === 'truck').length

  return (
    <Html fullscreen zIndexRange={[80, 50]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 82,
          left: 12,
          width: 'min(310px, calc(100vw - 24px))',
          borderRadius: 12,
          border: `1px solid ${state.fault ? '#ef4444' : '#22c55e'}`,
          background: 'rgba(7, 17, 31, 0.92)',
          color: '#f8fafc',
          padding: '10px 12px',
          boxShadow: '0 12px 34px rgba(0,0,0,.3)',
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <div>
            <strong style={{ display: 'block', fontSize: 12 }}>
              REALISTA V2 · RECEBIMENTO
            </strong>
            <span style={{ display: 'block', marginTop: 3, fontSize: 10, color: '#bbf7d0' }}>
              {state.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            style={{
              alignSelf: 'flex-start',
              border: '1px solid #475569',
              borderRadius: 7,
              background: '#111827',
              color: '#e2e8f0',
              padding: '5px 7px',
              fontSize: 9,
            }}
          >
            {expanded ? 'Fechar' : 'Diagnóstico'}
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            marginTop: 9,
          }}
        >
          {[
            ['Lote', String(state.batch).padStart(3, '0')],
            ['No caminhão', String(inTruck)],
            ['No staging', String(staged)],
          ].map(([label, value]) => (
            <div key={label} style={{ borderRadius: 7, background: '#172033', padding: 6 }}>
              <span style={{ display: 'block', fontSize: 8, color: '#94a3b8' }}>{label}</span>
              <strong style={{ fontSize: 13 }}>{value}</strong>
            </div>
          ))}
        </div>
        {expanded && (
          <div style={{ marginTop: 8, fontSize: 9, lineHeight: 1.45, color: '#cbd5e1' }}>
            <div>RX20: {state.forklift.phase}</div>
            <div>Caminhão: {state.truck.phase}</div>
            <div>Velocidade: {state.forklift.speed.toFixed(2)} m/s</div>
            <div>Garfo: {state.forklift.forkHeight.toFixed(2)} m</div>
            <div>Caminhões concluídos: {state.completedTrucks}</div>
            <div>Falha: {state.fault ?? 'nenhuma'}</div>
            <button
              type="button"
              onClick={onReset}
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
              Reiniciar célula
            </button>
          </div>
        )}
      </div>
    </Html>
  )
}

export function RealisticWorldV2({ compact }: { compact: boolean }) {
  const rootRef = useRef<THREE.Group | null>(null)
  const forkliftRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const truckRef = useRef<THREE.Group | null>(null)
  const engineRef = useRef(new ReceivingSimulation())
  const revisionRef = useRef(-1)
  const [snapshot, setSnapshot] = useState(() => engineRef.current.snapshot())
  const { camera, invalidate } = useThree()
  const get = useThree((state) => state.get)

  const centerCamera = useCallback(() => {
    camera.position.set(compact ? 28 : 34, compact ? 23 : 27, compact ? 43 : 49)
    const controls = get().controls as
      | { target?: THREE.Vector3; update?: () => void }
      | undefined
    controls?.target?.set(0, 2.4, 4)
    controls?.update?.()
    invalidate()
  }, [camera, compact, get, invalidate])

  useLayoutEffect(() => {
    const timer = window.setTimeout(centerCamera, 450)
    return () => window.clearTimeout(timer)
  }, [centerCamera])

  const reset = useCallback(() => {
    engineRef.current = new ReceivingSimulation()
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
    if (carriageRef.current) {
      carriageRef.current.position.y = state.forklift.forkHeight
    }
    if (truckRef.current) {
      truckRef.current.position.z = state.truck.z
    }

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
      <group ref={rootRef} name="realistic-v2-root">
        <WarehouseBuilding />
        <ReceivingTruck groupRef={truckRef} state={snapshot} />
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
          <Text
            position={[0, 3.25, 0]}
            fontSize={0.32}
            color="#dcfce7"
            outlineWidth={0.025}
            outlineColor="#052e16"
          >
            RX 20-20 · RECEBIMENTO
          </Text>
        </group>
      </group>
      <SceneIsolation rootRef={rootRef} />
      <RealisticV2Hud state={snapshot} onReset={reset} />
    </>
  )
}
