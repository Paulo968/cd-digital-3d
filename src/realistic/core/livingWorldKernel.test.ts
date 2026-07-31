import { describe, expect, it } from 'vitest'
import {
  LivingWorldKernel,
  type KernelCommand,
  type KernelStepContext,
  type KernelSystem,
} from './livingWorldKernel'

class CounterSystem implements KernelSystem {
  readonly id = 'counter'
  value = 0

  step(): void {
    this.value += 1
  }

  handleCommand(command: KernelCommand, context: KernelStepContext): void {
    if (command.type !== 'counter.add') return
    const amount = Number(command.payload.amount ?? 0)
    this.value += amount
    context.emit({
      type: 'counter.command.applied',
      payload: { amount },
    })
  }

  snapshot(): unknown {
    return { value: this.value }
  }

  restore(snapshot: unknown): void {
    const value = Number((snapshot as { value?: unknown })?.value)
    if (!Number.isFinite(value)) throw new Error('snapshot do contador inválido')
    this.value = value
  }
}

function createCounterKernel(fixedDelta = 0.05) {
  const kernel = new LivingWorldKernel({
    fixedDelta,
    maximumFrameDelta: 1,
    maximumSubSteps: 100,
    eventCapacity: 200,
  })
  const counter = new CounterSystem()
  kernel.registerSystem(counter)
  return { kernel, counter }
}

describe('LivingWorldKernel', () => {
  it('produz o mesmo estado com divisões de frame diferentes', () => {
    const first = createCounterKernel(1 / 30)
    const second = createCounterKernel(1 / 30)

    for (let index = 0; index < 120; index += 1) {
      first.kernel.advance(1 / 60)
    }
    for (let index = 0; index < 60; index += 1) {
      second.kernel.advance(1 / 30)
    }

    expect(first.counter.value).toBe(60)
    expect(second.counter.value).toBe(60)
    expect(first.kernel.telemetry().tick).toBe(second.kernel.telemetry().tick)
    expect(first.kernel.telemetry().time).toBeCloseTo(2, 10)
  })

  it('executa comandos agendados antes do passo dos sistemas', () => {
    const { kernel, counter } = createCounterKernel()
    kernel.enqueueCommand({
      type: 'counter.add',
      target: 'counter',
      executeAt: 0.1,
      payload: { amount: 5 },
    })

    kernel.advance(0.05)
    expect(counter.value).toBe(1)

    kernel.advance(0.05)
    expect(counter.value).toBe(7)
    expect(
      kernel.events().some((event) => event.type === 'counter.command.applied'),
    ).toBe(true)
  })

  it('pausa o tempo e permite avanço manual controlado', () => {
    const { kernel, counter } = createCounterKernel()
    kernel.pause()
    kernel.advance(0.5)
    expect(counter.value).toBe(0)
    expect(kernel.telemetry().tick).toBe(0)

    kernel.stepOnce()
    expect(counter.value).toBe(1)
    expect(kernel.telemetry().tick).toBe(1)

    kernel.resume()
    kernel.advance(0.1)
    expect(counter.value).toBe(3)
  })

  it('restaura o mundo e reproduz o mesmo futuro', () => {
    const { kernel, counter } = createCounterKernel()
    kernel.advance(0.2)
    const checkpoint = kernel.snapshot()

    kernel.enqueueCommand({
      type: 'counter.add',
      target: 'counter',
      payload: { amount: 9 },
    })
    kernel.advance(0.15)
    const firstFuture = {
      value: counter.value,
      telemetry: kernel.telemetry(),
      events: kernel.events(),
    }

    kernel.restore(checkpoint)
    kernel.enqueueCommand({
      type: 'counter.add',
      target: 'counter',
      payload: { amount: 9 },
    })
    kernel.advance(0.15)
    const secondFuture = {
      value: counter.value,
      telemetry: kernel.telemetry(),
      events: kernel.events(),
    }

    expect(secondFuture).toEqual(firstFuture)
  })
})
