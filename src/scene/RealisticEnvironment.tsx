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
 * O modo realista permanece isolado do estoque operacional.
 *
 * A primeira célula agora usa um cenário explícito e um motor configurável,
 * sem alterar prototypes ou constantes globais durante imports. `layout`,
 * `locations` e `animated` permanecem na assinatura pública para a integração
 * progressiva com o cérebro industrial e o grafo operacional.
 */
export function RealisticEnvironment({
  compact,
}: RealisticEnvironmentProps) {
  return (
    <RealisticSceneIsolation>
      <RealisticReceivingWorld compact={compact} />
    </RealisticSceneIsolation>
  )
}
