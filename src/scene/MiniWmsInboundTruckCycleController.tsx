import { useEffect, useRef } from 'react'
import { useInboundTruckStore } from '../store/inboundTruckStore'
import { useOperationsControlStore } from '../store/operationsControlStore'

function missionCycleNumber(missionId: string): number | null {
  const match = missionId.match(/-C(\d+)$/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function isReceivingUnloadMission(mission: {
  role: string
  sourceLabel: string
}): boolean {
  return (
    mission.role === 'inbound-transfer' &&
    /caminh[aã]o de recebimento/i.test(mission.sourceLabel)
  )
}

/**
 * Libera o caminhão de recebimento somente depois que todas as descargas da
 * rodada terminaram. O tempo de dois segundos começa quando a última RX volta
 * à vaga e a missão passa para `completed` no painel operacional.
 */
export function MiniWmsInboundTruckCycleController() {
  const missions = useOperationsControlStore((state) => state.missions)
  const phase = useInboundTruckStore((state) => state.phase)
  const setPhase = useInboundTruckStore((state) => state.setPhase)
  const releasedCyclesRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (phase !== 'docked') return

    const unloadMissions = missions.filter(
      (mission) =>
        isReceivingUnloadMission(mission) &&
        missionCycleNumber(mission.id) !== null,
    )
    const latestCycle = unloadMissions.reduce(
      (latest, mission) =>
        Math.max(latest, missionCycleNumber(mission.id) ?? -1),
      -1,
    )

    if (latestCycle < 0 || releasedCyclesRef.current.has(latestCycle)) return

    const cycleUnloads = unloadMissions.filter(
      (mission) => missionCycleNumber(mission.id) === latestCycle,
    )
    if (
      cycleUnloads.length === 0 ||
      cycleUnloads.some((mission) => mission.status !== 'completed')
    ) {
      return
    }

    releasedCyclesRef.current.add(latestCycle)
    setPhase('waiting')
  }, [missions, phase, setPhase])

  useEffect(() => {
    if (phase !== 'waiting') return
    const timer = window.setTimeout(() => setPhase('departing'), 2_000)
    return () => window.clearTimeout(timer)
  }, [phase, setPhase])

  return null
}
