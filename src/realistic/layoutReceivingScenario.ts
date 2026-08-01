import type { WarehouseLayout, WarehouseZone } from '../domain/layout'
import { createReceivingKernelRuntime } from './receiving/receivingKernelRuntime'
import {
  RECEIVING_V2,
  type Point2,
  type ReceivingScenarioConfig,
} from '../realistic-v2/receivingSimulation'

export interface LayoutReceivingScenario {
  id: string
  config: ReceivingScenarioConfig
  offset: Point2
  receivingZone: WarehouseZone
  shippingZone: WarehouseZone
  stagingPoints: Point2[]
  inboundDockZ: number
  outboundDockZ: number
}

const STAGING_XS = [-12, -8, -4, 0, 4, 8] as const

function fallbackZone(
  layout: WarehouseLayout,
  type: 'receiving' | 'shipping',
): WarehouseZone {
  const direction = type === 'receiving' ? -1 : 1
  return {
    id: `zone-${type}-generated`,
    name: type === 'receiving' ? 'Recebimento' : 'Expedição',
    type,
    origin: {
      x: direction * layout.floor.width * 0.29,
      z: layout.floor.depth / 2 - 5,
    },
    width: 12,
    depth: 8,
  }
}

export function createLayoutReceivingScenario(
  layout: WarehouseLayout,
): LayoutReceivingScenario {
  const receivingZone =
    layout.zones.find((zone) => zone.type === 'receiving') ??
    fallbackZone(layout, 'receiving')
  const shippingZone =
    layout.zones.find((zone) => zone.type === 'shipping') ??
    fallbackZone(layout, 'shipping')
  const inboundDockZ = layout.floor.depth / 2
  const outboundDockZ = layout.floor.depth / 2
  const offset = {
    x: receivingZone.origin.x,
    z: inboundDockZ - RECEIVING_V2.dockWallZ,
  }
  const stagingPoints = STAGING_XS.map((x) => ({
    x,
    z: RECEIVING_V2.stagingZ,
  }))

  const config: ReceivingScenarioConfig = {
    ...RECEIVING_V2,
    id: `receiving-layout-${layout.id}-v${layout.version}`,
    palletIdPrefix: 'REC-LAYOUT',
    floorWidth: Math.max(56, layout.floor.width),
    floorDepth: Math.max(180, layout.floor.depth + 70),
    forkliftHome: { x: -12, z: -25 },
    stageXs: STAGING_XS,
    stagingCapacity: STAGING_XS.length,
    preserveStagedPallets: false,
    resolveStagingPoint: (index) => {
      const point = stagingPoints[index]
      if (!point) throw new Error(`Posição de staging inexistente: ${index}`)
      return point
    },
    resolveDockApproachControl: (current) => ({
      x: current.x,
      z: Math.max(current.z + 10, 1),
    }),
    resolveReturnHomeCurve: (current) => ({
      control1: { x: current.x, z: -21 },
      control2: { x: -8, z: -25 },
    }),
  }

  return {
    id: config.id,
    config,
    offset,
    receivingZone,
    shippingZone,
    stagingPoints,
    inboundDockZ,
    outboundDockZ,
  }
}

export function createLayoutReceivingRuntime(
  scenario: LayoutReceivingScenario,
) {
  return createReceivingKernelRuntime(scenario.config)
}

export function receivingLocalToWorld(
  point: Point2,
  scenario: LayoutReceivingScenario,
): Point2 {
  return {
    x: point.x + scenario.offset.x,
    z: point.z + scenario.offset.z,
  }
}
