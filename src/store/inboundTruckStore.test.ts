import { afterEach, describe, expect, it } from 'vitest'
import {
  inboundTruckIsDocked,
  useInboundTruckStore,
} from './inboundTruckStore'

afterEach(() => {
  useInboundTruckStore.getState().reset()
})

describe('inboundTruckStore', () => {
  it('começa com caminhão estacionado na doca', () => {
    expect(inboundTruckIsDocked()).toBe(true)
    expect(useInboundTruckStore.getState().cycle).toBe(1)
  })

  it('bloqueia a doca durante saída e chegada', () => {
    useInboundTruckStore.getState().setPhase('departing')
    expect(inboundTruckIsDocked()).toBe(false)

    useInboundTruckStore.getState().setPhase('approaching')
    expect(inboundTruckIsDocked()).toBe(false)
  })

  it('conclui a troca com uma nova carroceria estacionada', () => {
    useInboundTruckStore.getState().setPhase('away')
    useInboundTruckStore.getState().completeCycle()

    expect(inboundTruckIsDocked()).toBe(true)
    expect(useInboundTruckStore.getState().cycle).toBe(2)
  })
})
