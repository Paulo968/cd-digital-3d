import type { WarehouseLayout } from '../domain/layout'
import { RealisticReceivingWorld } from './RealisticReceivingWorld'

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  compact: boolean
}

/**
 * O modo realista tem uma árvore visual própria. Assim, a cena operacional não
 * é montada e escondida por baixo dela, reduzindo memória e trabalho de render.
 */
export function RealisticEnvironment({ layout, compact }: RealisticEnvironmentProps) {
  return <RealisticReceivingWorld layout={layout} compact={compact} />
}
