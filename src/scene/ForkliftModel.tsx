import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import {
  FORK_THICKNESS,
  TRAVEL_FORK_HEIGHT,
} from '../domain/warehouseGeometry'
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

function Wheel({
  x,
  z,
  radius,
  width,
  segments,
}: {
  x: number
  z: number
  radius: number
  width: number
  segments: number
}) {
  return (
    <group position={[x, radius, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius, radius, width, segments]} />
        <meshStandardMaterial color="#111827" roughness={0.92} />
      </mesh>
      <mesh
        position={[x > 0 ? width / 2 + 0.006 : -width / 2 - 0.006, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry
          args={[radius * 0.46, radius * 0.46, 0.025, segments]}
        />
        <meshStandardMaterial
          color="#64748b"
          metalness={0.72}
          roughness={0.35}
        />
      </mesh>
    </group>
  )
}

export function ForkliftModel({
  carriageRef,
  mastHeight = 2.4,
  cargoVisible = false,
  cargoColor = '#38bdf8',
  compact = false,
  reportRuntimePose = true,
  accent = '#f97316',
  emergencyBraking = false,
  faulted = false,
}: ForkliftModelProps) {
  const rootRef = useRef<THREE.Group | null>(null)
  const internalCarriageRef = useRef<THREE.Group | null>(null)
  const resolvedCarriageRef = carriageRef ?? internalCarriageRef
  const wheelSegments = compact ? 10 : 18
  const guardHeight = compact ? 1.82 : 1.94

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
      {/* Chassi e carroceria contrabalançada. A frente da máquina aponta para -Z. */}
      <mesh position={[0, 0.3, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[1.26, 0.38, 1.62]} />
        <meshStandardMaterial color="#dbe3ea" metalness={0.18} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.5, 0.48]} castShadow>
        <boxGeometry args={[1.18, 0.72, 0.7]} />
        <meshStandardMaterial color={accent} metalness={0.08} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.72, 0.05]} castShadow>
        <boxGeometry args={[0.92, 0.22, 0.72]} />
        <meshStandardMaterial color="#334155" roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.93, 0.34]} castShadow>
        <boxGeometry args={[0.52, 0.18, 0.42]} />
        <meshStandardMaterial color="#111827" roughness={0.76} />
      </mesh>
      <mesh position={[0, 1.09, 0.33]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.14]} />
        <meshStandardMaterial color="#1f2937" roughness={0.72} />
      </mesh>

      {/* Coluna e volante. */}
      <mesh position={[0.22, 1.03, -0.05]} rotation={[0.48, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.5, compact ? 8 : 12]} />
        <meshStandardMaterial color="#111827" metalness={0.38} roughness={0.5} />
      </mesh>
      <mesh
        position={[0.22, 1.25, -0.17]}
        rotation={[Math.PI / 2.2, 0, 0]}
      >
        <torusGeometry args={[0.15, 0.025, compact ? 6 : 10, compact ? 12 : 20]} />
        <meshStandardMaterial color="#111827" roughness={0.68} />
      </mesh>

      {/* Estrutura de proteção da cabine. */}
      {[-0.48, 0.48].flatMap((x) =>
        [-0.35, 0.55].map((z) => (
          <mesh key={`guard-${x}-${z}`} position={[x, guardHeight / 2, z]}>
            <boxGeometry args={[0.065, guardHeight, 0.065]} />
            <meshStandardMaterial
              color="#273449"
              metalness={0.62}
              roughness={0.38}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, guardHeight, 0.1]} castShadow>
        <boxGeometry args={[1.08, 0.1, 1.05]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.16} roughness={0.52} />
      </mesh>
      <mesh position={[0, 1.5, -0.37]}>
        <boxGeometry args={[0.94, 0.62, 0.035]} />
        <meshStandardMaterial
          color="#93c5fd"
          transparent
          opacity={0.2}
          metalness={0.08}
          roughness={0.18}
        />
      </mesh>

      {/* Rodas dianteiras maiores e traseiras menores. */}
      <Wheel
        x={-0.59}
        z={-0.48}
        radius={0.29}
        width={0.19}
        segments={wheelSegments}
      />
      <Wheel
        x={0.59}
        z={-0.48}
        radius={0.29}
        width={0.19}
        segments={wheelSegments}
      />
      <Wheel
        x={-0.55}
        z={0.57}
        radius={0.23}
        width={0.17}
        segments={wheelSegments}
      />
      <Wheel
        x={0.55}
        z={0.57}
        radius={0.23}
        width={0.17}
        segments={wheelSegments}
      />

      {/* Faróis e luzes traseiras. */}
      {[-0.4, 0.4].map((x) => (
        <mesh key={`head-${x}`} position={[x, 1.57, -0.43]}>
          <boxGeometry args={[0.14, 0.1, 0.045]} />
          <meshStandardMaterial
            color="#f8fafc"
            emissive="#dbeafe"
            emissiveIntensity={1.25}
            roughness={0.28}
          />
        </mesh>
      ))}
      {[-0.39, 0.39].map((x) => (
        <mesh key={`brake-${x}`} position={[x, 0.56, 0.86]}>
          <boxGeometry args={[0.15, 0.11, 0.045]} />
          <meshStandardMaterial
            color={emergencyBraking || faulted ? '#ef4444' : '#450a0a'}
            emissive={emergencyBraking || faulted ? '#ef4444' : '#000000'}
            emissiveIntensity={emergencyBraking || faulted ? 3 : 0}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Giroflex permanece visível; em avaria fica intensamente emissivo. */}
      <mesh position={[0, guardHeight + 0.13, 0.35]}>
        <cylinderGeometry args={[0.09, 0.11, 0.17, compact ? 8 : 14]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#f59e0b"
          emissiveIntensity={faulted ? 3.1 : 0.7}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* Mastro duplo, travessas e cilindro central. */}
      {[-0.38, 0.38].map((x) => (
        <mesh key={`mast-${x}`} position={[x, mastHeight / 2, -0.92]} castShadow>
          <boxGeometry args={[0.12, mastHeight, 0.13]} />
          <meshStandardMaterial color="#263244" metalness={0.68} roughness={0.34} />
        </mesh>
      ))}
      {[0.48, Math.max(0.8, mastHeight * 0.5), mastHeight - 0.16].map((y) => (
        <mesh key={`mast-cross-${y}`} position={[0, y, -0.92]}>
          <boxGeometry args={[0.86, 0.09, 0.11]} />
          <meshStandardMaterial color="#334155" metalness={0.62} roughness={0.38} />
        </mesh>
      ))}
      <mesh position={[0, Math.max(0.7, mastHeight / 2), -0.9]}>
        <cylinderGeometry args={[0.045, 0.045, Math.max(1, mastHeight - 0.35), 10]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.78} roughness={0.3} />
      </mesh>

      <group
        ref={resolvedCarriageRef}
        position={[0, TRAVEL_FORK_HEIGHT, -0.94]}
      >
        <mesh position={[0, 0.18, -0.02]} castShadow>
          <boxGeometry args={[0.86, 0.42, 0.09]} />
          <meshStandardMaterial color="#334155" metalness={0.68} roughness={0.35} />
        </mesh>
        {[-0.29, 0.29].map((x) => (
          <mesh key={`fork-${x}`} position={[x, 0, -0.69]} castShadow>
            <boxGeometry args={[0.12, FORK_THICKNESS, 1.42]} />
            <meshStandardMaterial color="#475569" metalness={0.74} roughness={0.3} />
          </mesh>
        ))}
        {cargoVisible && (
          <group position={[0, FORK_THICKNESS / 2 + 0.1, -0.75]}>
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
