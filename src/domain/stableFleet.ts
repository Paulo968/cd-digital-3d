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
const MAX_PALLETS_PER_FLOW = 3

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
    | 'id'
    | 'label'
    | 'roles'
    | 'color'
    | 'speedScale'
    | 'startDelay'
    | 'startFacing'
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

function firstSequence(missions: FleetMission[]): number {
  return Math.min(...missions.map((mission) => mission.sequence))
}

function preferredFlowEntries(
  entries: Array<[string, FleetMission[]]>,
  pattern: RegExp,
): Array<[string, FleetMission[]]> {
  return [...entries].sort(([leftId, left], [rightId, right]) => {
    const leftPreferred = pattern.test(leftId) ? 0 : 1
    const rightPreferred = pattern.test(rightId) ? 0 : 1
    return (
      leftPreferred - rightPreferred ||
      firstSequence(left) - firstSequence(right) ||
      leftId.localeCompare(rightId)
    )
  })
}

/**
 * Mantém mais de um pallet em cada cadeia para que as retráteis continuem
 * trabalhando enquanto ainda existir carga no respectivo buffer.
 */
function selectDemonstrationPallets(missions: FleetMission[]): string[] {
  const entries = [...missionGroups(missions).entries()]
  const inbound = preferredFlowEntries(
    entries.filter(([, group]) =>
      groupHasRoles(group, ['inbound-transfer', 'putaway']),
    ),
    /(?:FLOW-IN|DEMO-IN)/i,
  ).slice(0, MAX_PALLETS_PER_FLOW)
  const outbound = preferredFlowEntries(
    entries.filter(([, group]) =>
      groupHasRoles(group, ['replenishment', 'shipping']),
    ),
    /(?:FLOW-OUT|DEMO-PICK|DEMO-RES)/i,
  ).slice(0, MAX_PALLETS_PER_FLOW)

  const selected = [...inbound, ...outbound].map(([palletId]) => palletId)
  if (selected.length > 0) return [...new Set(selected)]

  return entries.slice(0, MAX_PALLETS_PER_FLOW * 2).map(([palletId]) => palletId)
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

function point(
  source: FleetVehicleDefinition | undefined,
  x: number,
  z: number,
): FleetVehicleDefinition['startPoint'] {
  return {
    x,
    y: source?.startPoint.y ?? 0.2,
    z,
  }
}

function closestByX(
  vehicles: FleetVehicleDefinition[],
  targetX: number,
  excludedId?: string,
): FleetVehicleDefinition | undefined {
  return vehicles
    .filter((vehicle) => vehicle.id !== excludedId)
    .sort(
      (left, right) =>
        Math.abs(left.startPoint.x - targetX) -
        Math.abs(right.startPoint.x - targetX),
    )[0]
}

/**
 * Constrói duas cadeias independentes e fisicamente separadas:
 *
 * Recebimento: RX-REC → TP-IN → REACH-PUT.
 * Expedição: REACH-PICK → TP-OUT → RX-LOAD.
 *
 * As transpaleteiras aguardam no corredor de transferência, fora das áreas
 * exclusivas das RX20. As retráteis ficam em lados opostos do galpão, em vez de
 * serem clonadas a poucos metros da mesma vaga.
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

  const receivingX = receivingRxSource?.startPoint.x ?? -10
  const shippingX = shippingRxSource?.startPoint.x ?? 10
  const sideDirection = shippingX >= receivingX ? 1 : -1
  const receivingZ = receivingRxSource?.startPoint.z ?? 20
  const shippingZ = shippingRxSource?.startPoint.z ?? receivingZ

  const putawayReachSource = closestByX(reaches, receivingX) ?? reaches[0]
  const pickReachSource =
    closestByX(reaches, shippingX, putawayReachSource?.id) ??
    reaches.find((vehicle) => vehicle.id !== putawayReachSource?.id) ??
    putawayReachSource

  // RX20 permanece ao lado da própria doca. Os demais equipamentos ficam mais
  // para dentro do galpão e deslocados em direção ao centro, sem ocupar a zona
  // verde/azul reservada para manobra da contrabalançada.
  const inboundTpHome = point(
    inboundTpSource,
    receivingX + sideDirection * 4.8,
    receivingZ - 5.8,
  )
  const outboundTpHome = point(
    outboundTpSource,
    shippingX - sideDirection * 4.8,
    shippingZ - 5.8,
  )
  const putawayReachHome = point(
    putawayReachSource,
    receivingX + sideDirection * 8.2,
    receivingZ - 9.2,
  )
  const pickReachHome = point(
    pickReachSource,
    shippingX - sideDirection * 8.2,
    shippingZ - 9.2,
  )
  const focused = focusedMissions(plan)

  const vehicles = uniqueVehicles([
    cloneVehicle(receivingRxSource, {
      id: 'RX-REC',
      label: 'RX 20-20 — descarga exclusiva do recebimento',
      roles: RX_RECEIVING_ROLES,
      color: '#16a34a',
      speedScale: Math.min(receivingRxSource?.speedScale ?? 1, 0.88),
      startDelay: 0,
      startFacing: receivingRxSource?.startFacing ?? Math.PI,
    }),
    cloneVehicle(
      inboundTpSource,
      {
        id: 'TP-IN',
        label: 'Transpaleteira de entrada — descarga para o buffer da rua',
        roles: TP_INBOUND_ROLES,
        color: '#0ea5e9',
        speedScale: Math.min(inboundTpSource?.speedScale ?? 1, 0.94),
        startDelay: 0.2,
        startFacing: 0,
      },
      inboundTpHome,
    ),
    cloneVehicle(
      putawayReachSource,
      {
        id: 'REACH-PUT',
        label: 'Retrátil do recebimento — armazenagem no endereço',
        roles: REACH_PUTAWAY_ROLES,
        color: '#f59e0b',
        speedScale: Math.min(putawayReachSource?.speedScale ?? 1, 0.82),
        startDelay: 0.4,
        startFacing: 0,
      },
      putawayReachHome,
    ),
    cloneVehicle(
      pickReachSource,
      {
        id: 'REACH-PICK',
        label: 'Retrátil da expedição — retirada para o buffer de saída',
        roles: REACH_PICK_ROLES,
        color: '#eab308',
        speedScale: Math.min(pickReachSource?.speedScale ?? 1, 0.82),
        startDelay: 0.6,
        startFacing: 0,
      },
      pickReachHome,
    ),
    cloneVehicle(
      outboundTpSource,
      {
        id: 'TP-OUT',
        label: 'Transpaleteira de saída — buffer para o pré-embarque',
        roles: TP_OUTBOUND_ROLES,
        color: '#2563eb',
        speedScale: Math.min(outboundTpSource?.speedScale ?? 1, 0.94),
        startDelay: 0.8,
        startFacing: 0,
      },
      outboundTpHome,
    ),
    cloneVehicle(shippingRxSource, {
      id: 'RX-LOAD',
      label: 'RX 20-20 — carregamento exclusivo da expedição',
      roles: RX_SHIPPING_ROLES,
      color: '#0284c7',
      speedScale: Math.min(shippingRxSource?.speedScale ?? 1, 0.88),
      startDelay: 1,
      startFacing: shippingRxSource?.startFacing ?? Math.PI,
    }),
  ])

  return {
    ...plan,
    vehicles: vehicles.length === 6 ? vehicles : plan.vehicles.slice(0, 6),
    missions: focused.missions,
    initialPalletStops: focused.initialPalletStops,
  }
}
