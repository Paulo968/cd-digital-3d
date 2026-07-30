import { describe, expect, it } from 'vitest'
import {
  TrafficFlowCoordinator,
  type TrafficVehicleSnapshot,
} from './trafficFlowCoordinator'

function vehicle(
  id: string,
  z: number,
  facing?: number,
  speed = 0,
): TrafficVehicleSnapshot {
  return {
    id,
    point: { x: 0, y: 0.2, z },
    facing,
    speed,
  }
}

describe('TrafficFlowCoordinator', () => {
  it('mantém seguimento normal quando os dois veículos estão no mesmo sentido', () => {
    const coordinator = new TrafficFlowCoordinator()
    const decision = coordinator.decide({
      vehicle: vehicle('EMP-02', 0, 0),
      hazard: vehicle('EMP-01', 2.4, 0),
      separation: 2.4,
      blocked: true,
      immediateConflict: true,
      now: 1_000,
    })

    expect(decision.action).toBe('normal')
  })

  it('concede passagem determinística em conflito imediato', () => {
    const coordinator = new TrafficFlowCoordinator()
    const first = vehicle('EMP-01', 0, 0)
    const second = vehicle('EMP-02', 0.15, Math.PI)

    const winner = coordinator.decide({
      vehicle: first,
      hazard: second,
      separation: 0.15,
      blocked: true,
      immediateConflict: true,
      now: 1_000,
    })
    const loser = coordinator.decide({
      vehicle: second,
      hazard: first,
      separation: 0.15,
      blocked: true,
      immediateConflict: true,
      now: 1_010,
    })

    expect(winner.action).toBe('proceed')
    expect(winner.winnerId).toBe('EMP-01')
    expect(loser.action).toBe('yield')
    expect(loser.winnerId).toBe('EMP-01')
  })

  it('preserva a autorização depois que o vencedor começa a andar', () => {
    const coordinator = new TrafficFlowCoordinator()
    const first = vehicle('EMP-01', 0, 0)
    const second = vehicle('EMP-02', 0.2, Math.PI)

    coordinator.decide({
      vehicle: first,
      hazard: second,
      separation: 0.2,
      blocked: true,
      immediateConflict: true,
      now: 2_000,
    })

    const movingWinner = coordinator.decide({
      vehicle: { ...first, speed: 0.55 },
      hazard: second,
      separation: 1.4,
      blocked: true,
      now: 2_700,
    })

    expect(movingWinner.action).toBe('proceed')
    expect(movingWinner.speedLimit).toBeGreaterThan(0.08)
  })

  it('não libera o seguidor quando somente ele está bloqueado', () => {
    const coordinator = new TrafficFlowCoordinator()
    const follower = vehicle('EMP-02', 0, 0)
    const stoppedLeader = vehicle('EMP-01', 2.8)

    coordinator.decide({
      vehicle: follower,
      hazard: stoppedLeader,
      separation: 2.8,
      blocked: true,
      now: 3_000,
    })
    const decision = coordinator.decide({
      vehicle: follower,
      hazard: stoppedLeader,
      separation: 2.8,
      blocked: true,
      now: 4_000,
    })

    expect(decision.action).toBe('normal')
  })

  it('libera um conflito recíproco após o tempo de confirmação', () => {
    const coordinator = new TrafficFlowCoordinator()
    const first = vehicle('EMP-03', -1, 0)
    const second = vehicle('EMP-04', 1, Math.PI)

    coordinator.decide({
      vehicle: first,
      hazard: second,
      separation: 2,
      blocked: true,
      now: 5_000,
    })
    coordinator.decide({
      vehicle: second,
      hazard: first,
      separation: 2,
      blocked: true,
      now: 5_010,
    })
    const decision = coordinator.decide({
      vehicle: first,
      hazard: second,
      separation: 2,
      blocked: true,
      now: 5_500,
    })

    expect(['proceed', 'yield']).toContain(decision.action)
    expect(decision.winnerId).not.toBeNull()
  })
})
