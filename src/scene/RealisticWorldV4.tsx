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

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

function isRenderable(object: THREE.Object3D) {
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
    const isolate = () => {
      const root = rootRef.current
      if (!root) return
      scene.traverse((object) => {
        if (!isRenderable(object) || isDescendantOf(object, root)) return
        if (!hidden.has(object)) hidden.set(object, object.visible)
        object.visible = false
      })
      invalidate()
    }

    isolate()
    const frame = window.requestAnimationFrame(isolate)
    const timer = window.setTimeout(isolate, 120)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      hidden.forEach((visible, object) => {
        object.visible = visible
      })
      invalidate()
    }
  }, [invalidate, rootRef, scene])

  return null
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
      <mesh position={[0, 1.82, 6.42]} castShadow>
        <boxGeometry args={[4.5, 3.42, 0.16]} />
        <meshStandardMaterial color="#dbe3ec" roughness={0.66} />
      </mesh>
      <mesh position={[0, 1.2, 8.1]} castShadow>
        <boxGeometry args={[3.35, 2.4, 3]} />
        <meshStandardMaterial color="#16a34a" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.7, 9.55]} castShadow>
        <boxGeometry args={[3.05, 1.3, 0.18]} />
        <meshStandardMaterial color="#0f172a" roughness={0.22} />
      </mesh>
      {state.pallets
        .filter((pallet) => pallet.phase === 'truck')
        .map((pallet) => {
          const point = truckPalletPoint(pallet.index)
          return (
            <group
              key={pallet.id}
              position={[point.x, 0.32, point.z - RECEIVING_V2.truckDockZ]}
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

function RackRow({ x }: { x: number }) {
  const start = EMPTY_WAREHOUSE_V3.rackStartZ
  const end = EMPTY_WAREHOUSE_V3.rackEndZ
  const length = Math.abs(end - start)
  const center = (start + end) / 2
  const uprights = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) =>
        start + ((end - start) * index) / 7,
      ),
    [end, start],
  )

  return (
    <group>
      {uprights.map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 3.5, z]} castShadow>
          <boxGeometry args={[1.8, 7, 0.16]} />
          <meshStandardMaterial color="#1f2937" metalness={0.62} roughness={0.38} />
        </mesh>
      ))}
      {[1.55, 3.25, 4.95, 6.65].map((y) => (
        <mesh key={`${x}-${y}`} position={[x, y, center]} castShadow>
          <boxGeometry args={[1.9, 0.16, length]} />
          <meshStandardMaterial color="#f97316" metalness={0.35} roughness={0.48} />
        </mesh>
      ))}
    </group>
  )
}

function DockWall() {
  return (
    <group position={[0, 0, RECEIVING_V2.dockWallZ]}>
      <mesh position={[-31, 4.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[50, 9.5, 0.34]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <mesh position={[31, 4.75, 0]} castShadow receiveShadow>
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
  )
}

function TransferWall() {
  const z = EMPTY_WAREHOUSE_V3.partitionZ
  return (
    <group>
      {[
        { x: -51.05, width: 9.9 },
        { x: -20.35, width: 47.1 },
        { x: 32.6, width: 46.8 },
      ].map((segment) => (
        <mesh key={segment.x} position={[segment.x, 3.4, z]} castShadow>
          <boxGeometry args={[segment.width, 6.8, 0.28]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.84} />
        </mesh>
      ))}
      <mesh position={[EMPTY_WAREHOUSE_V3.pedestrianDoorX, 5.85, z]}>
        <boxGeometry args={[EMPTY_WAREHOUSE_V3.pedestrianDoorWidth, 1.9, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.84} />
      </mesh>
      <mesh position={[EMPTY_WAREHOUSE_V3.transpalletDoorX, 5.6, z]}>
        <boxGeometry args={[EMPTY_WAREHOUSE_V3.transpalletDoorWidth, 2.4, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.84} />
      </mesh>
      <Text
        position={[EMPTY_WAREHOUSE_V3.pedestrianDoorX, 2.1, z + 0.18]}
        fontSize={0.32}
        color="#e2e8f0"
      >
        ENTRADA DE PESSOAS
      </Text>
      <Text
        position={[EMPTY_WAREHOUSE_V3.transpalletDoorX, 2.35, z + 0.18]}
        fontSize={0.38}
        color="#bae6fd"
      >
        PORTA FUTURA · TRANSPALETEIRA
      </Text>
    </group>
  )
}

function FloorMarkings() {
  const first = growingStagingPoint(0)
  const last = growingStagingPoint(
    GROWING_STAGING.columnsPerRow * GROWING_STAGING.rowsPerBank - 1,
  )
  const zoneCenterZ = (first.z + last.z) / 2
  const zoneDepth = Math.abs(last.z - first.z) + 7
  const laneCenterZ =
    (GROWING_STAGING.futureTranspalletEntryZ + GROWING_STAGING.approachZ) / 2
  const laneDepth = Math.abs(
    GROWING_STAGING.futureTranspalletEntryZ - GROWING_STAGING.approachZ,
  )

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
      >
        ÁREA LIVRE DA RX20
      </Text>
      <mesh
        position={[
          GROWING_STAGING.futureTranspalletLaneCenterX,
          0.028,
          laneCenterZ,
        ]}
      >
        <boxGeometry
          args={[GROWING_STAGING.futureTranspalletLaneWidth, 0.035, laneDepth]}
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
        CORREDOR FUTURO · TRANSPALETEIRA
      </Text>
      <mesh position={[31, 0.024, first.z - 2.2]}>
        <boxGeometry args={[44, 0.03, 0.1]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.55} />
      </mesh>
      <mesh position={[31, 0.024, last.z + 2.2]}>
        <boxGeometry args={[44, 0.03, 0.1]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.55} />
      </mesh>
      <mesh position={[9, 0.024, zoneCenterZ]}>
        <boxGeometry args={[0.1, 0.03, zoneDepth]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.55} />
      </mesh>
      <mesh position={[53, 0.024, zoneCenterZ]}>
        <boxGeometry args={[0.1, 0.03, zoneDepth]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.55} />
      </mesh>
      <Text
        position={[31, 0.07, last.z + 3.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.5}
        color="#bbf7d0"
      >
        STAGING DINÂMICO · 4 PALLETS POR FILEIRA
      </Text>
    </group>
  )
}

function Warehouse() {
  const buildingFront = RECEIVING_V2.dockWallZ
  const buildingBack = EMPTY_WAREHOUSE_V3.backWallZ
  const buildingDepth = buildingFront - buildingBack
  const buildingCenter = (buildingFront + buildingBack) / 2
  const yardDepth = 78
  const yardCenter = buildingFront + yardDepth / 2

  return (
    <group>
      <mesh position={[0, -0.08, buildingCenter]} receiveShadow>
        <boxGeometry args={[112, 0.16, buildingDepth]} />
        <meshStandardMaterial color="#242d36" roughness={0.97} />
      </mesh>
      <gridHelper
        args={[150, 75, '#334155', '#283746']}
        position={[0, 0.012, buildingCenter]}
      />
      <mesh position={[0, 0.01, yardCenter]} receiveShadow>
        <boxGeometry args={[112, 0.04, yardDepth]} />
        <meshStandardMaterial color="#374151" roughness={0.98} />
      </mesh>
      {[-5.1, 5.1].map((x) => (
        <mesh key={x} position={[x, 0.045, yardCenter]}>
          <boxGeometry args={[0.12, 0.04, yardDepth - 2]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
      {[-56, 56].map((x) => (
        <mesh key={x} position={[x, 5.3, buildingCenter]} castShadow>
          <boxGeometry args={[0.34, 10.6, buildingDepth]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[0, 5.3, buildingBack]} castShadow>
        <boxGeometry args={[112, 10.6, 0.34]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.84} />
      </mesh>
      <DockWall />
      <TransferWall />
      <FloorMarkings />
      {EMPTY_WAREHOUSE_V3.rackRowXs.map((x) => (
        <RackRow key={x} x={x} />
      ))}
      {EMPTY_WAREHOUSE_V3.aisleNames.map((name, index) => {
        const left = EMPTY_WAREHOUSE_V3.rackRowXs[index]
        const right = EMPTY_WAREHOUSE_V3.rackRowXs[index + 1]
        return (
          <Text
            key={name}
            position={[(left + right) / 2, 0.07, EMPTY_WAREHOUSE_V3.rackStartZ + 3]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.5}
            color="#bae6fd"
          >
            {name}
          </Text>
        )
      })}
      <Text
        position={[0, 8.2, (EMPTY_WAREHOUSE_V3.rackStartZ + EMPTY_WAREHOUSE_V3.rackEndZ) / 2]}
        fontSize={0.92}
        color="#e2e8f0"
      >
        CD REALISTA · 5 RUAS · ESTOQUE INICIAL VAZIO
      </Text>
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
  const [open, setOpen] = useState(false)
  const staged = state.pallets.filter((pallet) => pallet.phase === 'staged').length
  const truck = state.pallets.filter((pallet) => pallet.phase === 'truck').length

  return (
    <Html fullscreen zIndexRange={[80, 50]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 82,
          left: 12,
          width: 'min(330px, calc(100vw - 24px))',
          padding: '10px 12px',
          borderRadius: 12,
          border: `1px solid ${state.fault ? '#ef4444' : '#22c55e'}`,
          background: 'rgba(7,17,31,.92)',
          color: '#f8fafc',
          fontFamily: 'system-ui,sans-serif',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <strong style={{ display: 'block', fontSize: 12 }}>
              REALISTA V4 · RECEBIMENTO CRESCENTE
            </strong>
            <span style={{ fontSize: 10, color: '#bbf7d0' }}>{state.label}</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            style={{
              border: '1px solid #475569',
              borderRadius: 7,
              background: '#111827',
              color: '#e2e8f0',
              padding: '5px 7px',
              fontSize: 9,
            }}
          >
            {open ? 'Fechar' : 'Diagnóstico'}
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4,1fr)',
            gap: 6,
            marginTop: 9,
          }}
        >
          {[
            ['Lote', String(state.batch).padStart(3, '0')],
            ['Caminhão', String(truck)],
            ['Staging', String(staged)],
            ['Racks', '0'],
          ].map(([label, value]) => (
            <div key={label} style={{ background: '#172033', borderRadius: 7, padding: 6 }}>
              <span style={{ display: 'block', fontSize: 8, color: '#94a3b8' }}>{label}</span>
              <strong style={{ fontSize: 13 }}>{value}</strong>
            </div>
          ))}
        </div>
        {open && (
          <div style={{ marginTop: 8, fontSize: 9, lineHeight: 1.45, color: '#cbd5e1' }}>
            <div>RX20: {state.forklift.phase}</div>
            <div>Velocidade: {state.forklift.speed.toFixed(2)} m/s</div>
            <div>Caminhões concluídos: {state.completedTrucks}</div>
            <div>Ruas vazias: 5</div>
            <div>Transpaleteira: corredor e porta preparados</div>
            <div>Falha: {state.fault ?? 'nenhuma'}</div>
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
              Reiniciar vazio
            </button>
          </div>
        )}
      </div>
    </Html>
  )
}

export function RealisticWorldV4({ compact }: { compact: boolean }) {
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
    controls?.target?.set(0, 2.2, -18)
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
      <group ref={rootRef} name="realistic-v4-root">
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
      <Hud state={snapshot} reset={reset} />
    </>
  )
}
