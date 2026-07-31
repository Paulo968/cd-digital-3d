import { useMemo } from 'react'
import type { WarehouseLayout } from '../domain/layout'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import { buildStableFleetPlan } from '../domain/stableFleet'
import type { WarehouseLocation } from '../domain/warehouse'
import { LiveFleetOperation } from './LiveFleetOperation'
import { TrafficFlowMarkers } from './TrafficFlowMarkers'

interface FleetOperationProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticFleetPlan
  compact: boolean
}

/**
 * A operação realista usa a mesma célula logística em qualquer dispositivo:
 * uma RX 20 contrabalançada, uma retrátil e uma transpaleteira. A redução não
 * remove etapas do fluxo; ela elimina equipamentos redundantes disputando as
 * mesmas docas e corredores durante a demonstração.
 */
export function FleetOperation({
  layout,
  locations,
  plan,
  compact,
}: FleetOperationProps) {
  const stablePlan = useMemo(() => buildStableFleetPlan(plan), [plan])

  return (
    <>
      <TrafficFlowMarkers layout={layout} compact={compact} />
      <LiveFleetOperation
        layout={layout}
        locations={locations}
        plan={stablePlan}
        compact={false}
      />
    </>
  )
}
