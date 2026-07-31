import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useInboundTruckStore } from '../store/inboundTruckStore'

interface LiveInboundTruckProps {
  x: number
  dockZ: number
  compact: boolean
}

function InboundTruckModel({
  compact,
  closed,
}: {
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
        <meshStandardMaterial color="#16a34a" metalness={0.2} roughness={0.55} />
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
      {closed && (
        <mesh position={[0, 1.62, -5.04]} castShadow>
          <boxGeometry args={[2.55, 2.45, 0.12]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.28} roughness={0.58} />
        </mesh>
      )}
    </group>
  )
}

/**
 * Caminhão independente da doca de expedição. Depois de dois segundos em
 * `waiting`, ele sai vazio, aguarda fora da operação e uma nova carroceria
 * retorna para o próximo ciclo de recebimento.
 */
export function LiveInboundTruck({
  x,
  dockZ,
  compact,
}: LiveInboundTruckProps) {
  const rootRef = useRef<THREE.Group | null>(null)
  const progressRef = useRef(0)
  const waitRef = useRef(0)
  const phase = useInboundTruckStore((state) => state.phase)
  const cycle = useInboundTruckStore((state) => state.cycle)
  const setPhase = useInboundTruckStore((state) => state.setPhase)
  const completeCycle = useInboundTruckStore((state) => state.completeCycle)
  const { invalidate } = useThree()
  const farZ = dockZ + 20

  useEffect(() => {
    progressRef.current = 0
    waitRef.current = 0
    const root = rootRef.current
    if (!root) return
    root.position.set(
      x,
      0.15,
      phase === 'away' || phase === 'approaching' ? farZ : dockZ,
    )
    invalidate()
  }, [cycle, dockZ, farZ, invalidate, phase, x])

  useFrame((_, delta) => {
    const root = rootRef.current
    if (!root) return

    if (phase === 'departing') {
      progressRef.current = Math.min(1, progressRef.current + delta / 3.1)
      const eased = THREE.MathUtils.smoothstep(progressRef.current, 0, 1)
      root.position.z = THREE.MathUtils.lerp(dockZ, farZ, eased)
      if (progressRef.current >= 1) setPhase('away')
      else invalidate()
      return
    }

    if (phase === 'away') {
      waitRef.current += delta
      if (waitRef.current >= 1.35) setPhase('approaching')
      else invalidate()
      return
    }

    if (phase === 'approaching') {
      progressRef.current = Math.min(1, progressRef.current + delta / 3.25)
      const eased = THREE.MathUtils.smoothstep(progressRef.current, 0, 1)
      root.position.z = THREE.MathUtils.lerp(farZ, dockZ, eased)
      if (progressRef.current >= 1) completeCycle()
      else invalidate()
    }
  })

  return (
    <group ref={rootRef} position={[x, 0.15, dockZ]}>
      <InboundTruckModel
        compact={compact}
        closed={phase === 'departing' || phase === 'away' || phase === 'approaching'}
      />
    </group>
  )
}
