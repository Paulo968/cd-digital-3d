import type {
  FleetMission,
  FleetMissionRole,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'

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
      (vehicle.id.startsWith('RX-') || vehicle.roles.includes('shipping')),
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
  startPoint: FleetVehicleDefinition['startPoint'],
): FleetVehicleDefinition | undefined {
  if (!source) return undefined
  return { ...source, ...input, startPoint }
}

function point(
  source: FleetVehicleDefinition | undefined,
  x: number,
  z: number,
): FleetVehicleDefinition['startPoint'] {
  return { x, y: source?.startPoint.y ?? 0.2, z }
}

function groupMissionsByPallet(
  missions: FleetMission[],
): Map<string, FleetMission[]> {
  const groups = new Map<string, FleetMission[]>()
  missions.forEach((mission) => {
    const current = groups.get(mission.palletId) ?? []
    current.push(mission)
    groups.set(mission.palletId, current)
  })
  return groups
}

function isCompleteOutboundChain(missions: FleetMission[]): boolean {
  const roles = missions.map((mission) => mission.role)
  return (
    roles.filter((role) => role === 'replenishment').length >= 2 &&
    roles.includes('shipping')
  )
}

function outboundOnlyMissions(plan: RealisticFleetPlan): {
  missions: FleetMission[]
  initialPalletStops: RealisticFleetPlan['initialPalletStops']
} {
  const palletIds = new Set(
    [...groupMissionsByPallet(plan.missions).entries()]
      .filter(([, missions]) => isCompleteOutboundChain(missions))
      .map(([palletId]) => palletId),
  )
  const missions = plan.missions
    .filter((mission) => palletIds.has(mission.palletId))
    .sort((left, right) => left.sequence - right.sequence)
  const initialPalletStops = Object.fromEntries(
    Object.entries(plan.initialPalletStops).filter(([palletId]) =>
      palletIds.has(palletId),
    ),
  )
  return { missions, initialPalletStops }
}

/**
 * Piloto operacional de expedição.
 *
 * O recebimento fica completamente desativado nesta fase. Apenas três recursos
 * existem no mundo físico: uma retrátil retira o pallet do rack, uma
 * transpaleteira leva o mesmo pallet ao pré-embarque e uma RX20 carrega o
 * caminhão. As vagas são afastadas entre si e ficam todas do lado da expedição.
 */
export function buildStableFleetPlan(
  plan: RealisticFleetPlan,
): RealisticFleetPlan {
  const counterbalances = counterbalanceVehicles(plan.vehicles)
  const reaches = reachVehicles(plan.vehicles)
  const palletJacks = palletJackVehicles(plan.vehicles)

  const shippingRxSource =
    vehicleById(plan.vehicles, 'RX-LOAD') ??
    counterbalances.find((vehicle) => vehicle.roles.includes('shipping')) ??
    counterbalances[0]
  const outboundTpSource =
    vehicleById(plan.vehicles, 'TP-OUT') ??
    palletJacks.find((vehicle) => vehicle.roles.includes('replenishment')) ??
    palletJacks[0]
  const pickReachSource =
    reaches.find((vehicle) => vehicle.roles.includes('replenishment')) ?? reaches[0]

  const shippingX = shippingRxSource?.startPoint.x ?? 24
  const shippingZ = shippingRxSource?.startPoint.z ?? 30
  const inward = shippingX >= 0 ? -1 : 1

  const rxHome = point(shippingRxSource, shippingX, shippingZ)
  const tpHome = point(
    outboundTpSource,
    shippingX + inward * 8.5,
    shippingZ - 8.5,
  )
  const reachHome = point(
    pickReachSource,
    shippingX + inward * 17,
    shippingZ - 15,
  )

  const vehicles = [
    cloneVehicle(
      pickReachSource,
      {
        id: 'REACH-PICK',
        label: 'Retrátil da expedição — retirada dos pallets do rack',
        roles: REACH_PICK_ROLES,
        color: '#eab308',
        speedScale: Math.min(pickReachSource?.speedScale ?? 1, 0.82),
        startDelay: 0,
        startFacing: 0,
      },
      reachHome,
    ),
    cloneVehicle(
      outboundTpSource,
      {
        id: 'TP-OUT',
        label: 'Transpaleteira da expedição — buffer até o pré-embarque',
        roles: TP_OUTBOUND_ROLES,
        color: '#2563eb',
        speedScale: Math.min(outboundTpSource?.speedScale ?? 1, 0.94),
        startDelay: 0.35,
        startFacing: 0,
      },
      tpHome,
    ),
    cloneVehicle(
      shippingRxSource,
      {
        id: 'RX-LOAD',
        label: 'RX 20-20 da expedição — carregamento do caminhão',
        roles: RX_SHIPPING_ROLES,
        color: '#0284c7',
        speedScale: Math.min(shippingRxSource?.speedScale ?? 1, 0.88),
        startDelay: 0.7,
        startFacing: shippingRxSource?.startFacing ?? Math.PI,
      },
      rxHome,
    ),
  ].filter((vehicle): vehicle is FleetVehicleDefinition => Boolean(vehicle))

  const outbound = outboundOnlyMissions(plan)

  return {
    ...plan,
    vehicles: vehicles.length === 3 ? vehicles : plan.vehicles.slice(-3),
    missions: outbound.missions,
    initialPalletStops: outbound.initialPalletStops,
  }
}
