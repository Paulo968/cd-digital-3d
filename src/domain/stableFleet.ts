import type {
  FleetMission,
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

function missionGroups(missions: FleetMission[]): Map<string, FleetMission[]> {
  const groups = new Map<string, FleetMission[]>()
  missions.forEach((mission) => {
    const group = groups.get(mission.palletId) ?? []
    group.push(mission)
    groups.set(mission.palletId, group)
  })
  return groups
}

function groupHasRoles(
  missions: FleetMission[],
  required: FleetMissionRole[],
): boolean {
  const roles = new Set(missions.map((mission) => mission.role))
  return required.every((role) => roles.has(role))
}

function selectDemonstrationPallets(missions: FleetMission[]): string[] {
  const groups = missionGroups(missions)
  const entries = [...groups.entries()]
  const inbound =
    entries.find(
      ([palletId, group]) =>
        /(?:FLOW-IN|DEMO-IN)/i.test(palletId) &&
        groupHasRoles(group, ['inbound-transfer', 'putaway']),
    ) ??
    entries.find(([, group]) =>
      groupHasRoles(group, ['inbound-transfer', 'putaway']),
    )
  const outbound =
    entries.find(
      ([palletId, group]) =>
        palletId !== inbound?.[0] &&
        /(?:FLOW-OUT|DEMO-PICK|DEMO-RES)/i.test(palletId) &&
        groupHasRoles(group, ['replenishment', 'shipping']),
    ) ??
    entries.find(
      ([palletId, group]) =>
        palletId !== inbound?.[0] &&
        groupHasRoles(group, ['replenishment', 'shipping']),
    )

  const selected = [inbound?.[0], outbound?.[0]].filter(
    (palletId): palletId is string => Boolean(palletId),
  )

  if (selected.length >= 2) return selected
  for (const palletId of groups.keys()) {
    if (selected.includes(palletId)) continue
    selected.push(palletId)
    if (selected.length >= 2) break
  }
  return selected
}

function focusedMissions(plan: RealisticFleetPlan): {
  missions: FleetMission[]
  initialPalletStops: RealisticFleetPlan['initialPalletStops']
} {
  const selectedPalletIds = new Set(selectDemonstrationPallets(plan.missions))
  if (selectedPalletIds.size === 0) {
    return {
      missions: plan.missions,
      initialPalletStops: plan.initialPalletStops,
    }
  }

  const missions = plan.missions
    .filter((mission) => selectedPalletIds.has(mission.palletId))
    .sort((left, right) => left.sequence - right.sequence)
  const initialPalletStops = Object.fromEntries(
    Object.entries(plan.initialPalletStops).filter(([palletId]) =>
      selectedPalletIds.has(palletId),
    ),
  )

  return { missions, initialPalletStops }
}

/**
 * Constrói uma célula operacional pequena, porém completa:
 *
 * - RX 20 contrabalançada: somente descarga e carregamento de caminhões;
 * - retrátil: somente armazenagem e retirada de pallets nas ruas;
 * - transpaleteira: somente transferência entre docas, buffers e ruas.
 *
 * A demonstração usa um fluxo de entrada e um fluxo de saída. Isso permite
 * enxergar claramente quem faz cada etapa e evita dezenas de tarefas aleatórias
 * sendo abertas ao mesmo tempo antes de o controle físico estar estabilizado.
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
  const focused = focusedMissions(plan)

  const vehicles = uniqueVehicles([
    counterbalanceSource
      ? {
          ...counterbalanceSource,
          id: 'RX-20',
          label: 'RX 20-20 contrabalançada — recebimento e expedição',
          roles: RX20_ROLES,
          color: '#16a34a',
          speedScale: Math.min(counterbalanceSource.speedScale, 0.88),
          startDelay: 0,
        }
      : undefined,
    reachSource
      ? {
          ...reachSource,
          id: 'REACH-01',
          label: 'Empilhadeira retrátil — armazenagem e retirada nas ruas',
          roles: REACH_ROLES,
          color: '#f59e0b',
          speedScale: Math.min(reachSource.speedScale, 0.82),
          startDelay: 0.35,
        }
      : undefined,
    palletJackSource
      ? {
          ...palletJackSource,
          id: 'TP-01',
          label: 'Transpaleteira elétrica — transferências entre buffers',
          roles: PALLET_JACK_ROLES,
          color: '#0ea5e9',
          speedScale: Math.min(palletJackSource.speedScale, 0.92),
          startDelay: 0.7,
        }
      : undefined,
  ])

  return {
    ...plan,
    vehicles: vehicles.length > 0 ? vehicles : plan.vehicles.slice(0, 3),
    missions: focused.missions,
    initialPalletStops: focused.initialPalletStops,
  }
}
