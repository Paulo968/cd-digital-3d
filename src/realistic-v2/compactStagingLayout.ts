import {
  RECEIVING_V2,
  ReceivingSimulation,
  type Point2,
  type ReceivingScenarioConfig,
} from './receivingSimulation'

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

export function compactStagingPoint(index: number): Point2 {
  const point = COMPACT_STAGING_POINTS[index]
  if (!point) throw new Error(`Posição de staging inexistente: ${index}`)
  return { x: point.x, z: point.z }
}

/**
 * Cenário compacto explícito, sem mutar RECEIVING_V2 nem o prototype do motor.
 */
export const COMPACT_RECEIVING_CONFIG: ReceivingScenarioConfig = {
  ...RECEIVING_V2,
  id: 'receiving-compact-staging',
  palletIdPrefix: 'REC-COMPACT',
  stageXs: COMPACT_STAGING_POINTS.map((point) => point.x),
  stagingZ: COMPACT_STAGING_POINTS[0].z,
  stagingCapacity: COMPACT_STAGING_POINTS.length,
  preserveStagedPallets: false,
  resolveStagingPoint: compactStagingPoint,
  resolveDockApproachControl: (current) => ({
    x: current.x,
    z: Math.max(current.z + 10, 1),
  }),
  resolveReturnHomeCurve: (current) => ({
    control1: {
      x: current.x,
      z: 1.5,
    },
    control2: {
      x: -18,
      z: 0,
    },
  }),
}

export function createCompactReceivingSimulation(): ReceivingSimulation {
  return new ReceivingSimulation(COMPACT_RECEIVING_CONFIG)
}
