import { useEffect } from 'react'
import { createMiniWmsCycle } from '../domain/miniWms'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import { useOperationsControlStore } from '../store/operationsControlStore'
import {
  addRealisticMovablePalletAddresses,
  resetRealisticMovablePalletAddresses,
} from '../store/realisticPalletVisibilityStore'

function cycleAddresses(plan: RealisticFleetPlan, cycle: number): string[] {
  return Object.values(createMiniWmsCycle(plan, cycle).initialPalletStops)
    .map((stop) => stop.address)
    .filter((address): address is string => Boolean(address))
}

function addressFromLabel(label: string): string | null {
  return label.match(/\b[A-Z]+-\d{2}-\d{2}\b/)?.[0] ?? null
}

/**
 * Sincroniza a camada visual do estoque com as ondas do Mini-WMS.
 *
 * A primeira onda é retirada imediatamente do inventário estático. Nas ondas
 * seguintes, o endereço é transferido assim que a missão de retirada aparece
 * no painel operacional. O pallet continua visível, mas passa a ser desenhado
 * e controlado exclusivamente pela missão móvel.
 */
export function MiniWmsPalletVisibilityBridge({
  plan,
}: {
  plan: RealisticFleetPlan
}) {
  const missions = useOperationsControlStore((state) => state.missions)

  useEffect(() => {
    resetRealisticMovablePalletAddresses(cycleAddresses(plan, 1))
    return () => resetRealisticMovablePalletAddresses()
  }, [plan])

  useEffect(() => {
    const addresses = missions
      .filter((mission) => mission.role === 'replenishment')
      .map((mission) => addressFromLabel(mission.sourceLabel))
      .filter((address): address is string => Boolean(address))
    if (addresses.length > 0) addRealisticMovablePalletAddresses(addresses)
  }, [missions])

  return null
}
