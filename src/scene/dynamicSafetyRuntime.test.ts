import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  chooseMovingVehicleForFault,
  isRuntimeVehicleFaulted,
  removeRuntimeVehicle,
  resetDynamicSafetyRuntime,
  setRuntimeVehicleFault,
  upsertRuntimeVehicle,
} from './dynamicSafetyRuntime'

const point = { x: 0, y: 0.2, z: 0 }

describe('dynamicSafetyRuntime', () => {
  beforeEach(resetDynamicSafetyRuntime)
  afterEach(resetDynamicSafetyRuntime)

  it('escolhe um equipamento que realmente está em movimento', () => {
    upsertRuntimeVehicle({
      id: 'EMP-01',
      point,
      radius: 0.82,
      speed: 0,
      active: true,
    })
    upsertRuntimeVehicle({
      id: 'TP-01',
      point,
      radius: 0.62,
      speed: 2.1,
      active: true,
    })

    expect(chooseMovingVehicleForFault()).toBe('TP-01')
  })

  it('não escolhe máquina ociosa ou fora de missão', () => {
    upsertRuntimeVehicle({
      id: 'EMP-01',
      point,
      radius: 0.82,
      speed: 0.4,
      active: true,
    })
    upsertRuntimeVehicle({
      id: 'EMP-02',
      point,
      radius: 0.82,
      speed: 2.2,
      active: false,
    })

    expect(chooseMovingVehicleForFault()).toBeNull()
  })

  it('ativa e remove uma falha temporária', () => {
    setRuntimeVehicleFault('EMP-02', true)
    expect(isRuntimeVehicleFaulted('EMP-02')).toBe(true)

    setRuntimeVehicleFault('EMP-02', false)
    expect(isRuntimeVehicleFaulted('EMP-02')).toBe(false)
  })

  it('limpa a falha ao remover o veículo', () => {
    upsertRuntimeVehicle({
      id: 'EMP-02',
      point,
      radius: 0.82,
      speed: 2.2,
      active: true,
    })
    setRuntimeVehicleFault('EMP-02', true)
    removeRuntimeVehicle('EMP-02')

    expect(isRuntimeVehicleFaulted('EMP-02')).toBe(false)
    expect(chooseMovingVehicleForFault()).toBeNull()
  })
})
