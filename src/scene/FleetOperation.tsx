import type { WarehouseLayout } from '../domain/layout'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import type { WarehouseLocation } from '../domain/warehouse'
import { LiveFleetOperation } from './LiveFleetOperation'

interface FleetOperationProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticFleetPlan
  compact: boolean
}

/**
 * A operação é única em qualquer dispositivo.
 *
 * O perfil compacto continua disponível para o restante do cenário, mas não
 * pode alterar quantidade de equipamentos, ritmo de decisão, regras de
 * segurança, papéis ou missões da frota. Assim PC e celular executam a mesma
 * simulação; diferenças de desempenho ficam restritas à câmera e ao render.
 */
export function FleetOperation({
  layout,
  locations,
  plan,
}: FleetOperationProps) {
  return (
    <LiveFleetOperation
      layout={layout}
      locations={locations}
      plan={plan}
      compact={false}
    />
  )
}
