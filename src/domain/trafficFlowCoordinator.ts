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

interface BlockObservation {
  since: number
  lastSeenAt: number
}

interface VehicleMemory {
  blockers: Map<string, BlockObservation>
  lastBlockedAt: number
  lastMovingAt: number
  lastGrantedAt: number
  lastYieldedAt: number
  queueTicket: number | null
}

interface PassageGrant {
  winnerId: string
  loserId: string
  createdAt: number
  expiresAt: number
  flowKey: string
}

type FlowDirection = 'north' | 'south' | 'east' | 'west'

const BLOCK_CONFIRMATION_MS = 360
const PASSAGE_HOLD_MS = 5_200
const PASSAGE_REFRESH_MS = 1_800
const RELEASE_DISTANCE = 5.2
const FLOW_CELL_SIZE = 5
const CREEP_SPEED = 1.05
const BLOCK_OBSERVATION_TTL_MS = 1_400
const TICKET_IDLE_RESET_MS = 2_800

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

  private nextTicket = 1

  private memoryFor(vehicleId: string): VehicleMemory {
    const current = this.memories.get(vehicleId)
    if (current) return current

    const created: VehicleMemory = {
      blockers: new Map(),
      lastBlockedAt: 0,
      lastMovingAt: 0,
      lastGrantedAt: 0,
      lastYieldedAt: 0,
      queueTicket: null,
    }
    this.memories.set(vehicleId, created)
    return created
  }

  private observe(snapshot: TrafficVehicleSnapshot, now: number): VehicleMemory {
    const memory = this.memoryFor(snapshot.id)
    if (snapshot.speed > 0.16) memory.lastMovingAt = now
    return memory
  }

  private claimTicket(memory: VehicleMemory): number {
    if (memory.queueTicket !== null) return memory.queueTicket
    memory.queueTicket = this.nextTicket
    this.nextTicket += 1
    return memory.queueTicket
  }

  private claimPairTickets(
    vehicle: TrafficVehicleSnapshot,
    hazard: TrafficVehicleSnapshot,
  ): void {
    const vehicleMemory = this.memoryFor(vehicle.id)
    const hazardMemory = this.memoryFor(hazard.id)

    if (
      vehicleMemory.queueTicket === null &&
      hazardMemory.queueTicket === null
    ) {
      const [firstId, secondId] = [vehicle.id, hazard.id].sort()
      this.claimTicket(this.memoryFor(firstId))
      this.claimTicket(this.memoryFor(secondId))
      return
    }

    this.claimTicket(vehicleMemory)
    this.claimTicket(hazardMemory)
  }

  private updateBlock(
    vehicleId: string,
    hazardId: string,
    blocked: boolean,
    now: number,
  ): VehicleMemory {
    const memory = this.memoryFor(vehicleId)
    if (!blocked) {
      memory.blockers.delete(hazardId)
      return memory
    }

    const current = memory.blockers.get(hazardId)
    memory.blockers.set(hazardId, {
      since: current?.since ?? now,
      lastSeenAt: now,
    })
    memory.lastBlockedAt = now
    this.claimTicket(memory)
    return memory
  }

  private cleanup(now: number): void {
    const grantVehicleIds = new Set<string>()
    for (const [key, grant] of this.grants) {
      if (grant.expiresAt < now) {
        this.grants.delete(key)
        continue
      }
      grantVehicleIds.add(grant.winnerId)
      grantVehicleIds.add(grant.loserId)
    }

    for (const [vehicleId, memory] of this.memories) {
      for (const [hazardId, observation] of memory.blockers) {
        if (now - observation.lastSeenAt > BLOCK_OBSERVATION_TTL_MS) {
          memory.blockers.delete(hazardId)
        }
      }

      if (
        memory.queueTicket !== null &&
        !grantVehicleIds.has(vehicleId) &&
        memory.blockers.size === 0 &&
        now - memory.lastBlockedAt > TICKET_IDLE_RESET_MS
      ) {
        memory.queueTicket = null
      }
    }
  }

  private chooseWinner(
    vehicle: TrafficVehicleSnapshot,
    hazard: TrafficVehicleSnapshot,
  ): string {
    this.claimPairTickets(vehicle, hazard)
    const vehicleTicket = this.memoryFor(vehicle.id).queueTicket!
    const hazardTicket = this.memoryFor(hazard.id).queueTicket!

    if (vehicleTicket !== hazardTicket) {
      return vehicleTicket < hazardTicket ? vehicle.id : hazard.id
    }
    return vehicle.id.localeCompare(hazard.id) < 0 ? vehicle.id : hazard.id
  }

  private createGrant(
    vehicle: TrafficVehicleSnapshot,
    hazard: TrafficVehicleSnapshot,
    now: number,
    flowKey: string,
  ): PassageGrant {
    const winnerId = this.chooseWinner(vehicle, hazard)
    const loserId = winnerId === vehicle.id ? hazard.id : vehicle.id
    const grant: PassageGrant = {
      winnerId,
      loserId,
      createdAt: now,
      expiresAt: now + PASSAGE_HOLD_MS,
      flowKey,
    }
    this.memoryFor(winnerId).lastGrantedAt = now
    this.memoryFor(loserId).lastYieldedAt = now
    return grant
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

    // Veículos no mesmo sentido continuam usando a distância de seguimento.
    // A arbitragem nunca autoriza o veículo de trás a atravessar o da frente.
    if (sameDirection(vehicleDirection, hazardDirection)) return emptyDecision()

    const key = pairKey(vehicle.id, hazard.id)
    const flowKey = flowKeyForConflict(vehicle, hazard)
    const existingGrant = this.grants.get(key)

    if (existingGrant) {
      if (separation > RELEASE_DISTANCE) {
        this.grants.delete(key)
      } else {
        const globallyPreferred = this.chooseWinner(vehicle, hazard)
        if (globallyPreferred !== existingGrant.winnerId) {
          const replacement = this.createGrant(vehicle, hazard, now, flowKey)
          this.grants.set(key, replacement)
          return {
            action: replacement.winnerId === vehicle.id ? 'proceed' : 'yield',
            winnerId: replacement.winnerId,
            flowKey: replacement.flowKey,
            speedLimit: replacement.winnerId === vehicle.id ? CREEP_SPEED : 0,
          }
        }

        const winner = existingGrant.winnerId === vehicle.id ? vehicle : hazard
        if (winner.speed > 0.12) {
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

    const vehicleObservation = vehicleMemory.blockers.get(hazard.id)
    const hazardObservation = hazardMemory.blockers.get(vehicle.id)
    const vehicleWait = vehicleObservation
      ? now - vehicleObservation.since
      : 0
    const hazardWait = hazardObservation ? now - hazardObservation.since : 0
    const bothSlow = vehicle.speed <= 0.7 && hazard.speed <= 0.7
    const reciprocalBlock = Boolean(hazardObservation)
    const confirmed =
      input.immediateConflict ||
      (bothSlow &&
        reciprocalBlock &&
        Math.max(vehicleWait, hazardWait) >= BLOCK_CONFIRMATION_MS)

    if (!confirmed) return emptyDecision()

    const grant = this.createGrant(vehicle, hazard, now, flowKey)
    this.grants.set(key, grant)

    return {
      action: grant.winnerId === vehicle.id ? 'proceed' : 'yield',
      winnerId: grant.winnerId,
      flowKey,
      speedLimit: grant.winnerId === vehicle.id ? CREEP_SPEED : 0,
    }
  }

  clearVehicle(vehicleId: string): void {
    this.memories.delete(vehicleId)
    for (const memory of this.memories.values()) {
      memory.blockers.delete(vehicleId)
    }
    for (const [key, grant] of this.grants) {
      if (grant.winnerId === vehicleId || grant.loserId === vehicleId) {
        this.grants.delete(key)
      }
    }
  }

  reset(): void {
    this.memories.clear()
    this.grants.clear()
    this.nextTicket = 1
  }
}
