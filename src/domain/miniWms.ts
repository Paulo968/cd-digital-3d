import type {
  FleetMission,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'
import type { RealisticMissionStop } from './realisticMissionQueue'
import { inboundTruckIsDocked } from '../store/inboundTruckStore'
import { useOperationsControlStore } from '../store/operationsControlStore'

export type MiniWmsEquipmentClass =
  | 'counterbalance'
  | 'reach-truck'
  | 'pallet-jack'

export type MiniWmsEquipmentDuty =
  | 'receiving-dock'
  | 'inbound-transfer'
  | 'putaway'
  | 'retrieve'
  | 'outbound-transfer'
  | 'shipping-dock'

export type MiniWmsMissionStage =
  | 'unload-truck'
  | 'inbound-transfer'
  | 'putaway'
  | 'retrieve'
  | 'outbound-transfer'
  | 'load-truck'

export interface MiniWmsCycle {
  missions: FleetMission[]
  initialPalletStops: Record<string, RealisticMissionStop>
  palletColors: Record<string, string>
}

export const MINI_WMS_PALLETS_PER_WAVE = 6

const STAGE_ORDER: Record<MiniWmsMissionStage, number> = {
  'unload-truck': 0,
  retrieve: 0,
  'inbound-transfer': 1,
  'outbound-transfer': 1,
  putaway: 2,
  'load-truck': 2,
}

export function miniWmsEquipmentClass(
  vehicle: FleetVehicleDefinition,
): MiniWmsEquipmentClass {
  if (vehicle.kind === 'pallet-jack') return 'pallet-jack'
  if (/^(?:RX|CB)-/i.test(vehicle.id)) return 'counterbalance'
  return 'reach-truck'
}

/**
 * Define a única função permitida para cada equipamento da célula.
 * Os IDs são deliberadamente operacionais: mesmo que dois veículos tenham o
 * mesmo tipo físico, eles não podem disputar a etapa do outro.
 */
export function miniWmsEquipmentDuty(
  vehicle: FleetVehicleDefinition,
): MiniWmsEquipmentDuty {
  const id = vehicle.id.toUpperCase()
  if (id === 'RX-REC') return 'receiving-dock'
  if (id === 'TP-IN') return 'inbound-transfer'
  if (id === 'REACH-PUT') return 'putaway'
  if (id === 'REACH-PICK') return 'retrieve'
  if (id === 'TP-OUT') return 'outbound-transfer'
  if (id === 'RX-LOAD') return 'shipping-dock'

  const equipment = miniWmsEquipmentClass(vehicle)
  if (equipment === 'counterbalance') {
    return vehicle.roles.includes('shipping')
      ? 'shipping-dock'
      : 'receiving-dock'
  }
  if (equipment === 'reach-truck') {
    if (
      vehicle.roles.includes('replenishment') &&
      !vehicle.roles.includes('putaway')
    ) {
      return 'retrieve'
    }
    return /(?:PICK|OUT)/i.test(id) ? 'retrieve' : 'putaway'
  }
  if (
    vehicle.roles.includes('replenishment') &&
    !vehicle.roles.includes('inbound-transfer')
  ) {
    return 'outbound-transfer'
  }
  return /OUT/i.test(id) ? 'outbound-transfer' : 'inbound-transfer'
}

export function miniWmsVehicleBadge(vehicle: FleetVehicleDefinition): string {
  const labels: Record<MiniWmsEquipmentDuty, string> = {
    'receiving-dock': 'RX20 RECEBIMENTO · DESCARGA',
    'inbound-transfer': 'TP ENTRADA · TRANSFERÊNCIA',
    putaway: 'RETRÁTIL RECEBIMENTO · ARMAZENAGEM',
    retrieve: 'RETRÁTIL EXPEDIÇÃO · RETIRADA',
    'outbound-transfer': 'TP SAÍDA · PRÉ-EMBARQUE',
    'shipping-dock': 'RX20 EXPEDIÇÃO · CARGA',
  }
  return labels[miniWmsEquipmentDuty(vehicle)]
}

export function miniWmsMissionStage(
  mission: FleetMission,
): MiniWmsMissionStage {
  if (
    mission.role === 'inbound-transfer' &&
    mission.source.kind === 'truck'
  ) {
    return 'unload-truck'
  }
  if (mission.role === 'shipping' && mission.destination.kind === 'truck') {
    return 'load-truck'
  }
  if (mission.role === 'putaway') return 'putaway'
  if (
    mission.role === 'replenishment' &&
    mission.eligibleKinds.includes('forklift')
  ) {
    return 'retrieve'
  }
  if (mission.role === 'inbound-transfer') return 'inbound-transfer'
  return 'outbound-transfer'
}

export function vehicleCanExecuteMiniWmsMission(
  vehicle: FleetVehicleDefinition,
  mission: FleetMission,
): boolean {
  if (!mission.eligibleKinds.includes(vehicle.kind)) return false
  const duty = miniWmsEquipmentDuty(vehicle)
  const stage = miniWmsMissionStage(mission)

  const permittedStage: Record<MiniWmsEquipmentDuty, MiniWmsMissionStage> = {
    'receiving-dock': 'unload-truck',
    'inbound-transfer': 'inbound-transfer',
    putaway: 'putaway',
    retrieve: 'retrieve',
    'outbound-transfer': 'outbound-transfer',
    'shipping-dock': 'load-truck',
  }
  return permittedStage[duty] === stage
}

/**
 * Cada doca possui seu próprio ciclo. A RX-REC só entra no caminhão de entrada
 * quando ele está estacionado; a RX-LOAD segue a mesma regra na expedição.
 */
export function truckAllowsMiniWmsMission(
  mission: FleetMission,
  outboundTruckDocked: boolean,
  inboundTruckDocked = true,
): boolean {
  const stage = miniWmsMissionStage(mission)
  if (stage === 'unload-truck') return inboundTruckDocked
  if (stage === 'load-truck') return outboundTruckDocked
  return true
}

export function chooseMiniWmsMissionForVehicle(input: {
  vehicle: FleetVehicleDefinition
  availableMissions: FleetMission[]
  reservedMissionIds: Set<string>
  reservedDestinationIds: Set<string>
}): FleetMission | undefined {
  const outboundTruckDocked =
    useOperationsControlStore.getState().truck.phase === 'docked'
  const inboundDocked = inboundTruckIsDocked()

  return input.availableMissions
    .filter(
      (mission) =>
        !input.reservedMissionIds.has(mission.id) &&
        !input.reservedDestinationIds.has(mission.destination.id) &&
        truckAllowsMiniWmsMission(
          mission,
          outboundTruckDocked,
          inboundDocked,
        ) &&
        vehicleCanExecuteMiniWmsMission(input.vehicle, mission),
    )
    .sort((left, right) => {
      const leftStage = miniWmsMissionStage(left)
      const rightStage = miniWmsMissionStage(right)
      return (
        STAGE_ORDER[leftStage] - STAGE_ORDER[rightStage] ||
        left.priority - right.priority ||
        left.sequence - right.sequence ||
        left.id.localeCompare(right.id)
      )
    })[0]
}

export function miniWmsAssignmentReason(
  vehicle: FleetVehicleDefinition,
  mission: FleetMission,
): string {
  const stage = miniWmsMissionStage(mission)
  const action: Record<MiniWmsMissionStage, string> = {
    'unload-truck': 'descarregar o caminhão no recebimento',
    'inbound-transfer': 'levar o pallet da descarga ao buffer da rua',
    putaway: 'armazenar o pallet no endereço vazio definido',
    retrieve: 'retirar o pallet solicitado do rack para a expedição',
    'outbound-transfer': 'levar exatamente esse pallet ao pré-embarque',
    'load-truck': 'carregar o pallet no caminhão de expedição',
  }
  return `${miniWmsVehicleBadge(vehicle)} autorizada para ${action[stage]}. ${mission.source.label} → ${mission.destination.label}.`
}

function orderedPalletGroups(plan: RealisticFleetPlan): string[][] {
  const groups = new Map<string, FleetMission[]>()
  plan.missions.forEach((mission) => {
    const current = groups.get(mission.palletId) ?? []
    current.push(mission)
    groups.set(mission.palletId, current)
  })

  const palletIds = [...groups.entries()]
    .sort((left, right) => {
      const leftSequence = Math.min(...left[1].map((mission) => mission.sequence))
      const rightSequence = Math.min(...right[1].map((mission) => mission.sequence))
      return leftSequence - rightSequence || left[0].localeCompare(right[0])
    })
    .map(([palletId]) => palletId)

  const waves: string[][] = []
  for (
    let index = 0;
    index < palletIds.length;
    index += MINI_WMS_PALLETS_PER_WAVE
  ) {
    waves.push(palletIds.slice(index, index + MINI_WMS_PALLETS_PER_WAVE))
  }
  return waves
}

export function miniWmsWaveCount(plan: RealisticFleetPlan): number {
  return Math.max(1, orderedPalletGroups(plan).length)
}

/**
 * Clona somente uma onda de pallets por ciclo sem reaproveitar IDs de
 * telemetria. Todas as posições ocupadas permanecem elegíveis no plano, mas no
 * máximo seis pallets são materializados ao mesmo tempo. Isso mantém a operação
 * clara e evita sobrecarga no celular.
 */
export function createMiniWmsCycle(
  plan: RealisticFleetPlan,
  cycle: number,
): MiniWmsCycle {
  const waves = orderedPalletGroups(plan)
  const selectedBasePalletIds = new Set(
    waves.length > 0 ? waves[(Math.max(1, cycle) - 1) % waves.length] : [],
  )
  const selectedMissions = plan.missions.filter((mission) =>
    selectedBasePalletIds.has(mission.palletId),
  )
  const palletIdMap = new Map<string, string>()
  const cycleSuffix = `C${String(cycle).padStart(2, '0')}`

  const cyclePalletId = (baseId: string) => {
    const existing = palletIdMap.get(baseId)
    if (existing) return existing
    const next = `${baseId}-${cycleSuffix}`
    palletIdMap.set(baseId, next)
    return next
  }

  const missions = selectedMissions.map((mission) => ({
    ...mission,
    id: `${mission.id}-${cycleSuffix}`,
    palletId: cyclePalletId(mission.palletId),
  }))
  const initialPalletStops = Object.fromEntries(
    Object.entries(plan.initialPalletStops)
      .filter(([palletId]) => selectedBasePalletIds.has(palletId))
      .map(([palletId, stop]) => [cyclePalletId(palletId), stop]),
  )
  const palletColors = Object.fromEntries(
    missions.map((mission) => [mission.palletId, mission.color]),
  )

  return { missions, initialPalletStops, palletColors }
}
