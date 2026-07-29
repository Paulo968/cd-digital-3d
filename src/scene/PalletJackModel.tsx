import { useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { FORK_THICKNESS, TRAVEL_FORK_HEIGHT } from '../domain/warehouseGeometry'

interface PalletJackModelProps {
  carriageRef?: MutableRefObject<THREE.Group | null>
  cargoVisible?: boolean
  cargoColor?: string
  compact?: boolean
  accent?: string
}

export function PalletJackModel({
  carriageRef,
  cargoVisible = false,
  cargoColor = '#38bdf8',
  compact = false,
  accent = '#0ea5e9',
}: PalletJackModelProps) {
  const internalCarriageRef = useRef<THREE.Group | null>(null)
  const resolvedCarriageRef = carriageRef ?? internalCarriageRef
  const wheelSegments = compact ? 8 : 12

  return (
    <group>
      <mesh position={[0, 0.22, 0.42]} castShadow>
        <boxGeometry args={[0.72, 0.28, 0.74]} />
        <meshStandardMaterial color={accent} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.75, 0.67]} rotation={[0.18, 0, 0]} castShadow>
        <boxGeometry args={[0.16, 1.05, 0.16]} />
        <meshStandardMaterial color="#334155" metalness={0.45} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.27, 0.78]} rotation={[0.22, 0, 0]} castShadow>
        <boxGeometry args={[0.72, 0.1, 0.1]} />
        <meshStandardMaterial color="#111827" roughness={0.76} />
      </mesh>

      {[-0.28, 0.28].map((x) => (
        <mesh
          key={`drive-${x}`}
          position={[x, 0.12, 0.45]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.13, 0.13, 0.12, wheelSegments]} />
          <meshStandardMaterial color="#111827" roughness={0.92} />
        </mesh>
      ))}

      <group ref={resolvedCarriageRef} position={[0, TRAVEL_FORK_HEIGHT, -0.3]}>
        {[-0.25, 0.25].map((x) => (
          <group key={`fork-${x}`}>
            <mesh position={[x, 0, -0.68]} castShadow>
              <boxGeometry args={[0.11, FORK_THICKNESS, 1.45]} />
              <meshStandardMaterial color="#475569" metalness={0.68} roughness={0.34} />
            </mesh>
            <mesh
              position={[x, -0.01, -1.31]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.07, 0.07, 0.09, wheelSegments]} />
              <meshStandardMaterial color="#111827" roughness={0.92} />
            </mesh>
          </group>
        ))}

        {cargoVisible && (
          <group position={[0, FORK_THICKNESS / 2 + 0.1, -0.73]}>
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
