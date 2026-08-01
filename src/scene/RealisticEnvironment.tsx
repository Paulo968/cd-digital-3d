import type { WarehouseLayout } from '../domain/layout'
import type { WarehouseLocation } from '../domain/warehouse'
import { RealisticOperationZones } from './RealisticOperationZones'
import { RealisticReceivingWorld } from './RealisticReceivingWorld'
import { RealisticSceneIsolation } from './RealisticSceneIsolation'

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

/**
 * O modo realista permanece isolado do estoque operacional.
 *
 * A primeira célula usa um cenário explícito e um motor configurável, sem
 * alterar prototypes ou constantes globais durante imports. As zonas físicas
 * seguintes aparecem como mapa de evolução e ainda não fabricam movimentos ou
 * confirmações que o kernel não executou.
 */
export function RealisticEnvironment({
  compact,
}: RealisticEnvironmentProps) {
  return (
    <RealisticSceneIsolation>
      <RealisticOperationZones />
      <RealisticReceivingWorld compact={compact} />
    </RealisticSceneIsolation>
  )
}
