import { useEffect, useMemo, useRef } from 'react'
import {
  industrialPlanIsActive,
  type IndustrialFlowPlan,
} from '../domain/industrialFlow'
import type { RealisticFleetPlan } from '../domain/realisticFleet'
import type { RealisticMissionStop } from '../domain/realisticMissionQueue'
import { useOperationsControlStore } from '../store/operationsControlStore'
import {
  removeRuntimeHazard,
  upsertRuntimeHazard,
} from './dynamicSafetyRuntime'

function collisionStops(plan: RealisticFleetPlan): RealisticMissionStop[] {
  const base = [
    ...Object.values(plan.initialPalletStops),
    ...plan.receivingStops,
    ...plan.stagingStops,
    ...plan.truckStops,
    ...plan.missions.flatMap((mission) => [mission.source, mission.destination]),
  ]
  const industrial = industrialPlanIsActive(plan)
    ? [
        ...plan.inboundTruckStops,
        ...plan.dischargeStops,
        ...plan.aisleBufferStops,
        ...plan.outboundAisleBufferStops,
        ...plan.shippingBufferStops,
      ]
    : []
  const unique = new Map<string, RealisticMissionStop>()
  ;[...base, ...industrial].forEach((stop) => unique.set(stop.id, stop))
  return [...unique.values()]
}

function isFloorCollisionStop(stop: RealisticMissionStop): boolean {
  return stop.kind !== 'address'
}

export function PalletCollisionRegistry({
  plan,
}: {
  plan: RealisticFleetPlan | IndustrialFlowPlan
}) {
  const pallets = useOperationsControlStore((state) => state.pallets)
  const activeHazardsRef = useRef<Set<string>>(new Set())
  const observedPalletsRef = useRef<Set<string>>(new Set())
  const departedPalletsRef = useRef<Set<string>>(new Set())
  const lookup = useMemo(() => {
    const result = new Map<string, RealisticMissionStop>()
    collisionStops(plan).forEach((stop) => {
      result.set(stop.id, stop)
      result.set(stop.label, stop)
    })
    return result
  }, [plan])

  useEffect(() => {
    const nextHazards = new Set<string>()
    const initialStopByPallet = plan.initialPalletStops

    observedPalletsRef.current.forEach((palletId) => {
      if (!pallets[palletId]) departedPalletsRef.current.add(palletId)
    })
    Object.keys(pallets).forEach((palletId) => {
      observedPalletsRef.current.add(palletId)
      departedPalletsRef.current.delete(palletId)
    })

    const palletIds = new Set([
      ...Object.keys(initialStopByPallet),
      ...Object.keys(pallets),
    ])

    palletIds.forEach((palletId) => {
      const tracked = pallets[palletId]
      const stop = tracked
        ? lookup.get(tracked.stopId)
        : departedPalletsRef.current.has(palletId)
          ? undefined
          : initialStopByPallet[palletId]
      if (!stop || !isFloorCollisionStop(stop)) return

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
        radius: 0.68,
        active: true,
      })
    })

    activeHazardsRef.current.forEach((hazardId) => {
      if (!nextHazards.has(hazardId)) removeRuntimeHazard(hazardId)
    })
    activeHazardsRef.current = nextHazards
  }, [lookup, pallets, plan.initialPalletStops])

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
