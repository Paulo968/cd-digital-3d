import { Text } from '@react-three/drei'
import type { WarehouseLayout } from '../domain/layout'

interface TrafficFlowMarkersProps {
  layout: WarehouseLayout
  compact: boolean
}

function markerPositions(length: number, compact: boolean): number[] {
  const count = compact ? 2 : Math.max(2, Math.min(5, Math.floor(length / 8)))
  return Array.from({ length: count }, (_, index) => {
    const ratio = (index + 1) / (count + 1)
    return -length / 2 + length * ratio
  })
}

export function TrafficFlowMarkers({
  layout,
  compact,
}: TrafficFlowMarkersProps) {
  return (
    <group>
      {layout.rackRows
        .filter((row) => row.active)
        .map((row) => {
          const length = row.baysPerSide * row.bayWidth
          const lateralOffset = Math.min(1.05, row.aisleWidth * 0.24)
          const positions = markerPositions(length, compact)

          return (
            <group
              key={`traffic-flow-${row.id}`}
              position={[row.origin.x, 0.045, row.origin.z]}
              rotation={[0, row.rotationY, 0]}
            >
              {positions.map((localX, index) => (
                <group key={`${row.id}-${index}`}>
                  <Text
                    position={[localX, 0, -lateralOffset]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={compact ? 0.48 : 0.62}
                    color="#38bdf8"
                    anchorX="center"
                    anchorY="middle"
                  >
                    →
                  </Text>
                  <Text
                    position={[localX, 0, lateralOffset]}
                    rotation={[-Math.PI / 2, 0, Math.PI]}
                    fontSize={compact ? 0.48 : 0.62}
                    color="#f59e0b"
                    anchorX="center"
                    anchorY="middle"
                  >
                    →
                  </Text>
                </group>
              ))}
            </group>
          )
        })}
    </group>
  )
}
