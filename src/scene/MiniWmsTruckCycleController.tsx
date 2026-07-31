import { useEffect, useRef } from 'react'
import {
  recordTruckDeparture,
  useOperationsControlStore,
} from '../store/operationsControlStore'

function missionCycleNumber(missionId: string): number | null {
  const match = missionId.match(/-C(\d+)$/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/**
 * Faz a ponte entre o fluxo Mini-WMS e o caminhão animado.
 *
 * A missão de carregamento termina somente depois que a RX20 volta à vaga. Em
 * seguida este controlador confirma a carga, remove os pallets expedidos do
 * inventário demonstrativo e inicia o ciclo visual de fechamento, saída e
 * chegada da próxima carroceria.
 */
export function MiniWmsTruckCycleController() {
  const missions = useOperationsControlStore((state) => state.missions)
  const pallets = useOperationsControlStore((state) => state.pallets)
  const truckPhase = useOperationsControlStore((state) => state.truck.phase)
  const releasedCyclesRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (truckPhase !== 'docked') return

    const shippingMissions = missions.filter(
      (mission) =>
        mission.role === 'shipping' && missionCycleNumber(mission.id) !== null,
    )
    const latestCycle = shippingMissions.reduce((latest, mission) => {
      return Math.max(latest, missionCycleNumber(mission.id) ?? -1)
    }, -1)

    if (latestCycle < 0 || releasedCyclesRef.current.has(latestCycle)) return

    const cycleShipping = shippingMissions.filter(
      (mission) => missionCycleNumber(mission.id) === latestCycle,
    )
    if (
      cycleShipping.length === 0 ||
      cycleShipping.some((mission) => mission.status !== 'completed')
    ) {
      return
    }

    const palletIds = [
      ...new Set(
        cycleShipping
          .map((mission) => mission.palletId)
          .filter((palletId) => pallets[palletId]?.zone === 'truck'),
      ),
    ]
    if (palletIds.length === 0) return

    releasedCyclesRef.current.add(latestCycle)
    recordTruckDeparture(palletIds)
  }, [missions, pallets, truckPhase])

  return null
}
