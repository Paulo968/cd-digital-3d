import type { WarehouseLayout } from './layout'
import { buildOutboundPilotQueue } from './outboundPilot'
import type {
  FleetMissionRole,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'
import type { WarehouseLocation } from './warehouse'

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

/**
 * Piloto operacional de expedição.
 *
 * O recebimento fica completamente desativado nesta fase. Apenas três recursos
 * existem no mundo físico: uma retrátil retira o pallet do rack, uma
 * transpaleteira leva o mesmo pallet ao pré-embarque e uma RX20 carrega o
 * caminhão. Todos os endereços ocupados entram na fila, mas são executados em
 * ondas pequenas pelo Mini-WMS para preservar o desempenho do celular.
 */
export function buildStableFleetPlan(
  plan: RealisticFleetPlan,
  layout: WarehouseLayout,
  locations: WarehouseLocation[],
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

  const outbound = buildOutboundPilotQueue(plan, layout, locations)

  return {
    ...plan,
    vehicles: vehicles.length === 3 ? vehicles : plan.vehicles.slice(-3),
    missions: outbound.missions,
    initialPalletStops: outbound.initialPalletStops,
  }
}
