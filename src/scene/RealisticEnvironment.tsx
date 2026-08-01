import type { WarehouseLayout } from '../domain/layout'
import type { WarehouseLocation } from '../domain/warehouse'
import { RealisticReceivingWorld } from './RealisticReceivingWorld'
import { RealisticSceneIsolation } from './RealisticSceneIsolation'

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

/**
 * O modo realista usa a mesma planta, ruas, posições e porta-paletes do modo
 * operacional. Esta camada acrescenta somente infraestrutura física, docas,
 * staging, veículos, iluminação e a operação simulada ao redor do layout.
 */
export function RealisticEnvironment({
  layout,
  compact,
}: RealisticEnvironmentProps) {
  return (
    <RealisticSceneIsolation>
      <RealisticReceivingWorld layout={layout} compact={compact} />
    </RealisticSceneIsolation>
  )
}
