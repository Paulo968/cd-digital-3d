import type {
  FleetMission,
  FleetMissionRole,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'

const RX_RECEIVING_ROLES: FleetMissionRole[] = ['inbound-transfer']
const TP_INBOUND_ROLES: FleetMissionRole[] = ['inbound-transfer']
const REACH_PUTAWAY_ROLES: FleetMissionRole[] = ['putaway']
const REACH_PICK_ROLES: FleetMissionRole[] = ['replenishment']
const TP_OUTBOUND_ROLES: FleetMissionRole[] = ['replenishment']
const RX_SHIPPING_ROLES: FleetMissionRole[] = ['shipping']

function vehicleById(
  vehicles: FleetVehicleDefinition[],
  id: string,
): FleetVehicleDefinition | undefined {
  return vehicles.find((vehicle) => vehicle.id === id)
}

function counterbalanceVehicles(
  vehicles: FleetVehicleDefinition[],
): FleetVehicleDefinition[] {
  return vehicles.filter(
    (vehicle) =>
      vehicle.kind === 'forklift' &&
      (vehicle.id.startsWith('RX-') ||
        vehicle.roles.includes('inbound-transfer') ||
        vehicle.roles.includes('shipping')),
  )
}

function reachVehicles(
  vehicles: FleetVehicleDefinition[],
): FleetVehicleDefinition[] {
  return vehicles.filter(
    (vehicle) =>
      vehicle.kind === 'forklift' &&
      !vehicle.id.startsWith('RX-') &&
      (vehicle.id.startsWith('EMP-') ||
        vehicle.roles.includes('putaway') ||
        vehicle.roles.includes('replenishment')),
  )
}

function palletJackVehicles(
  vehicles: FleetVehicleDefinition[],
): FleetVehicleDefinition[] {
  return vehicles.filter((vehicle) => vehicle.kind === 'pallet-jack')
}

function cloneVehicle(
  source: FleetVehicleDefinition | undefined,
  input: Pick<
    FleetVehicleDefinition,
    'id' | 'label' | 'roles' | 'color' | 'speedScale' | 'startDelay'
  >,
  startPointOverride?: FleetVehicleDefinition['startPoint'],
): FleetVehicleDefinition | undefined {
  if (!source) return undefined
  return {
    ...source,
    ...input,
    startPoint: startPointOverride ?? source.startPoint,
  }
}

function offsetHome(
  source: FleetVehicleDefinition,
  distance: number,
): FleetVehicleDefinition['startPoint'] {
  return {
    x: source.startPoint.x + Math.cos(source.startFacing) * distance,
    y: source.startPoint.y,
    z: source.startPoint.z + Math.sin(source.startFacing) * distance,
  }
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
 * Constrói duas cadeias operacionais independentes com seis equipamentos:
 *
 * Recebimento: RX-REC → TP-IN → REACH-PUT.
 * Expedição: REACH-PICK → TP-OUT → RX-LOAD.
 *
 * Cada equipamento conserva a posição de espera do plano industrial original.
 * Quando o layout fornece somente uma retrátil, a segunda recebe uma vaga
 * lateral separada, sem nascer sobre a primeira.
 */
export function buildStableFleetPlan(
  plan: RealisticFleetPlan,
): RealisticFleetPlan {
  const counterbalances = counterbalanceVehicles(plan.vehicles)
  const reaches = reachVehicles(plan.vehicles)
  const palletJacks = palletJackVehicles(plan.vehicles)

  const receivingRxSource =
    vehicleById(plan.vehicles, 'RX-REC') ?? counterbalances[0]
  const shippingRxSource =
    vehicleById(plan.vehicles, 'RX-LOAD') ??
    counterbalances.find((vehicle) => vehicle.id !== receivingRxSource?.id) ??
    receivingRxSource
  const inboundTpSource =
    vehicleById(plan.vehicles, 'TP-IN') ?? palletJacks[0]
  const outboundTpSource =
    vehicleById(plan.vehicles, 'TP-OUT') ??
    palletJacks.find((vehicle) => vehicle.id !== inboundTpSource?.id) ??
    inboundTpSource
  const putawayReachSource = reaches[0]
  const pickReachSource = reaches[1] ?? reaches[0]
  const pickHome =
    pickReachSource && pickReachSource === putawayReachSource
      ? offsetHome(pickReachSource, 3.4)
      : undefined
  const focused = focusedMissions(plan)

  const vehicles = uniqueVehicles([
    cloneVehicle(receivingRxSource, {
      id: 'RX-REC',
      label: 'RX 20-20 — descarga exclusiva do recebimento',
      roles: RX_RECEIVING_ROLES,
      color: '#16a34a',
      speedScale: Math.min(receivingRxSource?.speedScale ?? 1, 0.88),
      startDelay: 0,
    }),
    cloneVehicle(inboundTpSource, {
      id: 'TP-IN',
      label: 'Transpaleteira de entrada — descarga para o buffer da rua',
      roles: TP_INBOUND_ROLES,
      color: '#0ea5e9',
      speedScale: Math.min(inboundTpSource?.speedScale ?? 1, 0.94),
      startDelay: 0.2,
    }),
    cloneVehicle(putawayReachSource, {
      id: 'REACH-PUT',
      label: 'Retrátil de armazenagem — buffer para o endereço',
      roles: REACH_PUTAWAY_ROLES,
      color: '#f59e0b',
      speedScale: Math.min(putawayReachSource?.speedScale ?? 1, 0.82),
      startDelay: 0.4,
    }),
    cloneVehicle(
      pickReachSource,
      {
        id: 'REACH-PICK',
        label: 'Retrátil de retirada — endereço para o buffer de saída',
        roles: REACH_PICK_ROLES,
        color: '#eab308',
        speedScale: Math.min(pickReachSource?.speedScale ?? 1, 0.82),
        startDelay: 0.6,
      },
      pickHome,
    ),
    cloneVehicle(outboundTpSource, {
      id: 'TP-OUT',
      label: 'Transpaleteira de saída — buffer da rua para o pré-embarque',
      roles: TP_OUTBOUND_ROLES,
      color: '#2563eb',
      speedScale: Math.min(outboundTpSource?.speedScale ?? 1, 0.94),
      startDelay: 0.8,
    }),
    cloneVehicle(shippingRxSource, {
      id: 'RX-LOAD',
      label: 'RX 20-20 — carregamento exclusivo da expedição',
      roles: RX_SHIPPING_ROLES,
      color: '#0284c7',
      speedScale: Math.min(shippingRxSource?.speedScale ?? 1, 0.88),
      startDelay: 1,
    }),
  ])

  return {
    ...plan,
    vehicles: vehicles.length === 6 ? vehicles : plan.vehicles.slice(0, 6),
    missions: focused.missions,
    initialPalletStops: focused.initialPalletStops,
  }
}
