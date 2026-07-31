import type {
  FleetMissionRole,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'

const RX20_ROLES: FleetMissionRole[] = ['inbound-transfer', 'shipping']
const REACH_ROLES: FleetMissionRole[] = ['putaway', 'replenishment']
const PALLET_JACK_ROLES: FleetMissionRole[] = [
  'inbound-transfer',
  'replenishment',
]

function findCounterbalance(
  vehicles: FleetVehicleDefinition[],
): FleetVehicleDefinition | undefined {
  return (
    vehicles.find((vehicle) => vehicle.id === 'RX-REC') ??
    vehicles.find(
      (vehicle) =>
        vehicle.kind === 'forklift' && vehicle.roles.includes('shipping'),
    ) ??
    vehicles.find((vehicle) => vehicle.kind === 'forklift')
  )
}

function findReachTruck(
  vehicles: FleetVehicleDefinition[],
  counterbalanceId?: string,
): FleetVehicleDefinition | undefined {
  return (
    vehicles.find(
      (vehicle) =>
        vehicle.id !== counterbalanceId && vehicle.id.startsWith('EMP-'),
    ) ??
    vehicles.find(
      (vehicle) =>
        vehicle.id !== counterbalanceId &&
        vehicle.kind === 'forklift' &&
        (vehicle.roles.includes('putaway') ||
          vehicle.roles.includes('replenishment')),
    )
  )
}

function findPalletJack(
  vehicles: FleetVehicleDefinition[],
): FleetVehicleDefinition | undefined {
  return (
    vehicles.find((vehicle) => vehicle.id === 'TP-IN') ??
    vehicles.find((vehicle) => vehicle.kind === 'pallet-jack')
  )
}

function uniqueVehicles(
  vehicles: Array<FleetVehicleDefinition | undefined>,
): FleetVehicleDefinition[] {
  const seen = new Set<string>()
  return vehicles.filter((vehicle): vehicle is FleetVehicleDefinition => {
    if (!vehicle || seen.has(vehicle.id)) return false
    seen.add(vehicle.id)
    return true
  })
}

/**
 * Mantém a demonstração realista com uma célula operacional enxuta:
 *
 * - RX 20 contrabalançada: descarga e carregamento de caminhões;
 * - retrátil: armazenagem e retirada nas ruas;
 * - transpaleteira: transferências entre docas, buffers e ruas.
 *
 * Os IDs deixam de carregar cobertura de rua para que uma única retrátil possa
 * atender todas as ruas sem o despachante bloquear missões de outras zonas.
 */
export function buildStableFleetPlan(
  plan: RealisticFleetPlan,
): RealisticFleetPlan {
  const counterbalanceSource = findCounterbalance(plan.vehicles)
  const reachSource = findReachTruck(
    plan.vehicles,
    counterbalanceSource?.id,
  )
  const palletJackSource = findPalletJack(plan.vehicles)

  const vehicles = uniqueVehicles([
    counterbalanceSource
      ? {
          ...counterbalanceSource,
          id: 'RX-20',
          label: 'RX 20-20 contrabalançada — recebimento e expedição',
          roles: RX20_ROLES,
          color: '#16a34a',
          speedScale: Math.min(counterbalanceSource.speedScale, 0.92),
          startDelay: 0,
        }
      : undefined,
    reachSource
      ? {
          ...reachSource,
          id: 'REACH-01',
          label: 'Empilhadeira retrátil — armazenagem e reabastecimento',
          roles: REACH_ROLES,
          color: '#f59e0b',
          speedScale: Math.min(reachSource.speedScale, 0.88),
          startDelay: 0.45,
        }
      : undefined,
    palletJackSource
      ? {
          ...palletJackSource,
          id: 'TP-01',
          label: 'Transpaleteira elétrica — transferências internas',
          roles: PALLET_JACK_ROLES,
          color: '#0ea5e9',
          speedScale: Math.min(palletJackSource.speedScale, 0.98),
          startDelay: 0.8,
        }
      : undefined,
  ])

  return {
    ...plan,
    vehicles: vehicles.length > 0 ? vehicles : plan.vehicles.slice(0, 3),
  }
}
