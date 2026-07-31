import { describe, expect, it } from 'vitest'
import { resolveVehicleContactMotion } from './vehicleContact'

const point = (x: number, z: number) => ({ x, y: 0.2, z })

describe('resolveVehicleContactMotion', () => {
  it('interrompe o movimento antes de atravessar outro veículo', () => {
    const result = resolveVehicleContactMotion({
      vehicleId: 'RX-20',
      current: point(0, 0),
      proposed: point(5, 0),
      radius: 0.8,
      bodies: [{ id: 'REACH-01', point: point(2.2, 0), radius: 0.7 }],
      clearance: 0.1,
    })

    expect(result.touching).toBe(true)
    expect(result.blockedBy).toBe('REACH-01')
    expect(result.fraction).toBeGreaterThan(0)
    expect(result.fraction).toBeLessThan(1)
    expect(Math.hypot(result.point.x - 2.2, result.point.z)).toBeGreaterThanOrEqual(
      1.58,
    )
  })

  it('considera veículo parado como corpo físico', () => {
    const result = resolveVehicleContactMotion({
      vehicleId: 'TP-01',
      current: point(-1, 0),
      proposed: point(2, 0),
      radius: 0.55,
      bodies: [{ id: 'RX-20', point: point(0.8, 0), radius: 0.78 }],
    })

    expect(result.touching).toBe(true)
    expect(result.blockedBy).toBe('RX-20')
  })

  it('permite que corpos sobrepostos se afastem', () => {
    const result = resolveVehicleContactMotion({
      vehicleId: 'REACH-01',
      current: point(0, 0),
      proposed: point(-1, 0),
      radius: 0.7,
      bodies: [{ id: 'RX-20', point: point(0.5, 0), radius: 0.8 }],
    })

    expect(result.fraction).toBe(1)
    expect(result.blockedBy).toBeNull()
  })

  it('respeita o primeiro contato quando existem vários corpos', () => {
    const result = resolveVehicleContactMotion({
      vehicleId: 'RX-20',
      current: point(0, 0),
      proposed: point(8, 0),
      radius: 0.8,
      bodies: [
        { id: 'TP-01', point: point(5, 0), radius: 0.55 },
        { id: 'REACH-01', point: point(3, 0), radius: 0.7 },
      ],
    })

    expect(result.blockedBy).toBe('REACH-01')
  })
})
