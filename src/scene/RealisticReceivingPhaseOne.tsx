import { Html, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import {
  buildReceivingCellGeometry,
  RECEIVING_PALLETS_PER_TRUCK,
  type ReceivingForkliftPhase,
} from '../domain/realisticReceivingPhaseOne'
import type { WorldPoint } from '../domain/routePlanning'
import { TRAVEL_FORK_HEIGHT } from '../domain/warehouseGeometry'
import { ForkliftModel } from './ForkliftModel'

const RX_SPEED = 3.1
const RX_REVERSE_SPEED = 2.15
const RX_TURN_SPEED = 2.6
const TRUCK_SPEED = 14
const HANDLING_SECONDS = 0.65
const GAP_BETWEEN_TRUCKS_SECONDS = 1
const PALLET_HEIGHT = 0.16
const LOAD_HEIGHT = 0.86

interface PalletState {
  id: string
  status: 'truck' | 'carried' | 'staged'
  position: WorldPoint
  color: string
}

type TruckPhase = 'docked' | 'leaving' | 'gap' | 'arriving'

const COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee']

function distance2d(left: WorldPoint, right: WorldPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function moveObjectToward(
  object: THREE.Object3D,
  target: WorldPoint,
  speed: number,
  delta: number,
): boolean {
  const dx = target.x - object.position.x
  const dz = target.z - object.position.z
  const distance = Math.hypot(dx, dz)
  if (distance <= 0.035) {
    object.position.set(target.x, object.position.y, target.z)
    return true
  }
  const step = Math.min(distance, speed * delta)
  object.position.x += (dx / distance) * step
  object.position.z += (dz / distance) * step
  return step >= distance - 0.001
}

function rotateToward(
  object: THREE.Object3D,
  target: number,
  delta: number,
): boolean {
  const current = object.rotation.y
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  if (Math.abs(difference) <= 0.025) {
    object.rotation.y = target
    return true
  }
  object.rotation.y += THREE.MathUtils.clamp(
    difference,
    -RX_TURN_SPEED * delta,
    RX_TURN_SPEED * delta,
  )
  return false
}

function facingForTravel(from: WorldPoint, to: WorldPoint): number {
  const direction = Math.atan2(to.x - from.x, to.z - from.z)
  return direction + Math.PI
}

function createBatch(
  batch: number,
  truckPoints: WorldPoint[],
): PalletState[] {
  return truckPoints.map((position, index) => ({
    id: `REC-${String(batch).padStart(3, '0')}-${index + 1}`,
    status: 'truck',
    position,
    color: COLORS[index % COLORS.length],
  }))
}

function PalletLoad({ pallet }: { pallet: PalletState }) {
  return (
    <group position={[pallet.position.x, pallet.position.y, pallet.position.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.45, PALLET_HEIGHT, 0.92]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </mesh>
      <mesh position={[0, PALLET_HEIGHT / 2 + LOAD_HEIGHT / 2 + 0.025, 0]} castShadow>
        <boxGeometry args={[1.34, LOAD_HEIGHT, 0.82]} />
        <meshStandardMaterial color={pallet.color} roughness={0.64} />
      </mesh>
    </group>
  )
}

function ReceivingTruck({
  groupRef,
  center,
  pallets,
}: {
  groupRef: React.MutableRefObject<THREE.Group | null>
  center: WorldPoint
  pallets: PalletState[]
}) {
  return (
    <group ref={groupRef} position={[center.x, 0, center.z]}>
      <mesh position={[0, 1.75, 0.8]} castShadow receiveShadow>
        <boxGeometry args={[3.8, 3.45, 12.4]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.16} roughness={0.56} />
      </mesh>
      <mesh position={[0, 1.78, -5.45]}>
        <boxGeometry args={[3.45, 2.95, 0.08]} />
        <meshStandardMaterial color="#dbeafe" transparent opacity={0.12} />
      </mesh>
      <mesh position={[0, 0.42, 7.3]} castShadow>
        <boxGeometry args={[3.25, 1.35, 2.1]} />
        <meshStandardMaterial color="#16a34a" roughness={0.48} />
      </mesh>
      <mesh position={[0, 1.45, 7.65]} castShadow>
        <boxGeometry args={[3.05, 1.55, 1.45]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.52} />
      </mesh>
      {[-1.45, 1.45].flatMap((x) =>
        [-3.5, 3.7, 7.2].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.42, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.42, 0.42, 0.28, 16]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
        )),
      )}
      {pallets
        .filter((pallet) => pallet.status === 'truck')
        .map((pallet) => (
          <group
            key={pallet.id}
            position={[
              pallet.position.x - center.x,
              pallet.position.y,
              pallet.position.z - center.z,
            ]}
          >
            <mesh castShadow>
              <boxGeometry args={[1.45, PALLET_HEIGHT, 0.92]} />
              <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
            </mesh>
            <mesh position={[0, PALLET_HEIGHT / 2 + LOAD_HEIGHT / 2 + 0.025, 0]} castShadow>
              <boxGeometry args={[1.34, LOAD_HEIGHT, 0.82]} />
              <meshStandardMaterial color={pallet.color} roughness={0.64} />
            </mesh>
          </group>
        ))}
    </group>
  )
}

function ReceivingFloor({ geometry }: { geometry: ReturnType<typeof buildReceivingCellGeometry> }) {
  return (
    <group>
      <mesh position={[geometry.dockX, 0.018, geometry.mouthZ - 7]} receiveShadow>
        <boxGeometry args={[30, 0.035, 27]} />
        <meshStandardMaterial color="#1f2937" roughness={0.96} />
      </mesh>
      <mesh position={[geometry.dockX, 0.045, geometry.mouthZ - 14.25]}>
        <boxGeometry args={[16, 0.04, 8]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.23} />
      </mesh>
      <Text
        position={[geometry.dockX, 0.08, geometry.mouthZ - 14.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.52}
        color="#dcfce7"
      >
        ÁREA DE DESCARGA · 6 POSIÇÕES
      </Text>
      {geometry.stagingSlots.map((slot, index) => (
        <group key={`stage-${index + 1}`} position={[slot.x, 0.07, slot.z]}>
          <mesh>
            <boxGeometry args={[2.2, 0.045, 1.65]} />
            <meshStandardMaterial color="#16a34a" transparent opacity={0.42} />
          </mesh>
          <Text rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} fontSize={0.28} color="#fff">
            D{index + 1}
          </Text>
        </group>
      ))}
      <mesh position={[geometry.dockX, 0.06, geometry.mouthZ - 5.4]}>
        <ringGeometry args={[2.4, 2.7, 32]} />
        <meshStandardMaterial color="#f59e0b" side={THREE.DoubleSide} />
      </mesh>
      <Text
        position={[geometry.dockX, 0.08, geometry.mouthZ - 5.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.34}
        color="#fef3c7"
      >
        GIRAR SOMENTE APÓS SAIR
      </Text>
    </group>
  )
}

export function RealisticReceivingPhaseOne({ layout }: { layout: WarehouseLayout }) {
  const geometry = useMemo(() => buildReceivingCellGeometry(layout), [layout])
  const forkliftRef = useRef<THREE.Group | null>(null)
  const carriageRef = useRef<THREE.Group | null>(null)
  const truckRef = useRef<THREE.Group | null>(null)
  const phaseRef = useRef<ReceivingForkliftPhase>('waiting-truck')
  const truckPhaseRef = useRef<TruckPhase>('docked')
  const timerRef = useRef(0)
  const batchRef = useRef(1)
  const palletIndexRef = useRef(0)
  const targetStageRef = useRef(0)
  const [phaseLabel, setPhaseLabel] = useState('CAMINHÃO DOCKADO · INICIANDO DESCARGA')
  const [truckPhase, setTruckPhase] = useState<TruckPhase>('docked')
  const [pallets, setPallets] = useState<PalletState[]>(() =>
    createBatch(1, geometry.truckPallets),
  )
  const palletsRef = useRef(pallets)
  const { invalidate } = useThree()

  const setPalletState = (updater: (current: PalletState[]) => PalletState[]) => {
    setPallets((current) => {
      const next = updater(current)
      palletsRef.current = next
      return next
    })
  }

  const setPhase = (phase: ReceivingForkliftPhase, label: string) => {
    phaseRef.current = phase
    timerRef.current = 0
    setPhaseLabel(label)
  }

  useFrame((_, delta) => {
    const forklift = forkliftRef.current
    const carriage = carriageRef.current
    const truck = truckRef.current
    if (!forklift || !carriage || !truck) return

    if (forklift.position.lengthSq() === 0) {
      forklift.position.set(geometry.forkliftHome.x, 0.18, geometry.forkliftHome.z)
      forklift.rotation.y = Math.PI
      carriage.position.y = TRAVEL_FORK_HEIGHT
    }

    timerRef.current += delta

    if (truckPhaseRef.current === 'leaving') {
      truck.position.z += TRUCK_SPEED * delta
      if (truck.position.z >= geometry.truckSpawn.z) {
        truckPhaseRef.current = 'gap'
        setTruckPhase('gap')
        timerRef.current = 0
        truck.visible = false
        setPalletState(() => [])
      }
      invalidate()
      return
    }

    if (truckPhaseRef.current === 'gap') {
      if (timerRef.current >= GAP_BETWEEN_TRUCKS_SECONDS) {
        batchRef.current += 1
        palletIndexRef.current = 0
        targetStageRef.current = 0
        const nextBatch = createBatch(batchRef.current, geometry.truckPallets)
        setPalletState(() => nextBatch)
        truck.position.set(geometry.truckSpawn.x, 0, geometry.truckSpawn.z)
        truck.visible = true
        truckPhaseRef.current = 'arriving'
        setTruckPhase('arriving')
        timerRef.current = 0
        setPhaseLabel('NOVO CAMINHÃO CHEGANDO COM 6 PALLETS')
      }
      invalidate()
      return
    }

    if (truckPhaseRef.current === 'arriving') {
      truck.position.z -= TRUCK_SPEED * delta
      if (truck.position.z <= geometry.truckCenter.z) {
        truck.position.z = geometry.truckCenter.z
        truckPhaseRef.current = 'docked'
        setTruckPhase('docked')
        setPhase('go-to-lane', 'RX20 INDO PARA A FAIXA DE ALINHAMENTO')
      }
      invalidate()
      return
    }

    const currentPallet = palletsRef.current[palletIndexRef.current]
    if (!currentPallet) {
      if (distance2d(
        { x: forklift.position.x, y: 0.2, z: forklift.position.z },
        geometry.forkliftHome,
      ) < 0.2) {
        truckPhaseRef.current = 'leaving'
        setTruckPhase('leaving')
        timerRef.current = 0
        setPhase('waiting-truck', 'CAMINHÃO VAZIO SAINDO')
      } else {
        const targetFacing = facingForTravel(
          { x: forklift.position.x, y: 0.2, z: forklift.position.z },
          geometry.forkliftHome,
        )
        rotateToward(forklift, targetFacing, delta)
        moveObjectToward(forklift, geometry.forkliftHome, RX_SPEED, delta)
      }
      invalidate()
      return
    }

    const pickupLane = {
      x: currentPallet.position.x,
      y: 0.2,
      z: geometry.mouthZ - 2.2,
    }
    const pickupPoint = {
      x: currentPallet.position.x,
      y: 0.2,
      z: currentPallet.position.z - 1.5,
    }
    const stage = geometry.stagingSlots[targetStageRef.current]
    const stageApproach = { x: stage.x, y: 0.2, z: stage.z + 2.1 }
    const phase = phaseRef.current

    if (phase === 'waiting-truck') {
      setPhase('go-to-lane', 'RX20 INDO PARA A FAIXA DE ALINHAMENTO')
    } else if (phase === 'go-to-lane') {
      const targetFacing = facingForTravel(
        { x: forklift.position.x, y: 0.2, z: forklift.position.z },
        pickupLane,
      )
      rotateToward(forklift, targetFacing, delta)
      if (moveObjectToward(forklift, pickupLane, RX_SPEED, delta)) {
        setPhase('align-at-mouth', 'ALINHANDO RETO COM A BOCA DO CAMINHÃO')
      }
    } else if (phase === 'align-at-mouth') {
      if (rotateToward(forklift, Math.PI, delta)) {
        setPhase('enter-trailer', 'ENTRANDO RETO NO CAMINHÃO')
      }
    } else if (phase === 'enter-trailer') {
      if (moveObjectToward(forklift, pickupPoint, RX_REVERSE_SPEED, delta)) {
        setPhase('pick-pallet', 'PEGANDO UM PALLET')
      }
    } else if (phase === 'pick-pallet') {
      carriage.position.y = THREE.MathUtils.damp(
        carriage.position.y,
        0.62,
        6,
        delta,
      )
      if (timerRef.current >= HANDLING_SECONDS) {
        setPalletState((current) =>
          current.map((pallet, index) =>
            index === palletIndexRef.current
              ? { ...pallet, status: 'carried' }
              : pallet,
          ),
        )
        setPhase('reverse-out', 'SAINDO DE RÉ SEM GIRAR DENTRO DA CARROCERIA')
      }
    } else if (phase === 'reverse-out') {
      if (moveObjectToward(forklift, pickupLane, RX_REVERSE_SPEED, delta)) {
        setPhase('clear-trailer', 'RECUANDO ATÉ LIBERAR TOTALMENTE O CAMINHÃO')
      }
    } else if (phase === 'clear-trailer') {
      if (moveObjectToward(forklift, geometry.clearPoint, RX_REVERSE_SPEED, delta)) {
        setPhase('turn-to-staging', 'ÁREA LIVRE · GIRANDO PARA A DESCARGA')
      }
    } else if (phase === 'turn-to-staging') {
      const targetFacing = facingForTravel(geometry.clearPoint, stageApproach)
      if (rotateToward(forklift, targetFacing, delta)) {
        setPhase('go-to-staging', `LEVANDO PALLET PARA D${targetStageRef.current + 1}`)
      }
    } else if (phase === 'go-to-staging') {
      if (moveObjectToward(forklift, stageApproach, RX_SPEED, delta)) {
        const facing = facingForTravel(stageApproach, stage)
        rotateToward(forklift, facing, delta)
        if (moveObjectToward(forklift, stage, 1.25, delta)) {
          setPhase('drop-pallet', `DEPOSITANDO NO SLOT D${targetStageRef.current + 1}`)
        }
      }
    } else if (phase === 'drop-pallet') {
      carriage.position.y = THREE.MathUtils.damp(
        carriage.position.y,
        TRAVEL_FORK_HEIGHT,
        6,
        delta,
      )
      if (timerRef.current >= HANDLING_SECONDS) {
        setPalletState((current) =>
          current.map((pallet, index) =>
            index === palletIndexRef.current
              ? { ...pallet, status: 'staged', position: stage }
              : pallet,
          ),
        )
        setPhase('reverse-from-staging', 'RECUANDO DO PALLET SEM ATRAVESSÁ-LO')
      }
    } else if (phase === 'reverse-from-staging') {
      if (moveObjectToward(forklift, stageApproach, RX_REVERSE_SPEED, delta)) {
        palletIndexRef.current += 1
        targetStageRef.current += 1
        if (palletIndexRef.current >= RECEIVING_PALLETS_PER_TRUCK) {
          setPhase('return-home', 'SEIS PALLETS DESCARREGADOS · RETORNANDO À VAGA')
        } else {
          setPhase('go-to-lane', 'BUSCANDO O PRÓXIMO PALLET')
        }
      }
    } else if (phase === 'return-home') {
      const targetFacing = facingForTravel(
        { x: forklift.position.x, y: 0.2, z: forklift.position.z },
        geometry.forkliftHome,
      )
      rotateToward(forklift, targetFacing, delta)
      if (moveObjectToward(forklift, geometry.forkliftHome, RX_SPEED, delta)) {
        setPhase('waiting-truck', 'DESCARGA CONCLUÍDA · LIBERANDO CAMINHÃO')
      }
    }

    invalidate()
  })

  const carried = pallets.find((pallet) => pallet.status === 'carried')

  return (
    <group>
      <ReceivingFloor geometry={geometry} />
      <ReceivingTruck
        groupRef={truckRef}
        center={geometry.truckCenter}
        pallets={pallets}
      />

      {pallets
        .filter((pallet) => pallet.status === 'staged')
        .map((pallet) => <PalletLoad key={pallet.id} pallet={pallet} />)}

      <group ref={forkliftRef}>
        <Html
          position={[0, 3.1, 0]}
          center
          distanceFactor={16}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div
            style={{
              minWidth: 210,
              borderRadius: 9,
              border: '1px solid #22c55e',
              background: 'rgba(15,23,42,.92)',
              color: '#f8fafc',
              padding: '8px 11px',
              textAlign: 'center',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            <strong style={{ display: 'block', fontSize: 12 }}>
              RX 20-20 · RECEBIMENTO
            </strong>
            <span style={{ display: 'block', marginTop: 3, fontSize: 9, color: '#bbf7d0' }}>
              {phaseLabel}
            </span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 8, color: '#94a3b8' }}>
              CAMINHÃO: {truckPhase.toUpperCase()}
            </span>
          </div>
        </Html>
        <ForkliftModel
          carriageRef={carriageRef}
          mastHeight={3.2}
          compact={false}
          cargoVisible={Boolean(carried)}
          cargoColor={carried?.color ?? '#38bdf8'}
          reportRuntimePose={false}
          accent="#16a34a"
        />
      </group>
    </group>
  )
}
