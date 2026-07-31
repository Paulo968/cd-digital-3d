import { useEffect, useMemo, useRef } from 'react'
import {
  industrialPlanIsActive,
  type IndustrialFlowPlan,
} from '../domain/industrialFlow'
import {
  palletActsAsTrafficHazard,
  palletTrafficRadius,
} from '../domain/palletCollisionPolicy'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import type { RealisticMissionStop } from '../domain/realisticMissionQueue'
import { useOperationsControlStore } from '../store/operationsControlStore'
import {
  removeRuntimeHazard,
  upsertRuntimeHazard,
} from './dynamicSafetyRuntime'

function basePalletId(palletId: string): string {
  return palletId.replace(/-C\d+$/, '')
}

function activePalletIds(plan: RealisticFleetPlan): Set<string> {
  const groups = new Map<string, Set<string>>()
  plan.missions.forEach((mission) => {
    const roles = groups.get(mission.palletId) ?? new Set<string>()
    roles.add(mission.role)
    groups.set(mission.palletId, roles)
  })
  return new Set(
    [...groups.entries()]
      .filter(
        ([, roles]) => roles.has('replenishment') && roles.has('shipping'),
      )
      .map(([palletId]) => palletId),
  )
}

function collisionStops(plan: RealisticFleetPlan): RealisticMissionStop[] {
  const activeIds = activePalletIds(plan)
  const activeMissions = plan.missions.filter((mission) =>
    activeIds.has(mission.palletId),
  )
  const base = [
    ...Object.entries(plan.initialPalletStops)
      .filter(([palletId]) => activeIds.has(palletId))
      .map(([, stop]) => stop),
    ...plan.stagingStops,
    ...plan.truckStops,
    ...activeMissions.flatMap((mission) => [mission.source, mission.destination]),
  ]
  const industrial = industrialPlanIsActive(plan)
    ? [...plan.outboundAisleBufferStops, ...plan.shippingBufferStops]
    : []
  const unique = new Map<string, RealisticMissionStop>()
  ;[...base, ...industrial].forEach((stop) => unique.set(stop.id, stop))
  return [...unique.values()]
}

export function PalletCollisionRegistry({
  plan,
}: {
  plan: RealisticFleetPlan | IndustrialFlowPlan
}) {
  const pallets = useOperationsControlStore((state) => state.pallets)
  const missions = useOperationsControlStore((state) => state.missions)
  const activeHazardsRef = useRef<Set<string>>(new Set())
  const observedPalletsRef = useRef<Set<string>>(new Set())
  const departedPalletsRef = useRef<Set<string>>(new Set())
  const activeIds = useMemo(() => activePalletIds(plan), [plan])
  const lookup = useMemo(() => {
    const result = new Map<string, RealisticMissionStop>()
    collisionStops(plan).forEach((stop) => {
      result.set(stop.id, stop)
      result.set(stop.label, stop)
    })
    return result
  }, [plan])
  const palletsInRunningMissions = useMemo(
    () =>
      new Set(
        missions
          .filter((mission) => mission.status === 'running')
          .map((mission) => mission.palletId),
      ),
    [missions],
  )

  useEffect(() => {
    const nextHazards = new Set<string>()
    const initialStopByPallet = Object.fromEntries(
      Object.entries(plan.initialPalletStops).filter(([palletId]) =>
        activeIds.has(palletId),
      ),
    )

    observedPalletsRef.current.forEach((palletId) => {
      if (!pallets[palletId]) departedPalletsRef.current.add(palletId)
    })
    Object.keys(pallets).forEach((palletId) => {
      observedPalletsRef.current.add(palletId)
      departedPalletsRef.current.delete(palletId)
    })

    const palletIds = new Set([
      ...Object.keys(initialStopByPallet),
      ...Object.keys(pallets).filter((palletId) =>
        activeIds.has(basePalletId(palletId)),
      ),
    ])

    palletIds.forEach((palletId) => {
      if (palletsInRunningMissions.has(palletId)) return

      const tracked = pallets[palletId]
      const stop = tracked
        ? lookup.get(tracked.stopId)
        : departedPalletsRef.current.has(palletId)
          ? undefined
          : initialStopByPallet[palletId]
      if (!stop || !palletActsAsTrafficHazard(stop)) return

      const hazardId = `floor-pallet:${palletId}`
      nextHazards.add(hazardId)
      upsertRuntimeHazard({
        id: hazardId,
        kind: 'obstacle',
        point: {
          x: stop.restingPoint.x,
          y: 0.2,
          z: stop.restingPoint.z,
        },
        radius: palletTrafficRadius(stop),
        active: true,
      })
    })

    activeHazardsRef.current.forEach((hazardId) => {
      if (!nextHazards.has(hazardId)) removeRuntimeHazard(hazardId)
    })
    activeHazardsRef.current = nextHazards
  }, [activeIds, lookup, pallets, palletsInRunningMissions, plan.initialPalletStops])

  useEffect(
    () => () => {
      activeHazardsRef.current.forEach(removeRuntimeHazard)
      activeHazardsRef.current.clear()
      observedPalletsRef.current.clear()
      departedPalletsRef.current.clear()
    },
    [],
  )

  return null
}
