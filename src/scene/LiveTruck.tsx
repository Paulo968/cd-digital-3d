import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  completeTruckCycle,
  useOperationsControlStore,
} from '../store/operationsControlStore'

interface LiveTruckProps {
  x: number
  dockZ: number
  compact: boolean
}

function TruckModel({
  accent,
  compact,
  closed,
}: {
  accent: string
  compact: boolean
  closed: boolean
}) {
  const wheelSegments = compact ? 10 : 16
  return (
    <group>
      <mesh position={[0, 0.35, -1.65]} receiveShadow castShadow>
        <boxGeometry args={[2.75, 0.16, 6.7]} />
        <meshStandardMaterial color="#64748b" metalness={0.22} roughness={0.7} />
      </mesh>
      {[-1.32, 1.32].map((sideX) => (
        <mesh key={sideX} position={[sideX, 1.65, -1.65]} castShadow>
          <boxGeometry args={[0.12, 2.6, 6.7]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.12} roughness={0.64} />
        </mesh>
      ))}
      <mesh position={[0, 2.95, -1.65]} castShadow>
        <boxGeometry args={[2.75, 0.14, 6.7]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.12} roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.65, 1.65]} castShadow>
        <boxGeometry args={[2.75, 2.6, 0.12]} />
        <meshStandardMaterial color="#dbe3ec" metalness={0.12} roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.18, 2.75]} castShadow>
        <boxGeometry args={[2.6, 2.35, 2.25]} />
        <meshStandardMaterial color={accent} metalness={0.2} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.55, 3.9]} castShadow>
        <boxGeometry args={[2.35, 1.3, 0.24]} />
        <meshStandardMaterial color="#0f172a" metalness={0.35} roughness={0.2} />
      </mesh>
      {[-1.05, 1.05].flatMap((wheelX) =>
        [-3.6, -0.8, 2.85].map((wheelZ) => (
          <mesh
            key={`${wheelX}-${wheelZ}`}
            position={[wheelX, 0.42, wheelZ]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.42, 0.42, 0.24, wheelSegments]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
        )),
      )}
      <mesh position={[-0.82, 0.74, -5.02]}>
        <boxGeometry args={[0.36, 0.18, 0.08]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={closed ? 1.8 : 0.35}
        />
      </mesh>
      <mesh position={[0.82, 0.74, -5.02]}>
        <boxGeometry args={[0.36, 0.18, 0.08]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={closed ? 1.8 : 0.35}
        />
      </mesh>
      {closed && (
        <mesh position={[0, 1.62, -5.04]} castShadow>
          <boxGeometry args={[2.55, 2.45, 0.12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.28} roughness={0.58} />
        </mesh>
      )}
    </group>
  )
}

export function LiveTruck({ x, dockZ, compact }: LiveTruckProps) {
  const rootRef = useRef<THREE.Group | null>(null)
  const progressRef = useRef(0)
  const waitRef = useRef(0)
  const phase = useOperationsControlStore((state) => state.truck.phase)
  const cycle = useOperationsControlStore((state) => state.truck.cycle)
  const queue = useOperationsControlStore((state) => state.truck.queue)
  const setTruckPhase = useOperationsControlStore((state) => state.setTruckPhase)
  const { invalidate } = useThree()

  // A operação e a geometria lógica são iguais em qualquer dispositivo.
  // O modo compacto reduz somente a quantidade de segmentos das rodas.
  const farZ = dockZ + 20

  useEffect(() => {
    const root = rootRef.current
    progressRef.current = 0
    waitRef.current = 0
    if (!root) return
    if (phase === 'docked' || phase === 'closing' || phase === 'departing') {
      root.position.set(x, 0.15, dockZ)
    } else if (phase === 'approaching' || phase === 'away') {
      root.position.set(x, 0.15, farZ)
    }
    invalidate()
  }, [cycle, dockZ, farZ, invalidate, phase, x])

  useFrame((_, delta) => {
    const root = rootRef.current
    if (!root) return

    if (phase === 'closing') {
      progressRef.current += delta
      if (progressRef.current >= 1.25) {
        setTruckPhase('departing')
      } else {
        invalidate()
      }
      return
    }

    if (phase === 'departing') {
      progressRef.current = Math.min(1, progressRef.current + delta / 3.2)
      const eased = THREE.MathUtils.smoothstep(progressRef.current, 0, 1)
      root.position.z = THREE.MathUtils.lerp(dockZ, farZ, eased)
      if (progressRef.current >= 1) setTruckPhase('away')
      else invalidate()
      return
    }

    if (phase === 'away') {
      waitRef.current += delta
      if (waitRef.current >= 2.4) {
        setTruckPhase('approaching')
      } else {
        invalidate()
      }
      return
    }

    if (phase === 'approaching') {
      progressRef.current = Math.min(1, progressRef.current + delta / 3.5)
      const eased = THREE.MathUtils.smoothstep(progressRef.current, 0, 1)
      root.position.z = THREE.MathUtils.lerp(farZ, dockZ, eased)
      if (progressRef.current >= 1) completeTruckCycle()
      else invalidate()
    }
  })

  const queueCount = Math.min(2, Math.max(0, queue - 1))

  return (
    <group>
      <group ref={rootRef} position={[x, 0.15, dockZ]}>
        <TruckModel accent="#0284c7" compact={compact} closed={phase !== 'docked'} />
      </group>
      {Array.from({ length: queueCount }, (_, index) => (
        <group
          key={`truck-queue-${index}`}
          position={[
            x + (index % 2 === 0 ? -4.2 : 4.2),
            0.15,
            farZ + index * 7,
          ]}
          scale={0.92}
        >
          <TruckModel
            accent={index % 2 === 0 ? '#7c3aed' : '#0f766e'}
            compact={compact}
            closed
          />
        </group>
      ))}
    </group>
  )
}
