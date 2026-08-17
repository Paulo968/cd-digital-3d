import { describe, expect, it } from 'vitest'
import { isDockRxColor } from './forkliftAppearance'

describe('modelo RX 20x20 das docas', () => {
  it('identifica a RX de recebimento e a RX de expedição', () => {
    expect(isDockRxColor('#16a34a')).toBe(true)
    expect(isDockRxColor('#0284c7')).toBe(true)
  })

  it('não transforma empilhadeiras territoriais em RX', () => {
    expect(isDockRxColor('#f59e0b')).toBe(false)
    expect(isDockRxColor('#eab308')).toBe(false)
    expect(isDockRxColor('#fb7185')).toBe(false)
    expect(isDockRxColor('#8b5cf6')).toBe(false)
  })
})
