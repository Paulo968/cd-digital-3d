import { useMemo } from 'react'
import type { WarehouseLayout } from '../domain/layout'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import { buildStableFleetPlan } from '../domain/stableFleet'
import type { WarehouseLocation } from '../domain/warehouse'
import { useOperationsControlStore } from '../store/operationsControlStore'
import { MiniWmsFleetOperation } from './MiniWmsFleetOperation'
import { MiniWmsHomeZones } from './MiniWmsHomeZones'
import { MiniWmsPalletVisibilityBridge } from './MiniWmsPalletVisibilityBridge'
import { MiniWmsTruckCycleController } from './MiniWmsTruckCycleController'
import { OutboundPilotRackLayer } from './OutboundPilotRackLayer'
import { TrafficFlowMarkers } from './TrafficFlowMarkers'

interface FleetOperationProps {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  plan: RealisticFleetPlan
  compact: boolean
}

/**
 * Piloto de expedição com três equipamentos e uma única cadeia:
 * retrátil de retirada → transpaleteira de saída → RX20 de carregamento.
 */
export function FleetOperation({
  layout,
  locations,
  plan,
  compact,
}: FleetOperationProps) {
  const truckPhase = useOperationsControlStore((state) => state.truck.phase)
  const outboundPlan = useMemo(
    () => buildStableFleetPlan(plan, layout, locations),
    [layout, locations, plan],
  )

  const dispatchPlan = useMemo(() => ({ ...outboundPlan }), [outboundPlan])
  const dispatchVehicles = useMemo(() => {
    void truckPhase
    return [...outboundPlan.vehicles]
  }, [outboundPlan, truckPhase])
  dispatchPlan.vehicles = dispatchVehicles

  return (
    <>
      <MiniWmsTruckCycleController />
      <MiniWmsPalletVisibilityBridge plan={dispatchPlan} />
      <OutboundPilotRackLayer layout={layout} locations={locations} />
      <TrafficFlowMarkers layout={layout} compact={compact} />
      <MiniWmsHomeZones vehicles={outboundPlan.vehicles} />
      <MiniWmsFleetOperation
        layout={layout}
        plan={dispatchPlan}
        compact={false}
      />
    </>
  )
}
