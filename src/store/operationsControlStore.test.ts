import { beforeEach, describe, expect, it } from 'vitest'
import {
  assignOperationMission,
  completeTruckCycle,
  publishOperationVehicleRuntime,
  recordOperationMission,
  recordOperationOrder,
  recordPalletReceived,
  recordTruckDeparture,
  registerOperationVehicle,
  useOperationsControlStore,
} from './operationsControlStore'

describe('operationsControlStore', () => {
  beforeEach(() => {
    useOperationsControlStore.getState().resetSession()
  })

  it('registra pallet com produto, quantidade e métrica de recebimento', () => {
    recordPalletReceived('TEST-PAL-01', 'receiving:1', 'Recebimento 1', 100)

    const state = useOperationsControlStore.getState()
    expect(state.pallets['TEST-PAL-01'].units).toBeGreaterThan(0)
    expect(state.pallets['TEST-PAL-01'].zone).toBe('receiving')
    expect(state.metrics.receivedPallets).toBe(1)
  })

  it('acompanha designação e conclusão da missão pelo runtime', () => {
    recordOperationMission(
      {
        id: 'MISSION-01',
        palletId: 'TEST-PAL-02',
        role: 'replenishment',
        sourceId: 'address:A-01-02',
        sourceLabel: 'Reserva 1',
        destinationId: 'address:A-01-01',
        destinationLabel: 'Picking 1',
      },
      200,
    )
    assignOperationMission(
      { id: 'EMP-99', label: 'Empilhadeira de teste', kind: 'forklift' },
      'MISSION-01',
      'Veículo mais próximo e rota livre.',
      210,
    )

    publishOperationVehicleRuntime('EMP-99', 1.4, true, 300)
    publishOperationVehicleRuntime('EMP-99', 0, false, 600)

    const state = useOperationsControlStore.getState()
    expect(state.missions.find((mission) => mission.id === 'MISSION-01')?.status).toBe(
      'completed',
    )
    expect(state.pallets['TEST-PAL-02'].zone).toBe('picking')
    expect(state.vehicles['EMP-99'].status).toBe('idle')
    expect(state.metrics.missionsCompleted).toBe(1)
  })

  it('marca veículos do cenário de equipe reduzida como indisponíveis', () => {
    useOperationsControlStore.getState().setScenario('reduced-fleet')
    registerOperationVehicle(
      { id: 'EMP-02', label: 'Empilhadeira 2', kind: 'forklift' },
      500,
    )

    expect(useOperationsControlStore.getState().vehicles['EMP-02'].status).toBe(
      'unavailable',
    )
  })

  it('expede unidades pedidas e inicia um novo ciclo de caminhão', () => {
    recordPalletReceived('TEST-PAL-03', 'address:B-01-01', 'Picking 2', 1000)
    const ordered = recordOperationOrder('AUTO-ORDER-TEST', 'TEST-PAL-03', 1100)
    recordTruckDeparture(['TEST-PAL-03'], 1200)

    let state = useOperationsControlStore.getState()
    expect(state.pallets['TEST-PAL-03']).toBeUndefined()
    expect(state.orders[0].status).toBe('shipped')
    expect(state.metrics.shippedUnits).toBe(ordered)
    expect(state.truck.phase).toBe('closing')

    completeTruckCycle(1500)
    state = useOperationsControlStore.getState()
    expect(state.truck.phase).toBe('docked')
    expect(state.truck.cycle).toBe(2)
  })
})
