import type {
  FleetMission,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'
import type { RealisticMissionStop } from './realisticMissionQueue'

export type MiniWmsEquipmentClass =
  | 'counterbalance'
  | 'reach-truck'
  | 'pallet-jack'

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

export function miniWmsVehicleBadge(vehicle: FleetVehicleDefinition): string {
  const equipment = miniWmsEquipmentClass(vehicle)
  if (equipment === 'counterbalance') return 'RX 20-20 · DOCAS'
  if (equipment === 'reach-truck') return 'RETRÁTIL · RUAS'
  return 'TRANSPALETEIRA · TRANSFERÊNCIA'
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
  const equipment = miniWmsEquipmentClass(vehicle)
  const stage = miniWmsMissionStage(mission)

  if (equipment === 'counterbalance') {
    return stage === 'unload-truck' || stage === 'load-truck'
  }
  if (equipment === 'reach-truck') {
    return stage === 'putaway' || stage === 'retrieve'
  }
  return stage === 'inbound-transfer' || stage === 'outbound-transfer'
}

export function chooseMiniWmsMissionForVehicle(input: {
  vehicle: FleetVehicleDefinition
  availableMissions: FleetMission[]
  reservedMissionIds: Set<string>
  reservedDestinationIds: Set<string>
}): FleetMission | undefined {
  return input.availableMissions
    .filter(
      (mission) =>
        !input.reservedMissionIds.has(mission.id) &&
        !input.reservedDestinationIds.has(mission.destination.id) &&
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
    'inbound-transfer': 'levar o pallet do recebimento ao buffer da rua',
    putaway: 'armazenar o pallet no endereço definido',
    retrieve: 'retirar o pallet do rack para a expedição',
    'outbound-transfer': 'levar o pallet ao pré-embarque',
    'load-truck': 'carregar o pallet no caminhão de expedição',
  }
  return `${miniWmsVehicleBadge(vehicle)} autorizada para ${action[stage]}. ${mission.source.label} → ${mission.destination.label}.`
}

/**
 * Clona as missões para um novo ciclo sem reaproveitar IDs de telemetria.
 * Os pallets também recebem um sufixo de ciclo; assim o painel operacional e o
 * registro de obstáculos nunca confundem uma carga antiga com a nova rodada.
 */
export function createMiniWmsCycle(
  plan: RealisticFleetPlan,
  cycle: number,
): MiniWmsCycle {
  const palletIdMap = new Map<string, string>()
  const cycleSuffix = `C${String(cycle).padStart(2, '0')}`

  const cyclePalletId = (baseId: string) => {
    const existing = palletIdMap.get(baseId)
    if (existing) return existing
    const next = `${baseId}-${cycleSuffix}`
    palletIdMap.set(baseId, next)
    return next
  }

  const missions = plan.missions.map((mission) => ({
    ...mission,
    id: `${mission.id}-${cycleSuffix}`,
    palletId: cyclePalletId(mission.palletId),
  }))
  const initialPalletStops = Object.fromEntries(
    Object.entries(plan.initialPalletStops).map(([palletId, stop]) => [
      cyclePalletId(palletId),
      stop,
    ]),
  )
  const palletColors = Object.fromEntries(
    missions.map((mission) => [mission.palletId, mission.color]),
  )

  return { missions, initialPalletStops, palletColors }
}
