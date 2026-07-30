import { describe, expect, it } from 'vitest'
import {
  orderQuantity,
  palletQuantity,
  productForPallet,
  scenarioProfile,
  zoneFromStopId,
} from './operationsControl'

describe('operationsControl', () => {
  it('mantém produtos e quantidades determinísticos por pallet', () => {
    expect(productForPallet('LIVE-IN-0001')).toEqual(
      productForPallet('LIVE-IN-0001'),
    )
    expect(palletQuantity('LIVE-IN-0001')).toEqual(
      palletQuantity('LIVE-IN-0001'),
    )
    const quantity = palletQuantity('LIVE-IN-0001')
    expect(quantity.units).toBeGreaterThan(0)
    expect(quantity.units).toBeLessThanOrEqual(quantity.capacity)
    expect(quantity.reorderPoint).toBeLessThan(quantity.capacity)
  })

  it('limita a quantidade do pedido ao saldo disponível', () => {
    expect(orderQuantity('AUTO-ORDER-0001', 4)).toBeGreaterThanOrEqual(1)
    expect(orderQuantity('AUTO-ORDER-0001', 4)).toBeLessThanOrEqual(4)
  })

  it('configura cenários com pressões operacionais diferentes', () => {
    expect(scenarioProfile('high-demand').orderIntervalMultiplier).toBeLessThan(1)
    expect(scenarioProfile('inbound-surge').inboundIntervalMultiplier).toBeLessThan(
      scenarioProfile('normal').inboundIntervalMultiplier,
    )
    expect(scenarioProfile('reduced-fleet').unavailableVehicleIds).toContain(
      'EMP-02',
    )
    expect(scenarioProfile('blocked-aisle').persistentObstacle).toBe(true)
  })

  it('classifica pontos básicos do fluxo por zona', () => {
    expect(zoneFromStopId('receiving:1')).toBe('receiving')
    expect(zoneFromStopId('staging:inbound:1')).toBe('staging')
    expect(zoneFromStopId('truck:1')).toBe('truck')
    expect(zoneFromStopId('address:A-01-02')).toBe('reserve')
  })
})
