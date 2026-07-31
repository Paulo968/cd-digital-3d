import type { WarehouseLayout } from '../domain/layout'
import '../realistic-v2/compactStagingLayout'
import '../realistic-v2/receivingPathRefinement'
import type { WarehouseLocation } from '../domain/warehouse'
import { CompactStagingLaneOverlay } from './CompactStagingLaneOverlay'
import { RealisticWorldV2 } from './RealisticWorldV2'

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

/**
 * O modo realista agora é um produto independente.
 *
 * `layout`, `locations` e `animated` continuam na assinatura para manter a API
 * pública da cena estável, porém nenhuma regra, dimensão, câmera, equipamento ou
 * inventário do modo operacional é reutilizado pela Realistic V2.
 */
export function RealisticEnvironment({
  compact,
}: RealisticEnvironmentProps) {
  return (
    <>
      <RealisticWorldV2 compact={compact} />
      <CompactStagingLaneOverlay />
    </>
  )
}
