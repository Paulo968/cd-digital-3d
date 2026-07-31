import { describe, expect, it } from 'vitest'
import {
  GROWING_RECEIVING_CONFIG,
  createGrowingReceivingSimulation,
} from '../../realistic-v2/growingReceivingOperation'
import { createReceivingKernelRuntime } from './receivingKernelRuntime'

describe('ReceivingKernelRuntime', () => {
  it('publica eventos logísticos durante a descarga', () => {
    const runtime = createGrowingReceivingSimulation()

    for (let frame = 0; frame < 120_000; frame += 1) {
      runtime.step(1 / 60)
      if (runtime.read().completedTrucks >= 1) break
    }

    expect(runtime.read().completedTrucks).toBeGreaterThanOrEqual(1)
    const eventTypes = new Set(runtime.events(500).map((event) => event.type))
    expect(eventTypes.has('pallet.picked')).toBe(true)
    expect(eventTypes.has('pallet.staged')).toBe(true)
    expect(eventTypes.has('truck.receiving.completed')).toBe(true)
    expect(runtime.telemetry().tick).toBeGreaterThan(0)
  })

  it('pausa e avança um único tick sem depender do React', () => {
    const runtime = createGrowingReceivingSimulation()
    runtime.pause()
    const before = runtime.snapshot()

    runtime.step(2)
    expect(runtime.snapshot()).toEqual(before)

    runtime.stepOnce()
    expect(runtime.telemetry().tick).toBe(1)
    expect(runtime.snapshot().elapsed).toBeCloseTo(1 / 30, 10)
  })

  it('restaura checkpoint e reproduz exatamente o mesmo futuro', () => {
    const runtime = createReceivingKernelRuntime(GROWING_RECEIVING_CONFIG)

    for (let index = 0; index < 2_400; index += 1) {
      runtime.step(1 / 30)
    }
    const checkpoint = runtime.checkpoint()

    for (let index = 0; index < 900; index += 1) {
      runtime.step(1 / 30)
    }
    const firstFuture = {
      state: runtime.snapshot(),
      telemetry: runtime.telemetry(),
      events: runtime.events(120),
    }

    runtime.restore(checkpoint)
    for (let index = 0; index < 900; index += 1) {
      runtime.step(1 / 30)
    }
    const secondFuture = {
      state: runtime.snapshot(),
      telemetry: runtime.telemetry(),
      events: runtime.events(120),
    }

    expect(secondFuture).toEqual(firstFuture)
  })

  it('reinicia por comando do kernel e mantém rastreabilidade', () => {
    const runtime = createGrowingReceivingSimulation()
    for (let index = 0; index < 900; index += 1) runtime.step(1 / 30)
    expect(runtime.telemetry().tick).toBeGreaterThan(0)

    runtime.reset()

    expect(runtime.read().batch).toBe(1)
    expect(runtime.read().completedTrucks).toBe(0)
    expect(runtime.events().some((event) => event.type === 'receiving.reset')).toBe(
      true,
    )
  })
})
