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
  EMPTY_WAREHOUSE_V3,
  GROWING_STAGING,
  growingStagingPoint,
} from '../realistic-v2/growingReceivingOperation'
import {
  RECEIVING_V2,
  ReceivingSimulation,
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
          const point = growingStagingPoint(pallet.stagedSlot ?? pallet.index)
          return (
            <group key={pallet.id} position={[point.x, 0.17, point.z]}>
              <PalletModel color={pallet.color} />
            </group>
          )
        })}
    </>
  )
}

function DockFront() {
  return (
    <group position={[0, 0, RECEIVING_V2.dockWallZ]}>
      <mesh position={[-31, 4.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[50, 9.5, 0.36]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[31, 4.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[50, 9.5, 0.36]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[0, 8.05, 0]} castShadow>
        <boxGeometry args={[12, 2.9, 0.36]} />
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

function PartitionDoors() {
  const z = EMPTY_WAREHOUSE_V3.partitionZ
  return (
    <group>
      <mesh position={[-51.05, 3.4, z]} castShadow receiveShadow>
        <boxGeometry args={[9.9, 6.8, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.84} />
      </mesh>
      <mesh position={[-19.25, 3.4, z]} castShadow receiveShadow>
        <boxGeometry args={[49.3, 6.8, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.84} />
      </mesh>
      <mesh position={[32.6, 3.4, z]} castShadow receiveShadow>
        <boxGeometry args={[46.8, 6.8, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.84} />
      </mesh>
      <mesh
        position={[EMPTY_WAREHOUSE_V3.pedestrianDoorX, 5.85, z]}
        castShadow
      >
        <boxGeometry args={[EMPTY_WAREHOUSE_V3.pedestrianDoorWidth, 1.9, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.84} />
      </mesh>
      <mesh
        position={[EMPTY_WAREHOUSE_V3.transpalletDoorX, 5.6, z]}
        castShadow
      >
        <boxGeometry args={[EMPTY_WAREHOUSE_V3.transpalletDoorWidth, 2.4, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.84} />
      </mesh>
      <Text
        position={[EMPTY_WAREHOUSE_V3.pedestrianDoorX, 2.2, z + 0.18]}
        fontSize={0.34}
        color="#e2e8f0"
        anchorX="center"
      >
        ENTRADA DE PESSOAS
      </Text>
      <Text
        position={[EMPTY_WAREHOUSE_V3.transpalletDoorX, 2.4, z + 0.18]}
        fontSize={0.4}
        color="#bae6fd"
        anchorX="center"
      >
        PORTA FUTURA · TRANSPALETEIRA
      </Text>
    </group>
  )
}

function RackRow({ x }: { x: number }) {
  const uprightZs = useMemo(
    () => Array.from({ length: 7 }, (_, index) => -126 - index * 6),
    [],
  )
  return (
    <group>
      {uprightZs.map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 3.5, z]} castShadow>
          <boxGeometry args={[1.8, 7, 0.16]} />
          <meshStandardMaterial color="#1f2937" metalness={0.62} roughness={0.38} />
        </mesh>
      ))}
      {[1.55, 3.25, 4.95, 6.65].map((y) => (
        <mesh key={`${x}-${y}`} position={[x, y, -144]} castShadow>
          <boxGeometry args={[1.9, 0.16, 36]} />
          <meshStandardMaterial color="#f97316" metalness={0.35} roughness={0.48} />
        </mesh>
      ))}
    </group>
  )
}

function EmptyFiveAisleWarehouse() {
  return (
    <group>
      <PartitionDoors />
      {EMPTY_WAREHOUSE_V3.rackRowXs.map((x) => (
        <RackRow key={x} x={x} />
      ))}
      {EMPTY_WAREHOUSE_V3.aisleNames.map((name, index) => {
        const left = EMPTY_WAREHOUSE_V3.rackRowXs[index]
        const right = EMPTY_WAREHOUSE_V3.rackRowXs[index + 1]
        return (
          <Text
            key={name}
            position={[(left + right) / 2, 0.08, -122]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.52}
            color="#bae6fd"
            anchorX="center"
          >
            {name}
          </Text>
        )
      })}
      <Text
        position={[0, 8.2, -151]}
        fontSize={1.05}
        color="#e2e8f0"
        anchorX="center"
      >
        CD REALISTA · CINCO RUAS · ESTOQUE INICIAL VAZIO
      </Text>
    </group>
  )
}

function StagingAndTrafficMarkings() {
  const zoneCenterZ = -56
  const zoneDepth = 108
  return (
    <group>
      <mesh position={[0, 0.035, 12]}>
        <ringGeometry args={[4.2, 4.55, 48]} />
        <meshStandardMaterial color="#f59e0b" side={THREE.DoubleSide} />
      </mesh>
      <Text
        position={[0, 0.07, 12]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.38}
        color="#fef3c7"
        anchorX="center"
      >
        ÁREA LIVRE DA RX20
      </Text>

      <mesh
        position={[
          GROWING_STAGING.futureTranspalletLaneCenterX,
          0.028,
          zoneCenterZ,
        ]}
      >
        <boxGeometry
          args={[GROWING_STAGING.futureTranspalletLaneWidth, 0.035, zoneDepth]}
        />
        <meshStandardMaterial color="#0284c7" transparent opacity={0.16} />
      </mesh>
      <Text
        position={[
          GROWING_STAGING.futureTranspalletLaneCenterX,
          0.07,
          -53,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.42}
        color="#7dd3fc"
        anchorX="center"
      >
        CORREDOR RESERVADO · FUTURA TRANSPALETEIRA
      </Text>

      <mesh position={[31, 0.026, zoneCenterZ]}>
        <boxGeometry args={[44, 0.025, 0.12]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.55} />
      </mesh>
      <mesh position={[9, 0.026, zoneCenterZ]}>
        <boxGeometry args={[0.12, 0.025, zoneDepth]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.55} />
      </mesh>
      <mesh position={[53, 0.026, zoneCenterZ]}>
        <boxGeometry args={[0.12, 0.025, zoneDepth]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.55} />
      </mesh>
      <Text
        position={[31, 0.07, -2.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.56}
        color="#bbf7d0"
        anchorX="center"
      >
        STAGING DINÂMICO · 4 PALLETS POR FILEIRA
      </Text>
    </group>
  )
}

function LargeWarehouseShell() {
  const beamZs = useMemo(
    () => Array.from({ length: 14 }, (_, index) => 20 - index * 14),
    [],
  )
  return (
    <group>
      <mesh position={[0, -0.08, -71.5]} receiveShadow>
        <boxGeometry args={[112, 0.16, 199]} />
        <meshStandardMaterial color="#242d36" roughness={0.97} />
      </mesh>
      <gridHelper
        args={[200, 100, '#334155', '#283746']}
        position={[0, 0.012, -71.5]}
      />
      <mesh position={[0, 0.015, 75]} receiveShadow>
        <boxGeometry args={[112, 0.04, 94]} />
        <meshStandardMaterial color="#374151" roughness={0.98} />
      </mesh>
      {[-5.1, 5.1].map((x) => (
        <mesh key={x} position={[x, 0.045, 75]}>
          <boxGeometry args={[0.12, 0.04, 92]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
      <mesh position={[-56, 5.3, -71.5]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 10.6, 199]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.86} />
      </mesh>
      <mesh position={[56, 5.3, -71.5]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 10.6, 199]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.86} />
      </mesh>
      <mesh position={[0, 5.3, EMPTY_WAREHOUSE_V3.backWallZ]} castShadow receiveShadow>
        <boxGeometry args={[112, 10.6, 0.34]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <DockFront />
      {beamZs.map((z) => (
        <mesh key={z} position={[0, 9.6, z]} castShadow>
          <boxGeometry args={[110.5, 0.18, 0.2]} />
          <meshStandardMaterial color="#475569" metalness={0.58} roughness={0.38} />
        </mesh>
      ))}
      <StagingAndTrafficMarkings />
      <EmptyFiveAisleWarehouse />
    </group>
  )
}

function RealisticV3Hud({
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
          width: 'min(330px, calc(100vw - 24px))',
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
              REALISTA V3 · CD NASCENDO VAZIO
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
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 6,
            marginTop: 9,
          }}
        >
          {[
            ['Lote', String(state.batch).padStart(3, '0')],
            ['Caminhão', String(inTruck)],
            ['Staging', String(staged)],
            ['Ruas', '5'],
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
            <div>Estoque nos racks: 0 pallets</div>
            <div>Transpaleteira: corredor preparado, equipamento futuro</div>
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
              Reiniciar CD vazio
            </button>
          </div>
        )}
      </div>
    </Html>
  )
}

export function RealisticWorldV3({ compact }: { compact: boolean }) {
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
    camera.position.set(compact ? 38 : 48, compact ? 30 : 38, compact ? 56 : 66)
    const controls = get().controls as
      | { target?: THREE.Vector3; update?: () => void }
      | undefined
    controls?.target?.set(0, 2.2, -24)
    controls?.update?.()
    invalidate()
  }, [camera, compact, get, invalidate])

  useLayoutEffect(() => {
    const timer = window.setTimeout(centerCamera, 350)
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
      <group ref={rootRef} name="realistic-v3-root">
        <LargeWarehouseShell />
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
      <RealisticV3Hud state={snapshot} onReset={reset} />
    </>
  )
}
