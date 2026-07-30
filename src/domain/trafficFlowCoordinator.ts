import type { WorldPoint } from './routePlanning'

export type TrafficFlowAction = 'normal' | 'proceed' | 'yield'

export interface TrafficVelocity {
  x: number
  z: number
}

export interface TrafficVehicleSnapshot {
  id: string
  point: WorldPoint
  facing?: number
  speed: number
  velocity?: TrafficVelocity
}

export interface TrafficFlowDecisionInput {
  vehicle: TrafficVehicleSnapshot
  hazard: TrafficVehicleSnapshot
  separation: number
  blocked: boolean
  now: number
  immediateConflict?: boolean
}

export interface TrafficFlowDecision {
  action: TrafficFlowAction
  winnerId: string | null
  flowKey: string | null
  speedLimit: number
}

interface VehicleMemory {
  blockedBy: string | null
  blockedSince: number | null
  lastMovingAt: number
  lastGrantedAt: number
  lastYieldedAt: number
}

interface PassageGrant {
  winnerId: string
  loserId: string
  createdAt: number
  expiresAt: number
  flowKey: string
}

interface FlowReservation {
  direction: FlowDirection
  ownerId: string
  expiresAt: number
}

type FlowDirection = 'north' | 'south' | 'east' | 'west'

const BLOCK_CONFIRMATION_MS = 420
const PASSAGE_HOLD_MS = 4_200
const PASSAGE_REFRESH_MS = 1_800
const FLOW_HOLD_MS = 3_000
const RELEASE_DISTANCE = 5.2
const FLOW_CELL_SIZE = 5
const CREEP_SPEED = 0.95
const CONVOY_SPEED = 1.25

function pairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join('|')
}

function directionForFacing(facing: number): FlowDirection {
  const x = Math.sin(facing)
  const z = Math.cos(facing)

  if (Math.abs(x) > Math.abs(z)) return x >= 0 ? 'east' : 'west'
  return z >= 0 ? 'north' : 'south'
}

function directionForSnapshot(
  snapshot: TrafficVehicleSnapshot,
): FlowDirection | null {
  const velocity = snapshot.velocity
  if (velocity && Math.hypot(velocity.x, velocity.z) > 0.08) {
    return directionForFacing(Math.atan2(velocity.x, velocity.z))
  }
  return snapshot.facing === undefined
    ? null
    : directionForFacing(snapshot.facing)
}

function flowKeyForConflict(
  left: TrafficVehicleSnapshot,
  right: TrafficVehicleSnapshot,
): string {
  const middleX = (left.point.x + right.point.x) / 2
  const middleZ = (left.point.z + right.point.z) / 2
  return `${Math.round(middleX / FLOW_CELL_SIZE)}:${Math.round(
    middleZ / FLOW_CELL_SIZE,
  )}`
}

function sameDirection(
  left: FlowDirection | null,
  right: FlowDirection | null,
): boolean {
  return left !== null && right !== null && left === right
}

function emptyDecision(): TrafficFlowDecision {
  return {
    action: 'normal',
    winnerId: null,
    flowKey: null,
    speedLimit: Number.POSITIVE_INFINITY,
  }
}

export class TrafficFlowCoordinator {
  private readonly memories = new Map<string, VehicleMemory>()

  private readonly grants = new Map<string, PassageGrant>()

  private readonly flows = new Map<string, FlowReservation>()

  private memoryFor(vehicleId: string): VehicleMemory {
    const current = this.memories.get(vehicleId)
    if (current) return current

    const created: VehicleMemory = {
      blockedBy: null,
      blockedSince: null,
      lastMovingAt: 0,
      lastGrantedAt: 0,
      lastYieldedAt: 0,
    }
    this.memories.set(vehicleId, created)
    return created
  }

  private observe(snapshot: TrafficVehicleSnapshot, now: number): VehicleMemory {
    const memory = this.memoryFor(snapshot.id)
    if (snapshot.speed > 0.16) memory.lastMovingAt = now
    return memory
  }

  private updateBlock(
    vehicleId: string,
    hazardId: string,
    blocked: boolean,
    now: number,
  ): VehicleMemory {
    const memory = this.memoryFor(vehicleId)
    if (!blocked) {
      if (memory.blockedBy === hazardId) {
        memory.blockedBy = null
        memory.blockedSince = null
      }
      return memory
    }

    if (memory.blockedBy !== hazardId || memory.blockedSince === null) {
      memory.blockedBy = hazardId
      memory.blockedSince = now
    }
    return memory
  }

  private cleanup(now: number): void {
    for (const [key, grant] of this.grants) {
      if (grant.expiresAt < now) this.grants.delete(key)
    }
    for (const [key, flow] of this.flows) {
      if (flow.expiresAt < now) this.flows.delete(key)
    }
  }

  private waitingScore(
    memory: VehicleMemory,
    snapshot: TrafficVehicleSnapshot,
    now: number,
  ): number {
    const waited = memory.blockedSince === null ? 0 : now - memory.blockedSince
    const recentlyMoving = now - memory.lastMovingAt <= 1_100 ? 190 : 0
    const alreadyRolling = snapshot.speed > 0.22 ? 160 : 0
    const fairness = now - memory.lastYieldedAt <= 10_000 ? 125 : 0
    const starvationRelief = Math.min(320, waited / 8)
    return recentlyMoving + alreadyRolling + fairness + starvationRelief
  }

  private chooseWinner(
    vehicle: TrafficVehicleSnapshot,
    hazard: TrafficVehicleSnapshot,
    now: number,
  ): string {
    const vehicleMemory = this.memoryFor(vehicle.id)
    const hazardMemory = this.memoryFor(hazard.id)
    const vehicleScore = this.waitingScore(vehicleMemory, vehicle, now)
    const hazardScore = this.waitingScore(hazardMemory, hazard, now)

    if (Math.abs(vehicleScore - hazardScore) > 0.001) {
      return vehicleScore > hazardScore ? vehicle.id : hazard.id
    }

    return vehicle.id.localeCompare(hazard.id) < 0 ? vehicle.id : hazard.id
  }

  decide(input: TrafficFlowDecisionInput): TrafficFlowDecision {
    const { vehicle, hazard, separation, blocked, now } = input
    this.cleanup(now)
    const vehicleMemory = this.observe(vehicle, now)
    const hazardMemory = this.observe(hazard, now)
    this.updateBlock(vehicle.id, hazard.id, blocked, now)

    if (!blocked) return emptyDecision()

    const vehicleDirection = directionForSnapshot(vehicle)
    const hazardDirection = directionForSnapshot(hazard)

    // Mesmo sentido continua usando distância de seguimento normal. O veículo
    // de trás nunca recebe autorização para atravessar o da frente.
    if (sameDirection(vehicleDirection, hazardDirection)) return emptyDecision()

    const key = pairKey(vehicle.id, hazard.id)
    const flowKey = flowKeyForConflict(vehicle, hazard)
    const existingGrant = this.grants.get(key)

    if (existingGrant) {
      if (separation > RELEASE_DISTANCE) {
        this.grants.delete(key)
      } else {
        const winner = existingGrant.winnerId === vehicle.id ? vehicle : hazard
        if (winner.speed > 0.16) {
          existingGrant.expiresAt = Math.max(
            existingGrant.expiresAt,
            now + PASSAGE_REFRESH_MS,
          )
        }
        return {
          action: existingGrant.winnerId === vehicle.id ? 'proceed' : 'yield',
          winnerId: existingGrant.winnerId,
          flowKey: existingGrant.flowKey,
          speedLimit:
            existingGrant.winnerId === vehicle.id ? CREEP_SPEED : 0,
        }
      }
    }

    const reservedFlow = this.flows.get(flowKey)
    if (reservedFlow && vehicleDirection !== null) {
      if (reservedFlow.direction === vehicleDirection) {
        reservedFlow.expiresAt = Math.max(
          reservedFlow.expiresAt,
          now + FLOW_HOLD_MS,
        )
        return {
          action: 'proceed',
          winnerId: reservedFlow.ownerId,
          flowKey,
          speedLimit: CONVOY_SPEED,
        }
      }
      if (
        hazardDirection !== null &&
        reservedFlow.direction === hazardDirection
      ) {
        return {
          action: 'yield',
          winnerId: reservedFlow.ownerId,
          flowKey,
          speedLimit: 0,
        }
      }
    }

    const vehicleWait =
      vehicleMemory.blockedSince === null ? 0 : now - vehicleMemory.blockedSince
    const hazardWait =
      hazardMemory.blockedSince === null ? 0 : now - hazardMemory.blockedSince
    const bothSlow = vehicle.speed <= 0.6 && hazard.speed <= 0.6
    const reciprocalBlock =
      hazardMemory.blockedBy === vehicle.id &&
      hazardMemory.blockedSince !== null
    const confirmed =
      input.immediateConflict ||
      (bothSlow &&
        reciprocalBlock &&
        Math.max(vehicleWait, hazardWait) >= BLOCK_CONFIRMATION_MS)

    if (!confirmed) return emptyDecision()

    const winnerId = this.chooseWinner(vehicle, hazard, now)
    const loserId = winnerId === vehicle.id ? hazard.id : vehicle.id
    const winnerDirection =
      winnerId === vehicle.id ? vehicleDirection : hazardDirection
    const grant: PassageGrant = {
      winnerId,
      loserId,
      createdAt: now,
      expiresAt: now + PASSAGE_HOLD_MS,
      flowKey,
    }
    this.grants.set(key, grant)
    if (winnerDirection !== null) {
      this.flows.set(flowKey, {
        direction: winnerDirection,
        ownerId: winnerId,
        expiresAt: now + FLOW_HOLD_MS,
      })
    }

    const winnerMemory = this.memoryFor(winnerId)
    const loserMemory = this.memoryFor(loserId)
    winnerMemory.lastGrantedAt = now
    loserMemory.lastYieldedAt = now

    return {
      action: winnerId === vehicle.id ? 'proceed' : 'yield',
      winnerId,
      flowKey,
      speedLimit: winnerId === vehicle.id ? CREEP_SPEED : 0,
    }
  }

  clearVehicle(vehicleId: string): void {
    this.memories.delete(vehicleId)
    for (const [key, grant] of this.grants) {
      if (grant.winnerId === vehicleId || grant.loserId === vehicleId) {
        this.grants.delete(key)
      }
    }
    for (const [key, flow] of this.flows) {
      if (flow.ownerId === vehicleId) this.flows.delete(key)
    }
  }

  reset(): void {
    this.memories.clear()
    this.grants.clear()
    this.flows.clear()
  }
}
