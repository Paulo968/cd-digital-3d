import { describe, expect, it } from 'vitest'
import type {
  FleetMission,
  FleetVehicleDefinition,
  RealisticFleetPlan,
} from './realisticFleet'
import type { RealisticMissionStop } from './realisticMissionQueue'
import {
  chooseMiniWmsMissionForVehicle,
  createMiniWmsCycle,
  miniWmsEquipmentClass,
  miniWmsEquipmentDuty,
  truckAllowsMiniWmsMission,
  vehicleCanExecuteMiniWmsMission,
} from './miniWms'

function stop(
  id: string,
  kind: RealisticMissionStop['kind'],
): RealisticMissionStop {
  return {
    id,
    kind,
    label: id,
    access: { x: 0, y: 0.2, z: 0 },
    restingPoint: { x: 0, y: 0.5, z: 0 },
    facing: 0,
    forkHeight: 0.2,
  }
}

function vehicle(
  id: string,
  kind: FleetVehicleDefinition['kind'],
): FleetVehicleDefinition {
  return {
    id,
    label: id,
    kind,
    roles: ['inbound-transfer', 'putaway', 'replenishment', 'shipping'],
    color: '#fff',
    startPoint: { x: 0, y: 0.2, z: 0 },
    startFacing: 0,
    speedScale: 1,
    startDelay: 0,
  }
}

function mission(input: {
  id: string
  role: FleetMission['role']
  source: RealisticMissionStop
  destination: RealisticMissionStop
  eligibleKinds: FleetMission['eligibleKinds']
  sequence: number
}): FleetMission {
  return {
    ...input,
    palletId: `PALLET-${input.id}`,
    color: '#fff',
    priority: 1,
    trafficCells: [],
  }
}

const unload = mission({
  id: 'unload',
  role: 'inbound-transfer',
  source: stop('inbound-truck:1', 'truck'),
  destination: stop('receiving:1', 'receiving'),
  eligibleKinds: ['forklift'],
  sequence: 1,
})
const inboundTransfer = mission({
  id: 'inbound-transfer',
  role: 'inbound-transfer',
  source: stop('receiving:1', 'receiving'),
  destination: stop('aisle-buffer:A', 'receiving'),
  eligibleKinds: ['pallet-jack'],
  sequence: 2,
})
const putaway = mission({
  id: 'putaway',
  role: 'putaway',
  source: stop('aisle-buffer:A', 'receiving'),
  destination: stop('address:A-01', 'address'),
  eligibleKinds: ['forklift'],
  sequence: 3,
})
const retrieve = mission({
  id: 'retrieve',
  role: 'replenishment',
  source: stop('address:A-02', 'address'),
  destination: stop('outbound-buffer:A', 'receiving'),
  eligibleKinds: ['forklift'],
  sequence: 4,
})
const outboundTransfer = mission({
  id: 'outbound-transfer',
  role: 'replenishment',
  source: stop('outbound-buffer:A', 'receiving'),
  destination: stop('shipping-buffer:1', 'receiving'),
  eligibleKinds: ['pallet-jack'],
  sequence: 5,
})
const loadTruck = mission({
  id: 'load-truck',
  role: 'shipping',
  source: stop('shipping-buffer:1', 'receiving'),
  destination: stop('truck:1', 'truck'),
  eligibleKinds: ['forklift'],
  sequence: 6,
})

const stages = [
  unload,
  inboundTransfer,
  putaway,
  retrieve,
  outboundTransfer,
  loadTruck,
]

const equipment = [
  vehicle('RX-REC', 'forklift'),
  vehicle('TP-IN', 'pallet-jack'),
  vehicle('REACH-PUT', 'forklift'),
  vehicle('REACH-PICK', 'forklift'),
  vehicle('TP-OUT', 'pallet-jack'),
  vehicle('RX-LOAD', 'forklift'),
]

describe('mini WMS', () => {
  it('separa RX20, retrátil e transpaleteira por classe', () => {
    expect(miniWmsEquipmentClass(equipment[0])).toBe('counterbalance')
    expect(miniWmsEquipmentClass(equipment[2])).toBe('reach-truck')
    expect(miniWmsEquipmentClass(equipment[1])).toBe('pallet-jack')
  })

  it('atribui uma função exclusiva para cada um dos seis equipamentos', () => {
    expect(equipment.map(miniWmsEquipmentDuty)).toEqual([
      'receiving-dock',
      'inbound-transfer',
      'putaway',
      'retrieve',
      'outbound-transfer',
      'shipping-dock',
    ])
  })

  it('cada equipamento executa somente sua própria etapa', () => {
    equipment.forEach((currentVehicle, vehicleIndex) => {
      stages.forEach((currentMission, missionIndex) => {
        expect(
          vehicleCanExecuteMiniWmsMission(currentVehicle, currentMission),
        ).toBe(vehicleIndex === missionIndex)
      })
    })
  })

  it('o despachante não entrega a transferência de saída à TP de entrada', () => {
    const selected = chooseMiniWmsMissionForVehicle({
      vehicle: equipment[1],
      availableMissions: [outboundTransfer, inboundTransfer],
      reservedMissionIds: new Set(),
      reservedDestinationIds: new Set(),
    })

    expect(selected?.id).toBe('inbound-transfer')
  })

  it('mantém o carregamento aguardando enquanto o caminhão está fora da doca', () => {
    expect(truckAllowsMiniWmsMission(loadTruck, false)).toBe(false)
    expect(truckAllowsMiniWmsMission(loadTruck, true)).toBe(true)
    expect(truckAllowsMiniWmsMission(unload, false)).toBe(true)
  })

  it('gera IDs novos para cada ciclo operacional', () => {
    const plan: RealisticFleetPlan = {
      vehicles: [equipment[0]],
      missions: [unload],
      initialPalletStops: { [unload.palletId]: unload.source },
      receivingStops: [],
      stagingStops: [],
      truckStops: [],
    }

    const first = createMiniWmsCycle(plan, 1)
    const second = createMiniWmsCycle(plan, 2)

    expect(first.missions[0].id).not.toBe(second.missions[0].id)
    expect(first.missions[0].palletId).not.toBe(second.missions[0].palletId)
  })
})
