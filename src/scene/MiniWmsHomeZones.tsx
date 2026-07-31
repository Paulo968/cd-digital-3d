import { Text } from '@react-three/drei'
import type { FleetVehicleDefinition } from '../domain/realisticFleet'
import {
  miniWmsEquipmentDuty,
  type MiniWmsEquipmentDuty,
} from '../domain/miniWms'

const HOME_LABELS: Record<MiniWmsEquipmentDuty, string> = {
  'receiving-dock': 'VAGA RX20 RECEBIMENTO',
  'inbound-transfer': 'VAGA TP ENTRADA',
  putaway: 'VAGA RETRÁTIL ARMAZENAGEM',
  retrieve: 'VAGA RETRÁTIL RETIRADA',
  'outbound-transfer': 'VAGA TP SAÍDA',
  'shipping-dock': 'VAGA RX20 EXPEDIÇÃO',
}

export function MiniWmsHomeZones({
  vehicles,
}: {
  vehicles: FleetVehicleDefinition[]
}) {
  return (
    <group>
      {vehicles.map((vehicle) => {
        const duty = miniWmsEquipmentDuty(vehicle)
        return (
          <group
            key={`home-${vehicle.id}`}
            position={[vehicle.startPoint.x, 0.025, vehicle.startPoint.z]}
            rotation={[0, vehicle.startFacing, 0]}
          >
            <mesh receiveShadow>
              <boxGeometry args={[2.25, 0.035, 2.8]} />
              <meshStandardMaterial
                color={vehicle.color}
                transparent
                opacity={0.2}
                roughness={0.88}
              />
            </mesh>
            <mesh position={[0, 0.023, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1.85, 2.4]} />
              <meshBasicMaterial
                color={vehicle.color}
                transparent
                opacity={0.08}
              />
            </mesh>
            <Text
              position={[0, 0.055, 1.05]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.2}
              color="#f8fafc"
              anchorX="center"
              anchorY="middle"
              maxWidth={2.05}
            >
              {HOME_LABELS[duty]}
            </Text>
          </group>
        )
      })}
    </group>
  )
}
