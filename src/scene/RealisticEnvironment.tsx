import type { WarehouseLayout } from '../domain/layout'
import '../realistic-v2/growingReceivingOperation'
import type { WarehouseLocation } from '../domain/warehouse'
import { RealisticWorldV4 } from './RealisticWorldV4'

interface RealisticEnvironmentProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  animated: boolean
  compact: boolean
}

/**
 * O modo realista é independente do operacional.
 *
 * A V4 nasce com cinco ruas vazias, recebe pallets continuamente e preserva o
 * staging entre caminhões para a futura etapa com transpaleteira.
 */
export function RealisticEnvironment({
  compact,
}: RealisticEnvironmentProps) {
  return <RealisticWorldV4 compact={compact} />
}
