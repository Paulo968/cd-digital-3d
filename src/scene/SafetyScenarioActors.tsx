import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  currentScenarioProfile,
  recordSafetyEvent,
  useOperationsControlStore,
} from '../store/operationsControlStore'
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

function WorkerVisual({ vest = '#f97316' }: { vest?: string }) {
  return (
    <group>
      <mesh position={[0, 1.52, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshStandardMaterial color="#f1c7a5" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[0.38, 0.72, 0.24]} />
        <meshStandardMaterial color={vest} roughness={0.72} />
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

function WorkPost({
  x,
  z,
  label,
  vest,
}: {
  x: number
  z: number
  label: string
  vest: string
}) {
  return (
    <group position={[x, 0, z]}>
      <WorkerVisual vest={vest} />
      <Text
        position={[0, 2.05, 0]}
        fontSize={0.28}
        color="#e0f2fe"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.58, 24]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.5} />
      </mesh>
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
            <meshStandardMaterial
              color="#facc15"
              emissive="#facc15"
              emissiveIntensity={0.6}
            />
          </mesh>
          <mesh position={[0, 0.32, -0.54]}>
            <boxGeometry args={[1.05, 0.12, 0.03]} />
            <meshStandardMaterial
              color="#facc15"
              emissive="#facc15"
              emissiveIntensity={0.6}
            />
          </mesh>
        </>
      )}
    </group>
  )
}

function SafetyCrossing({
  startX,
  endX,
  z,
}: {
  startX: number
  endX: number
  z: number
}) {
  const width = Math.max(2, endX - startX)
  return (
    <group>
      {Array.from({ length: 8 }, (_, index) => {
        const x = THREE.MathUtils.lerp(startX, endX, index / 7)
        return (
          <mesh key={index} position={[x, 0.027, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width / 16, 1.05]} />
            <meshBasicMaterial color="#f8fafc" transparent opacity={0.62} />
          </mesh>
        )
      })}
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
  const pedestrianActiveRef = useRef(false)
  const obstacleActiveRef = useRef(false)
  const activeFaultRef = useRef<string | null>(null)
  const timeoutIdsRef = useRef<number[]>([])
  const manualTokensRef = useRef({ pedestrian: 0, obstacle: 0, failure: 0 })
  const [pedestrianActive, setPedestrianActive] = useState(false)
  const [obstacleActive, setObstacleActive] = useState(false)
  const scenario = useOperationsControlStore((state) => state.scenario)
  const safetyTokens = useOperationsControlStore((state) => state.safetyTokens)
  const { invalidate } = useThree()

  const pedestrianStartX = Math.min(receivingX, shippingX) - 1.8
  const pedestrianEndX = Math.max(receivingX, shippingX) + 1.8
  const crossingZ = frontZ - 7.6
  const obstaclePoint = useMemo(
    () => ({ x: centerX, y: 0.2, z: frontZ - 10.5 }),
    [centerX, frontZ],
  )

  const later = useCallback((callback: () => void, delay: number) => {
    const id = window.setTimeout(callback, delay)
    timeoutIdsRef.current.push(id)
    return id
  }, [])

  const clearSchedules = useCallback(() => {
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id))
    timeoutIdsRef.current = []
  }, [])

  const startPedestrian = useCallback(() => {
    if (pedestrianActiveRef.current) return
    pedestrianActiveRef.current = true
    pedestrianProgressRef.current = 0
    setPedestrianActive(true)
    recordSafetyEvent(
      'Travessia autorizada',
      'Um colaborador iniciou a travessia na faixa sinalizada; a frota deve ceder passagem.',
    )
    invalidate()
  }, [invalidate])

  const clearObstacle = useCallback(() => {
    obstacleActiveRef.current = false
    setObstacleActive(false)
    removeRuntimeHazard('dynamic-obstacle-1')
    invalidate()
  }, [invalidate])

  const startObstacle = useCallback(
    (persistent = false) => {
      if (obstacleActiveRef.current) return
      obstacleActiveRef.current = true
      setObstacleActive(true)
      upsertRuntimeHazard({
        id: 'dynamic-obstacle-1',
        kind: 'obstacle',
        point: obstaclePoint,
        radius: 0.72,
        active: true,
      })
      recordSafetyEvent(
        persistent ? 'Corredor bloqueado' : 'Obstáculo controlado',
        persistent
          ? 'A barreira permanece ativa enquanto o cenário de corredor bloqueado estiver selecionado.'
          : 'A barreira foi inserida pelo operador para validar a frenagem dinâmica.',
      )
      invalidate()
      if (!persistent) later(clearObstacle, compact ? 4200 : 5200)
    },
    [clearObstacle, compact, invalidate, later, obstaclePoint],
  )

  const startBreakdown = useCallback(() => {
    const vehicleId = chooseMovingVehicleForFault()
    if (!vehicleId || activeFaultRef.current) return
    activeFaultRef.current = vehicleId
    setRuntimeVehicleFault(vehicleId, true)
    recordSafetyEvent(
      'Avaria controlada',
      `${vehicleId} foi colocado em falha para validar parada, isolamento e retomada.`,
    )
    invalidate()
    later(() => {
      setRuntimeVehicleFault(vehicleId, false)
      if (activeFaultRef.current === vehicleId) activeFaultRef.current = null
      invalidate()
    }, compact ? 3600 : 4800)
  }, [compact, invalidate, later])

  useEffect(() => {
    clearSchedules()
    clearObstacle()
    const profile = currentScenarioProfile()
    if (profile.persistentObstacle) {
      later(() => startObstacle(true), 650)
    }
    if (profile.frequentBreakdown) {
      later(startBreakdown, compact ? 5200 : 3800)
    }

    return () => {
      clearSchedules()
      pedestrianActiveRef.current = false
      setPedestrianActive(false)
      removeRuntimeHazard('dynamic-person-1')
      clearObstacle()
      if (activeFaultRef.current) {
        setRuntimeVehicleFault(activeFaultRef.current, false)
        activeFaultRef.current = null
      }
    }
  }, [
    clearObstacle,
    clearSchedules,
    compact,
    later,
    scenario,
    startBreakdown,
    startObstacle,
  ])

  useEffect(() => {
    if (safetyTokens.pedestrian !== manualTokensRef.current.pedestrian) {
      manualTokensRef.current.pedestrian = safetyTokens.pedestrian
      startPedestrian()
    }
    if (safetyTokens.obstacle !== manualTokensRef.current.obstacle) {
      manualTokensRef.current.obstacle = safetyTokens.obstacle
      if (obstacleActiveRef.current) clearObstacle()
      else startObstacle(currentScenarioProfile().persistentObstacle)
    }
    if (safetyTokens.failure !== manualTokensRef.current.failure) {
      manualTokensRef.current.failure = safetyTokens.failure
      startBreakdown()
    }
  }, [
    clearObstacle,
    safetyTokens,
    startBreakdown,
    startObstacle,
    startPedestrian,
  ])

  useFrame((_, delta) => {
    if (!pedestrianActiveRef.current) return
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
      pedestrianActiveRef.current = false
      setPedestrianActive(false)
      removeRuntimeHazard('dynamic-person-1')
    } else {
      invalidate()
    }
  })

  return (
    <group>
      <SafetyCrossing
        startX={pedestrianStartX}
        endX={pedestrianEndX}
        z={crossingZ}
      />
      {!compact && (
        <>
          <WorkPost
            x={receivingX - 3.7}
            z={frontZ - 3.2}
            label="Conferente do recebimento"
            vest="#f97316"
          />
          <WorkPost
            x={shippingX + 3.7}
            z={frontZ - 3.2}
            label="Auxiliar de expedição"
            vest="#eab308"
          />
        </>
      )}
      {pedestrianActive && (
        <group ref={pedestrianRef}>
          <WorkerVisual vest="#22c55e" />
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
