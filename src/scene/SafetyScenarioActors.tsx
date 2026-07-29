import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  chooseMovingVehicleForFault,
  removeRuntimeHazard,
  setRuntimeVehicleFault,
  upsertRuntimeHazard,
} from './dynamicSafetyRuntime'

interface SafetyScenarioActorsProps {
  centerX: number
  receivingX: number
  shippingX: number
  frontZ: number
  compact: boolean
}

function PedestrianVisual() {
  return (
    <group>
      <mesh position={[0, 1.52, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshStandardMaterial color="#f1c7a5" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[0.38, 0.72, 0.24]} />
        <meshStandardMaterial color="#f97316" roughness={0.72} />
      </mesh>
      {[-0.11, 0.11].map((x) => (
        <mesh key={`leg-${x}`} position={[x, 0.42, 0]} castShadow>
          <boxGeometry args={[0.11, 0.68, 0.12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.84} />
        </mesh>
      ))}
    </group>
  )
}

function TemporaryObstacle({ compact }: { compact: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.68, 1.05]} />
        <meshStandardMaterial color="#dc2626" roughness={0.7} />
      </mesh>
      {!compact && (
        <>
          <mesh position={[0, 0.32, 0.54]}>
            <boxGeometry args={[1.05, 0.12, 0.03]} />
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, 0.32, -0.54]}>
            <boxGeometry args={[1.05, 0.12, 0.03]} />
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.6} />
          </mesh>
        </>
      )}
    </group>
  )
}

export function SafetyScenarioActors({
  centerX,
  receivingX,
  shippingX,
  frontZ,
  compact,
}: SafetyScenarioActorsProps) {
  const pedestrianRef = useRef<THREE.Group | null>(null)
  const pedestrianProgressRef = useRef(0)
  const activeFaultRef = useRef<string | null>(null)
  const timeoutIdsRef = useRef<number[]>([])
  const intervalIdsRef = useRef<number[]>([])
  const [pedestrianActive, setPedestrianActive] = useState(false)
  const [obstacleActive, setObstacleActive] = useState(false)
  const { invalidate } = useThree()

  const pedestrianStartX = Math.min(receivingX, shippingX) - 2.2
  const pedestrianEndX = Math.max(receivingX, shippingX) + 2.2
  const crossingZ = frontZ - 8.5
  const obstaclePoint = { x: centerX, y: 0.2, z: frontZ - 10.5 }

  const later = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(callback, delay)
    timeoutIdsRef.current.push(id)
    return id
  }, [])

  const startPedestrian = useCallback(() => {
    pedestrianProgressRef.current = 0
    setPedestrianActive(true)
    invalidate()
  }, [invalidate])

  const startObstacle = useCallback(() => {
    setObstacleActive(true)
    upsertRuntimeHazard({
      id: 'dynamic-obstacle-1',
      kind: 'obstacle',
      point: obstaclePoint,
      radius: 0.72,
      active: true,
    })
    invalidate()
    later(() => {
      setObstacleActive(false)
      removeRuntimeHazard('dynamic-obstacle-1')
      invalidate()
    }, compact ? 4200 : 5200)
  }, [compact, invalidate, later, obstaclePoint])

  const startBreakdown = useCallback(() => {
    const vehicleId = chooseMovingVehicleForFault()
    if (!vehicleId || activeFaultRef.current) return

    activeFaultRef.current = vehicleId
    setRuntimeVehicleFault(vehicleId, true)
    invalidate()
    later(() => {
      setRuntimeVehicleFault(vehicleId, false)
      if (activeFaultRef.current === vehicleId) activeFaultRef.current = null
      invalidate()
    }, compact ? 3600 : 4800)
  }, [compact, invalidate, later])

  useEffect(() => {
    const pedestrianInitial = later(startPedestrian, compact ? 6500 : 4200)
    const obstacleInitial = later(startObstacle, compact ? 12500 : 9000)
    const breakdownInitial = later(startBreakdown, compact ? 19000 : 14500)

    intervalIdsRef.current.push(
      window.setInterval(startPedestrian, compact ? 26000 : 19000),
      window.setInterval(startObstacle, compact ? 34000 : 25000),
      window.setInterval(startBreakdown, compact ? 42000 : 31000),
    )

    return () => {
      window.clearTimeout(pedestrianInitial)
      window.clearTimeout(obstacleInitial)
      window.clearTimeout(breakdownInitial)
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id))
      intervalIdsRef.current.forEach((id) => window.clearInterval(id))
      timeoutIdsRef.current = []
      intervalIdsRef.current = []
      removeRuntimeHazard('dynamic-person-1')
      removeRuntimeHazard('dynamic-obstacle-1')
      if (activeFaultRef.current) {
        setRuntimeVehicleFault(activeFaultRef.current, false)
        activeFaultRef.current = null
      }
    }
  }, [compact, later, startBreakdown, startObstacle, startPedestrian])

  useFrame((_, delta) => {
    if (!pedestrianActive) return

    pedestrianProgressRef.current = Math.min(
      1,
      pedestrianProgressRef.current + delta / (compact ? 4.8 : 3.9),
    )
    const ratio = pedestrianProgressRef.current
    const x = THREE.MathUtils.lerp(pedestrianStartX, pedestrianEndX, ratio)
    const root = pedestrianRef.current
    if (root) {
      root.position.set(x, 0, crossingZ)
      root.rotation.y = Math.PI / 2
    }

    upsertRuntimeHazard({
      id: 'dynamic-person-1',
      kind: 'person',
      point: { x, y: 0.2, z: crossingZ },
      radius: 0.34,
      active: true,
    })

    if (ratio >= 1) {
      setPedestrianActive(false)
      removeRuntimeHazard('dynamic-person-1')
    } else {
      invalidate()
    }
  })

  return (
    <group>
      {pedestrianActive && (
        <group ref={pedestrianRef}>
          <PedestrianVisual />
        </group>
      )}
      {obstacleActive && (
        <group position={[obstaclePoint.x, 0, obstaclePoint.z]}>
          <TemporaryObstacle compact={compact} />
        </group>
      )}
    </group>
  )
}
