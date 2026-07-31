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
const putaway = mission({
  id: 'putaway',
  role: 'putaway',
  source: stop('aisle-buffer:A', 'receiving'),
  destination: stop('address:A-01', 'address'),
  eligibleKinds: ['forklift'],
  sequence: 2,
})
const transfer = mission({
  id: 'transfer',
  role: 'inbound-transfer',
  source: stop('receiving:1', 'receiving'),
  destination: stop('aisle-buffer:A', 'receiving'),
  eligibleKinds: ['pallet-jack'],
  sequence: 3,
})
const loadTruck = mission({
  id: 'load-truck',
  role: 'shipping',
  source: stop('shipping-buffer:1', 'receiving'),
  destination: stop('truck:1', 'truck'),
  eligibleKinds: ['forklift'],
  sequence: 4,
})

describe('mini WMS', () => {
  it('separa RX20, retrátil e transpaleteira por classe', () => {
    expect(miniWmsEquipmentClass(vehicle('RX-20', 'forklift'))).toBe(
      'counterbalance',
    )
    expect(miniWmsEquipmentClass(vehicle('REACH-01', 'forklift'))).toBe(
      'reach-truck',
    )
    expect(miniWmsEquipmentClass(vehicle('TP-01', 'pallet-jack'))).toBe(
      'pallet-jack',
    )
  })

  it('não permite que a RX20 faça armazenagem nem que a retrátil descarregue caminhão', () => {
    expect(vehicleCanExecuteMiniWmsMission(vehicle('RX-20', 'forklift'), unload)).toBe(
      true,
    )
    expect(
      vehicleCanExecuteMiniWmsMission(vehicle('RX-20', 'forklift'), putaway),
    ).toBe(false)
    expect(
      vehicleCanExecuteMiniWmsMission(vehicle('REACH-01', 'forklift'), unload),
    ).toBe(false)
    expect(
      vehicleCanExecuteMiniWmsMission(vehicle('REACH-01', 'forklift'), putaway),
    ).toBe(true)
  })

  it('entrega a transferência interna somente à transpaleteira', () => {
    const selected = chooseMiniWmsMissionForVehicle({
      vehicle: vehicle('TP-01', 'pallet-jack'),
      availableMissions: [unload, putaway, transfer],
      reservedMissionIds: new Set(),
      reservedDestinationIds: new Set(),
    })

    expect(selected?.id).toBe('transfer')
  })

  it('mantém o carregamento aguardando enquanto o caminhão está fora da doca', () => {
    expect(truckAllowsMiniWmsMission(loadTruck, false)).toBe(false)
    expect(truckAllowsMiniWmsMission(loadTruck, true)).toBe(true)
    expect(truckAllowsMiniWmsMission(unload, false)).toBe(true)
  })

  it('gera IDs novos para cada ciclo operacional', () => {
    const plan: RealisticFleetPlan = {
      vehicles: [vehicle('RX-20', 'forklift')],
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
