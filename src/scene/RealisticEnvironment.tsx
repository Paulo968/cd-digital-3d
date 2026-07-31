import type { WarehouseLayout } from '../domain/layout'
import '../realistic-v2/growingReceivingOperation'
import type { WarehouseLocation } from '../domain/warehouse'
import { RealisticWorldV3 } from './RealisticWorldV3'

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

/**
 * O modo realista é um produto independente do operacional.
 *
 * A V3 nasce com estoque vazio, cinco ruas sem pallets e uma célula de
 * recebimento que acumula os pallets no staging conforme os caminhões chegam.
 */
export function RealisticEnvironment({
  compact,
}: RealisticEnvironmentProps) {
  return <RealisticWorldV3 compact={compact} />
}
