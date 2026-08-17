const RX_RECEIVING_COLOR = '#16a34a'
const RX_SHIPPING_COLOR = '#0284c7'

export function isDockRxColor(accent: string): boolean {
  const normalized = accent.toLowerCase()
  return normalized === RX_RECEIVING_COLOR || normalized === RX_SHIPPING_COLOR
}
