import { describe, expect, it } from 'vitest'
import {
  GROWING_RECEIVING_CONFIG,
  createGrowingReceivingSimulation,
} from '../../realistic-v2/growingReceivingOperation'
import { createReceivingKernelRuntime } from './receivingKernelRuntime'

describe('ReceivingKernelRuntime', () => {
  it('publica eventos, tarefas e reservas durante a descarga', () => {
    const runtime = createGrowingReceivingSimulation()

    for (let frame = 0; frame < 120_000; frame += 1) {
      runtime.step(1 / 60)
      if (runtime.read().completedTrucks >= 1) break
    }

    expect(runtime.read().completedTrucks).toBeGreaterThanOrEqual(1)
    const events = runtime.events(1_000)
    const eventTypes = new Set(events.map((event) => event.type))
    expect(eventTypes.has('pallet.picked')).toBe(true)
    expect(eventTypes.has('pallet.staged')).toBe(true)
    expect(eventTypes.has('truck.receiving.completed')).toBe(true)
    expect(eventTypes.has('task.created')).toBe(true)
    expect(eventTypes.has('task.assigned')).toBe(true)
    expect(eventTypes.has('task.started')).toBe(true)
    expect(eventTypes.has('task.completed')).toBe(true)
    expect(eventTypes.has('reservation.created')).toBe(true)

    const firstAssignment = events.find((event) => event.type === 'task.assigned')
    const firstPickup = events.find((event) => event.type === 'pallet.picked')
    expect(firstAssignment).toBeDefined()
    expect(firstPickup).toBeDefined()
    expect(firstAssignment!.sequence).toBeLessThan(firstPickup!.sequence)

    const operations = runtime.operations()
    expect(operations.completed).toBeGreaterThanOrEqual(6)
    expect(operations.tasks.some((task) => task.destinationSlot !== null)).toBe(true)
    expect(operations.resource.id).toBe('RX20-REC')
    expect(runtime.telemetry().tick).toBeGreaterThan(0)
  })

  it('bloqueia a RX20 quando não existe vaga reservável', () => {
    const runtime = createReceivingKernelRuntime({
      ...GROWING_RECEIVING_CONFIG,
      id: 'receiving-without-staging-capacity',
      stagingCapacity: 0,
    })

    for (let index = 0; index < 10_000; index += 1) {
      runtime.step(1 / 30)
    }

    expect(runtime.read().truck.phase).toBe('docked')
    expect(runtime.read().forklift.phase).toBe('parked')
    expect(runtime.read().pallets.every((pallet) => pallet.phase === 'truck')).toBe(
      true,
    )
    expect(runtime.read().fault).toBeNull()
    expect(runtime.operations().activeTask).toBeNull()
    expect(runtime.executionPermit()).toMatchObject({
      allowed: false,
      reason: 'no-assigned-task',
    })
    expect(
      runtime.events(500).some(
        (event) =>
          event.type === 'receiving.execution.blocked' &&
          event.payload.reason === 'no-assigned-task',
      ),
    ).toBe(true)
    expect(runtime.events(500).some((event) => event.type === 'pallet.picked')).toBe(
      false,
    )
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
    expect(runtime.operations().tasks).toHaveLength(6)
    expect(runtime.operations().reservedSlots).toEqual([0, 1, 2, 3, 4, 5])
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
      operations: runtime.operations(),
      permit: runtime.executionPermit(),
      events: runtime.events(120),
    }

    runtime.restore(checkpoint)
    for (let index = 0; index < 900; index += 1) {
      runtime.step(1 / 30)
    }
    const secondFuture = {
      state: runtime.snapshot(),
      telemetry: runtime.telemetry(),
      operations: runtime.operations(),
      permit: runtime.executionPermit(),
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
    expect(runtime.operations().tasks).toHaveLength(6)
    expect(runtime.operations().completed).toBe(0)
    expect(runtime.events().some((event) => event.type === 'receiving.reset')).toBe(
      true,
    )
    expect(
      runtime.events().some((event) => event.type === 'receiving.operations.reset'),
    ).toBe(true)
  })
})
