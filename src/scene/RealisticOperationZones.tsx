import { Line, Text } from '@react-three/drei'
import * as THREE from 'three'

interface FloorZoneProps {
  label: string
  position: [number, number, number]
  size: [number, number]
  color: string
  detail: string
}

function FloorZone({
  label,
  position,
  size,
  color,
  detail,
}: FloorZoneProps) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={size} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(size[0], size[1])]} />
        <lineBasicMaterial color={color} transparent opacity={0.72} />
      </lineSegments>
      <Text
        position={[0, 0.05, -0.35]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.42}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
      <Text
        position={[0, 0.05, 0.45]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.2}
        color="#cbd5e1"
        anchorX="center"
        anchorY="middle"
      >
        {detail}
      </Text>
    </group>
  )
}

/**
 * Marca fisicamente as células do fluxo ponta a ponta que serão conectadas ao
 * kernel. As zonas são informativas: somente o recebimento está automatizado
 * nesta fase.
 */
export function RealisticOperationZones() {
  return (
    <group>
      <FloorZone
        label="BUFFER PUTAWAY"
        detail="TP-IN → endereço XYZ"
        position={[6, 0.035, -60]}
        size={[13, 7]}
        color="#22d3ee"
      />
      <FloorZone
        label="PICKING N0"
        detail="separação e reposição"
        position={[-6, 0.035, -91]}
        size={[8, 18]}
        color="#a78bfa"
      />
      <FloorZone
        label="STAGING OUT"
        detail="consolidação e pré-embarque"
        position={[-27, 0.035, -46]}
        size={[18, 13]}
        color="#f59e0b"
      />
      <FloorZone
        label="DOCA OUTBOUND"
        detail="carregamento · próxima fase"
        position={[-34, 0.035, 18]}
        size={[16, 10]}
        color="#fb7185"
      />

      <Line
        points={[
          [6, 0.08, -58],
          [4, 0.08, -70],
          [-6, 0.08, -91],
          [-17, 0.08, -70],
          [-27, 0.08, -46],
          [-34, 0.08, -8],
          [-34, 0.08, 18],
        ]}
        color="#f8fafc"
        lineWidth={2}
        dashed
        dashSize={0.8}
        gapSize={0.42}
        transparent
        opacity={0.42}
      />

      <Text
        position={[-17, 0.09, -64]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color="#e2e8f0"
      >
        FLUXO OUTBOUND PLANEJADO
      </Text>
    </group>
  )
}
