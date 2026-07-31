import type { RealisticMissionStop } from './realisticMissionQueue'

const BUFFER_PATTERN =
  /(?:receiving:|staging:|aisle-buffer:|outbound-buffer:|shipping-buffer:|descarga|buffer|pré-embarque|espera)/i

/**
 * Pallets já posicionados dentro do caminhão ou armazenados no endereço do
 * rack não pertencem à via de circulação. Mantê-los como círculos de colisão
 * fazia pallets vizinhos bloquearem a empilhadeira antes de ela alcançar a
 * posição de coleta/entrega.
 */
export function palletActsAsTrafficHazard(
  stop: RealisticMissionStop,
): boolean {
  return stop.kind !== 'address' && stop.kind !== 'truck'
}

/**
 * O valor representa quanto o pallet invade a faixa de circulação, não o raio
 * geométrico da carga. Buffers são áreas demarcadas e, por isso, usam envelope
 * lateral menor que um obstáculo solto no piso.
 */
export function palletTrafficRadius(stop: RealisticMissionStop): number {
  const description = `${stop.id} ${stop.label}`
  return BUFFER_PATTERN.test(description) ? 0.38 : 0.46
}
