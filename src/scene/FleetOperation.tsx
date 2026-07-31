import { useMemo } from 'react'
import type { WarehouseLayout } from '../domain/layout'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import { buildStableFleetPlan } from '../domain/stableFleet'
import type { WarehouseLocation } from '../domain/warehouse'
import { useOperationsControlStore } from '../store/operationsControlStore'
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
  const truckPhase = useOperationsControlStore((state) => state.truck.phase)
  const stablePlan = useMemo(() => buildStableFleetPlan(plan), [plan])

  // O executor mantém estado local por ciclo e reiniciaria tudo se recebesse um
  // novo objeto de plano. Mantemos a identidade do plano estável, alterando
  // somente a referência da lista de equipamentos quando a doca muda de fase.
  // Isso desperta o efeito de despacho sem reposicionar pallets ou veículos.
  const dispatchPlan = useMemo(() => ({ ...stablePlan }), [stablePlan])
  const dispatchVehicles = useMemo(
    () => [...stablePlan.vehicles],
    [stablePlan, truckPhase],
  )
  dispatchPlan.vehicles = dispatchVehicles

  return (
    <>
      <MiniWmsTruckCycleController />
      <TrafficFlowMarkers layout={layout} compact={compact} />
      <MiniWmsFleetOperation
        layout={layout}
        plan={dispatchPlan}
        compact={false}
      />
    </>
  )
}
