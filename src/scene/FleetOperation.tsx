import type { WarehouseLayout } from '../domain/layout'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import type { WarehouseLocation } from '../domain/warehouse'
import { RealisticReceivingPhaseOne } from './RealisticReceivingPhaseOne'

interface FleetOperationProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticFleetPlan
  compact: boolean
}

/**
 * Primeira fase isolada do modo realista.
 *
 * O operacional continua usando sua própria representação. Aqui existe somente
 * a célula contínua de recebimento: caminhão com seis pallets e uma RX20 que
 * entra reta, coleta, sai de ré, libera a carroceria, gira e deposita na área de
 * descarga. As etapas posteriores voltarão apenas depois desta célula ficar
 * estável no navegador.
 */
export function FleetOperation({ layout }: FleetOperationProps) {
  return <RealisticReceivingPhaseOne layout={layout} />
}
