import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { FORK_THICKNESS, TRAVEL_FORK_HEIGHT } from '../domain/warehouseGeometry'
import { setOperationalVehicleRuntimePose } from '../store/operationalVehicleRuntime'

interface ForkliftModelProps {
  carriageRef?: MutableRefObject<THREE.Group | null>
  mastHeight?: number
  cargoVisible?: boolean
  cargoColor?: string
  compact?: boolean
  reportRuntimePose?: boolean
  accent?: string
  emergencyBraking?: boolean
  faulted?: boolean
}

const WORLD_POSITION = new THREE.Vector3()
const WORLD_QUATERNION = new THREE.Quaternion()
const WORLD_EULER = new THREE.Euler(0, 0, 0, 'YXZ')

export function ForkliftModel({
  carriageRef,
  mastHeight = 2.4,
  cargoVisible = false,
  cargoColor = '#38bdf8',
  compact = false,
  reportRuntimePose = true,
  accent = '#f59e0b',
  emergencyBraking = false,
  faulted = false,
}: ForkliftModelProps) {
  const rootRef = useRef<THREE.Group | null>(null)
  const internalCarriageRef = useRef<THREE.Group | null>(null)
  const resolvedCarriageRef = carriageRef ?? internalCarriageRef
  const wheelSegments = compact ? 10 : 16

  useFrame(() => {
    const root = rootRef.current
    if (!reportRuntimePose || !root || !root.visible) return

    root.getWorldPosition(WORLD_POSITION)
    root.getWorldQuaternion(WORLD_QUATERNION)
    WORLD_EULER.setFromQuaternion(WORLD_QUATERNION, 'YXZ')
    setOperationalVehicleRuntimePose(
      { x: WORLD_POSITION.x, y: 0.2, z: WORLD_POSITION.z },
      WORLD_EULER.y,
      'EMP-01 em execução',
    )
  })

  return (
    <group ref={rootRef}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.15, 0.65, 1.6]} />
        <meshStandardMaterial color={accent} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.95, 0.15]} castShadow>
        <boxGeometry args={[0.85, 0.75, 0.9]} />
        <meshStandardMaterial color="#1f2937" roughness={0.45} />
      </mesh>

      {[-0.48, 0.48].flatMap((x) =>
        [-0.48, 0.58].map((z) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, 0.16, z]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.19, 0.19, 0.16, wheelSegments]} />
            <meshStandardMaterial color="#111827" roughness={0.92} />
          </mesh>
        )),
      )}

      {[-0.38, 0.38].map((x) => (
        <mesh key={`brake-${x}`} position={[x, 0.43, 0.82]}>
          <boxGeometry args={[0.16, 0.12, 0.05]} />
          <meshStandardMaterial
            color={emergencyBraking || faulted ? '#ef4444' : '#450a0a'}
            emissive={emergencyBraking || faulted ? '#ef4444' : '#000000'}
            emissiveIntensity={emergencyBraking || faulted ? 3 : 0}
            roughness={0.4}
          />
        </mesh>
      ))}

      {faulted && (
        <mesh position={[0, 1.43, 0.16]}>
          <cylinderGeometry args={[0.12, 0.12, 0.18, compact ? 8 : 12]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#f59e0b"
            emissiveIntensity={2.6}
          />
        </mesh>
      )}

      <mesh position={[-0.34, mastHeight / 2, -0.88]} castShadow>
        <boxGeometry args={[0.12, mastHeight, 0.12]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.34, mastHeight / 2, -0.88]} castShadow>
        <boxGeometry args={[0.12, mastHeight, 0.12]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>

      <group ref={resolvedCarriageRef} position={[0, TRAVEL_FORK_HEIGHT, -0.9]}>
        <mesh position={[-0.28, 0, -0.65]} castShadow>
          <boxGeometry args={[0.12, FORK_THICKNESS, 1.35]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0.28, 0, -0.65]} castShadow>
          <boxGeometry args={[0.12, FORK_THICKNESS, 1.35]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
        </mesh>
        {cargoVisible && (
          <group position={[0, FORK_THICKNESS / 2 + 0.1, -0.72]}>
            <mesh castShadow>
              <boxGeometry args={[1.02, 0.12, 0.92]} />
              <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
            </mesh>
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[0.94, 0.82, 0.84]} />
              <meshStandardMaterial color={cargoColor} roughness={0.68} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  )
}
