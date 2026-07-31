import { RECEIVING_V2, type Point2 } from './receivingSimulation'

/**
 * Staging compacto do recebimento.
 *
 * A ordem começa pela fileira do fundo e termina pela fileira mais próxima da
 * faixa de aproximação. Assim a RX20 nunca precisa atravessar um pallet que já
 * foi depositado para alcançar a próxima posição.
 *
 * O bloco fica no canto direito do galpão. A faixa à esquerda permanece livre
 * para a futura transpaleteira entrar, alinhar, manobrar e retirar os pallets.
 */
export const COMPACT_STAGING_POINTS = [
  { x: 19.5, z: -24 },
  { x: 24.2, z: -24 },
  { x: 19.5, z: -19.5 },
  { x: 24.2, z: -19.5 },
  { x: 19.5, z: -15 },
  { x: 24.2, z: -15 },
] as const satisfies readonly Point2[]

export const FUTURE_TRANSPALLET_LANE = {
  centerX: 14.6,
  centerZ: -19.5,
  width: 4.2,
  depth: 18,
  entryZ: -10.5,
  maneuverRadius: 2.1,
} as const

let activeStageIndex = 0
const stageXs = RECEIVING_V2.stageXs as unknown as number[]

COMPACT_STAGING_POINTS.forEach((point, index) => {
  Object.defineProperty(stageXs, index, {
    configurable: true,
    enumerable: true,
    get() {
      activeStageIndex = index
      return point.x
    },
  })
})

Object.defineProperty(RECEIVING_V2, 'stagingZ', {
  configurable: true,
  enumerable: true,
  get() {
    return COMPACT_STAGING_POINTS[activeStageIndex]?.z ?? -19.5
  },
})

export function compactStagingPoint(index: number): Point2 {
  const point = COMPACT_STAGING_POINTS[index]
  if (!point) throw new Error(`Posição de staging inexistente: ${index}`)
  return { x: point.x, z: point.z }
}
