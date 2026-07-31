import { useMemo } from 'react'
import type { WarehouseLayout } from '../domain/layout'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import { buildStableFleetPlan } from '../domain/stableFleet'
import type { WarehouseLocation } from '../domain/warehouse'
import { MiniWmsFleetOperation } from './MiniWmsFleetOperation'
import { MiniWmsTruckCycleController } from './MiniWmsTruckCycleController'
import { TrafficFlowMarkers } from './TrafficFlowMarkers'

interface FleetOperationProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticFleetPlan
  compact: boolean
}

/**
 * Executa uma célula Mini-WMS determinística. O controlador distribui as
 * etapas por tipo de equipamento; o 3D apenas cumpre a ordem recebida e aplica
 * sensores mais contato físico rígido.
 */
export function FleetOperation({
  layout,
  plan,
  compact,
}: FleetOperationProps) {
  const stablePlan = useMemo(() => buildStableFleetPlan(plan), [plan])

  return (
    <>
      <MiniWmsTruckCycleController />
      <TrafficFlowMarkers layout={layout} compact={compact} />
      <MiniWmsFleetOperation
        layout={layout}
        plan={stablePlan}
        compact={false}
      />
    </>
  )
}
