import type { Point2 } from './receivingSimulation'

/**
 * Mantido como helper de compatibilidade.
 *
 * O refinamento deixou de alterar ReceivingSimulation.prototype durante o
 * import. Cenários novos devem fornecer resolveDockApproachControl diretamente
 * em ReceivingScenarioConfig.
 */
export function refinedDockApproachControl(current: Point2): Point2 {
  return {
    x: current.x,
    z: Math.max(current.z + 10, 1),
  }
}
