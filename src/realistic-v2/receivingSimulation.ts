export interface Point2 {
  x: number
  z: number
}

export type TruckPhase = 'arriving' | 'docked' | 'departing' | 'gap'

export type ForkliftPhase =
  | 'parked'
  | 'driving-to-dock'
  | 'aligning'
  | 'entering-trailer'
  | 'picking'
  | 'reversing-out'
  | 'clearing-trailer'
  | 'turning'
  | 'transporting'
  | 'staging'
  | 'returning'
  | 'fault'

export type PalletPhase = 'truck' | 'carried' | 'staged'

export interface ReceivingPallet {
  id: string
  index: number
  phase: PalletPhase
  stagedSlot: number | null
  color: string
}

export interface ReceivingSimulationState {
  elapsed: number
  revision: number
  batch: number
  completedTrucks: number
  label: string
  fault: string | null
  truck: {
    phase: TruckPhase
    z: number
  }
  forklift: {
    position: Point2
    heading: number
    speed: number
    forkHeight: number
    phase: ForkliftPhase
    carryingPalletId: string | null
  }
  pallets: ReceivingPallet[]
}

export const RECEIVING_V2 = {
  floorWidth: 72,
  floorDepth: 86,
  dockWallZ: 28,
  truckDockZ: 35,
  truckSpawnZ: 64,
  trailerRearZ: 28.5,
  trailerFrontZ: 41.5,
  trailerHalfWidth: 2.25,
  trailerInnerHalfWidth: 2.02,
  forkliftRadius: 0.72,
  forkliftHome: { x: -20, z: -25 } satisfies Point2,
  truckClearZ: 19,
  pickupLaneZ: 24.2,
  stagingApproachZ: -11.5,
  stagingZ: -17,
  stageXs: [-15, -9, -3, 3, 9, 15],
  palletXs: [-1.05, 1.05],
  palletZs: [31.1, 34, 36.9],
  travelForkHeight: 0.24,
  pickupForkHeight: 0.82,
  insertionForkHeight: 0.5,
  forwardSpeed: 3.25,
  loadedSpeed: 2.45,
  reverseSpeed: 2.15,
  angularSpeed: 1.75,
  acceleration: 3.4,
  braking: 5.6,
  truckSpeed: 13.5,
  gapSeconds: 1,
} as const

const PALLET_COLORS = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#22d3ee',
]

interface MoveLineAction {
  kind: 'move-line'
  target: Point2
  maximumSpeed: number
  reverse: boolean
  heading: number
  phase: ForkliftPhase
  label: string
  ignorePalletId?: string
}

interface MoveCurveAction {
  kind: 'move-curve'
  control1: Point2
  control2: Point2
  target: Point2
  maximumSpeed: number
  reverse: boolean
  phase: ForkliftPhase
  label: string
}

interface RotateAction {
  kind: 'rotate'
  heading: number
  phase: ForkliftPhase
  label: string
}

interface ForkAction {
  kind: 'fork'
  height: number
  phase: ForkliftPhase
  label: string
}

interface WaitAction {
  kind: 'wait'
  seconds: number
  label: string
  phase?: ForkliftPhase
  truckPhase?: TruckPhase
}

interface AttachAction {
  kind: 'attach'
  palletIndex: number
}

interface DetachAction {
  kind: 'detach'
  palletIndex: number
  stageIndex: number
}

interface TruckMoveAction {
  kind: 'truck-move'
  targetZ: number
  phase: TruckPhase
  label: string
}

interface BeginBatchAction {
  kind: 'begin-batch'
}

interface ResetBatchAction {
  kind: 'reset-batch'
}

type SimulationAction =
  | MoveLineAction
  | MoveCurveAction
  | RotateAction
  | ForkAction
  | WaitAction
  | AttachAction
  | DetachAction
  | TruckMoveAction
  | BeginBatchAction
  | ResetBatchAction

interface RunningAction {
  action: SimulationAction
  elapsed: number
  duration: number
  startPosition: Point2
  startTruckZ: number
  curveLength: number
}

function clonePoint(point: Point2): Point2 {
  return { x: point.x, z: point.z }
}

function distance(left: Point2, right: Point2): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function normalizeAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value))
}

export function angleDistance(left: number, right: number): number {
  return Math.abs(normalizeAngle(right - left))
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(target, current + amount)
  return Math.max(target, current - amount)
}

function headingForVector(dx: number, dz: number, reverse: boolean): number {
  const forwardHeading = Math.atan2(dx, dz) + Math.PI
  return normalizeAngle(reverse ? forwardHeading + Math.PI : forwardHeading)
}

function cubicPoint(
  start: Point2,
  control1: Point2,
  control2: Point2,
  target: Point2,
  t: number,
): Point2 {
  const inverse = 1 - t
  const a = inverse * inverse * inverse
  const b = 3 * inverse * inverse * t
  const c = 3 * inverse * t * t
  const d = t * t * t
  return {
    x: a * start.x + b * control1.x + c * control2.x + d * target.x,
    z: a * start.z + b * control1.z + c * control2.z + d * target.z,
  }
}

function cubicTangent(
  start: Point2,
  control1: Point2,
  control2: Point2,
  target: Point2,
  t: number,
): Point2 {
  const inverse = 1 - t
  return {
    x:
      3 * inverse * inverse * (control1.x - start.x) +
      6 * inverse * t * (control2.x - control1.x) +
      3 * t * t * (target.x - control2.x),
    z:
      3 * inverse * inverse * (control1.z - start.z) +
      6 * inverse * t * (control2.z - control1.z) +
      3 * t * t * (target.z - control2.z),
  }
}

function approximateCurveLength(
  start: Point2,
  control1: Point2,
  control2: Point2,
  target: Point2,
): number {
  let total = 0
  let previous = start
  for (let index = 1; index <= 24; index += 1) {
    const next = cubicPoint(start, control1, control2, target, index / 24)
    total += distance(previous, next)
    previous = next
  }
  return total
}

function createPallets(batch: number): ReceivingPallet[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `REC-V2-${String(batch).padStart(3, '0')}-${index + 1}`,
    index,
    phase: 'truck' as const,
    stagedSlot: null,
    color: PALLET_COLORS[index],
  }))
}

export function truckPalletPoint(index: number): Point2 {
  const row = Math.floor(index / 2)
  const column = index % 2
  return {
    x: RECEIVING_V2.palletXs[column],
    z: RECEIVING_V2.palletZs[row],
  }
}

export function stagingPoint(index: number): Point2 {
  return {
    x: RECEIVING_V2.stageXs[index],
    z: RECEIVING_V2.stagingZ,
  }
}

function circleHitsPoint(
  center: Point2,
  radius: number,
  obstacle: Point2,
  obstacleRadius: number,
): boolean {
  return distance(center, obstacle) < radius + obstacleRadius - 0.015
}

export function forkliftCollisionReason(
  state: ReceivingSimulationState,
  proposed: Point2,
  ignorePalletId?: string,
): string | null {
  const radius = RECEIVING_V2.forkliftRadius
  const halfWidth = RECEIVING_V2.floorWidth / 2
  const halfDepth = RECEIVING_V2.floorDepth / 2

  if (
    proposed.x < -halfWidth + radius ||
    proposed.x > halfWidth - radius ||
    proposed.z < -halfDepth + radius ||
    proposed.z > RECEIVING_V2.trailerFrontZ - radius
  ) {
    return 'limite físico do mundo'
  }

  const insideTrailerLongitudinal =
    proposed.z > RECEIVING_V2.trailerRearZ + 0.05 &&
    proposed.z < RECEIVING_V2.trailerFrontZ
  if (
    state.truck.phase === 'docked' &&
    insideTrailerLongitudinal &&
    Math.abs(proposed.x) > RECEIVING_V2.trailerInnerHalfWidth - radius
  ) {
    return 'parede lateral da carroceria'
  }

  for (const pallet of state.pallets) {
    if (pallet.id === ignorePalletId || pallet.phase === 'carried') continue
    const point =
      pallet.phase === 'truck'
        ? truckPalletPoint(pallet.index)
        : stagingPoint(pallet.stagedSlot ?? pallet.index)
    if (circleHitsPoint(proposed, radius, point, 0.67)) {
      return `pallet ${pallet.id}`
    }
  }

  return null
}

export function forkliftInsideTrailer(point: Point2): boolean {
  return (
    point.z > RECEIVING_V2.trailerRearZ &&
    point.z < RECEIVING_V2.trailerFrontZ &&
    Math.abs(point.x) < RECEIVING_V2.trailerHalfWidth
  )
}

export function createInitialReceivingState(): ReceivingSimulationState {
  return {
    elapsed: 0,
    revision: 0,
    batch: 1,
    completedTrucks: 0,
    label: 'CAMINHÃO 001 CHEGANDO AO RECEBIMENTO',
    fault: null,
    truck: {
      phase: 'arriving',
      z: RECEIVING_V2.truckSpawnZ,
    },
    forklift: {
      position: clonePoint(RECEIVING_V2.forkliftHome),
      heading: Math.PI,
      speed: 0,
      forkHeight: RECEIVING_V2.travelForkHeight,
      phase: 'parked',
      carryingPalletId: null,
    },
    pallets: createPallets(1),
  }
}

export class ReceivingSimulation {
  private readonly state = createInitialReceivingState()
  private readonly queue: SimulationAction[] = []
  private running: RunningAction | null = null

  constructor() {
    this.queue.push(
      {
        kind: 'truck-move',
        targetZ: RECEIVING_V2.truckDockZ,
        phase: 'arriving',
        label: 'CAMINHÃO 001 ENTRANDO DE RÉ NA DOCA',
      },
      {
        kind: 'wait',
        seconds: 0.35,
        label: 'CAMINHÃO DOCKADO · CONFERINDO 6 PALLETS',
        truckPhase: 'docked',
      },
      { kind: 'begin-batch' },
    )
  }

  read(): Readonly<ReceivingSimulationState> {
    return this.state
  }

  snapshot(): ReceivingSimulationState {
    return {
      ...this.state,
      truck: { ...this.state.truck },
      forklift: {
        ...this.state.forklift,
        position: clonePoint(this.state.forklift.position),
      },
      pallets: this.state.pallets.map((pallet) => ({ ...pallet })),
    }
  }

  private transition(
    label: string,
    forkliftPhase?: ForkliftPhase,
    truckPhase?: TruckPhase,
  ): void {
    this.state.label = label
    if (forkliftPhase) this.state.forklift.phase = forkliftPhase
    if (truckPhase) this.state.truck.phase = truckPhase
    this.state.revision += 1
  }

  private fail(reason: string): void {
    this.state.fault = reason
    this.state.forklift.phase = 'fault'
    this.state.forklift.speed = 0
    this.state.label = `PARADA DE SEGURANÇA · ${reason.toUpperCase()}`
    this.state.revision += 1
  }

  private enqueueBatchActions(): void {
    for (let index = 0; index < 6; index += 1) {
      const pallet = this.state.pallets[index]
      const source = truckPalletPoint(index)
      const lane = { x: source.x, z: RECEIVING_V2.pickupLaneZ }
      const pickup = { x: source.x, z: source.z - 1.55 }
      const clear = { x: source.x, z: RECEIVING_V2.truckClearZ }
      const stage = stagingPoint(index)
      const stageApproach = {
        x: stage.x,
        z: RECEIVING_V2.stagingApproachZ,
      }
      const stageDrop = { x: stage.x, z: stage.z + 1.55 }

      this.queue.push(
        {
          kind: 'rotate',
          heading: Math.PI,
          phase: 'aligning',
          label: `RX20 ALINHANDO PARA O PALLET ${index + 1}/6`,
        },
        {
          kind: 'move-curve',
          control1: {
            x: this.state.forklift.position.x,
            z: Math.max(this.state.forklift.position.z + 10, 1),
          },
          control2: { x: lane.x, z: 13 },
          target: lane,
          maximumSpeed: RECEIVING_V2.forwardSpeed,
          reverse: false,
          phase: 'driving-to-dock',
          label: `RX20 APROXIMANDO DA DOCA · PALLET ${index + 1}/6`,
        },
        {
          kind: 'rotate',
          heading: Math.PI,
          phase: 'aligning',
          label: 'ALINHAMENTO RETO COM A BOCA DA CARROCERIA',
        },
        {
          kind: 'fork',
          height: RECEIVING_V2.insertionForkHeight,
          phase: 'aligning',
          label: 'AJUSTANDO ALTURA DOS GARFOS',
        },
        {
          kind: 'move-line',
          target: pickup,
          maximumSpeed: 1.25,
          reverse: false,
          heading: Math.PI,
          phase: 'entering-trailer',
          label: 'ENTRANDO RETO · GIRO BLOQUEADO DENTRO DO CAMINHÃO',
          ignorePalletId: pallet.id,
        },
        {
          kind: 'wait',
          seconds: 0.2,
          label: `GARFOS POSICIONADOS SOB O PALLET ${index + 1}`,
          phase: 'picking',
        },
        { kind: 'attach', palletIndex: index },
        {
          kind: 'fork',
          height: RECEIVING_V2.pickupForkHeight,
          phase: 'picking',
          label: `PALLET ${index + 1} ELEVADO COM SEGURANÇA`,
        },
        {
          kind: 'wait',
          seconds: 0.28,
          label: 'CARGA ESTABILIZADA · INICIANDO SAÍDA DE RÉ',
          phase: 'picking',
        },
        {
          kind: 'move-line',
          target: lane,
          maximumSpeed: RECEIVING_V2.reverseSpeed,
          reverse: true,
          heading: Math.PI,
          phase: 'reversing-out',
          label: 'SAINDO DE RÉ · DIREÇÃO TRAVADA RETA',
        },
        {
          kind: 'move-line',
          target: clear,
          maximumSpeed: RECEIVING_V2.reverseSpeed,
          reverse: true,
          heading: Math.PI,
          phase: 'clearing-trailer',
          label: 'RECUANDO ATÉ LIBERAR COMPLETAMENTE A CARROCERIA',
        },
        {
          kind: 'rotate',
          heading: 0,
          phase: 'turning',
          label: 'ÁREA LIVRE CONFIRMADA · GIRANDO PARA O STAGING',
        },
        {
          kind: 'move-curve',
          control1: { x: clear.x, z: 8 },
          control2: { x: stageApproach.x, z: -2 },
          target: stageApproach,
          maximumSpeed: RECEIVING_V2.loadedSpeed,
          reverse: false,
          phase: 'transporting',
          label: `TRANSPORTANDO PARA A POSIÇÃO D${index + 1}`,
        },
        {
          kind: 'move-line',
          target: stageDrop,
          maximumSpeed: 1.15,
          reverse: false,
          heading: 0,
          phase: 'staging',
          label: `APROXIMAÇÃO FINAL DA POSIÇÃO D${index + 1}`,
        },
        {
          kind: 'fork',
          height: RECEIVING_V2.insertionForkHeight,
          phase: 'staging',
          label: `BAIXANDO PALLET NA POSIÇÃO D${index + 1}`,
        },
        { kind: 'detach', palletIndex: index, stageIndex: index },
        {
          kind: 'wait',
          seconds: 0.24,
          label: `PALLET ${index + 1} CONFIRMADO NO STAGING`,
          phase: 'staging',
        },
        {
          kind: 'move-line',
          target: stageApproach,
          maximumSpeed: RECEIVING_V2.reverseSpeed,
          reverse: true,
          heading: 0,
          phase: 'staging',
          label: 'RECUANDO SEM ATRAVESSAR O PALLET DEPOSITADO',
        },
        {
          kind: 'fork',
          height: RECEIVING_V2.travelForkHeight,
          phase: 'returning',
          label:
            index === 5
              ? 'SEIS PALLETS DESCARREGADOS'
              : 'GARFOS EM POSIÇÃO DE DESLOCAMENTO',
        },
      )
    }

    const home = RECEIVING_V2.forkliftHome
    this.queue.push(
      {
        kind: 'move-curve',
        control1: { x: 15, z: -23 },
        control2: { x: -12, z: -25 },
        target: home,
        maximumSpeed: RECEIVING_V2.forwardSpeed,
        reverse: false,
        phase: 'returning',
        label: 'RX20 RETORNANDO À VAGA ANTES DE LIBERAR O CAMINHÃO',
      },
      {
        kind: 'wait',
        seconds: 0.45,
        label: 'RX20 ESTACIONADA · CAMINHÃO VAZIO LIBERADO',
        phase: 'parked',
      },
      {
        kind: 'truck-move',
        targetZ: RECEIVING_V2.truckSpawnZ,
        phase: 'departing',
        label: 'CAMINHÃO VAZIO SAINDO DA DOCA',
      },
      {
        kind: 'wait',
        seconds: RECEIVING_V2.gapSeconds,
        label: 'DOCA VAZIA · PRÓXIMO CAMINHÃO EM 1 SEGUNDO',
        truckPhase: 'gap',
      },
      { kind: 'reset-batch' },
      {
        kind: 'truck-move',
        targetZ: RECEIVING_V2.truckDockZ,
        phase: 'arriving',
        label: 'NOVO CAMINHÃO CHEGANDO COM MAIS 6 PALLETS',
      },
      {
        kind: 'wait',
        seconds: 0.35,
        label: 'NOVO CAMINHÃO DOCKADO · CONFERÊNCIA FINAL',
        truckPhase: 'docked',
      },
      { kind: 'begin-batch' },
    )
  }

  private beginAction(action: SimulationAction): void {
    let duration = 0
    let curveLength = 0
    if (action.kind === 'move-curve') {
      curveLength = approximateCurveLength(
        this.state.forklift.position,
        action.control1,
        action.control2,
        action.target,
      )
      duration = Math.max(0.2, curveLength / action.maximumSpeed)
    }
    if (action.kind === 'wait') duration = action.seconds

    this.running = {
      action,
      elapsed: 0,
      duration,
      startPosition: clonePoint(this.state.forklift.position),
      startTruckZ: this.state.truck.z,
      curveLength,
    }

    if (action.kind === 'move-line' || action.kind === 'move-curve') {
      this.transition(action.label, action.phase)
    } else if (action.kind === 'rotate' || action.kind === 'fork') {
      this.transition(action.label, action.phase)
    } else if (action.kind === 'wait') {
      this.transition(action.label, action.phase, action.truckPhase)
    } else if (action.kind === 'truck-move') {
      this.transition(action.label, undefined, action.phase)
    }
  }

  private completeRunning(): void {
    this.running = null
  }

  private processImmediate(action: SimulationAction): boolean {
    if (action.kind === 'attach') {
      const pallet = this.state.pallets[action.palletIndex]
      pallet.phase = 'carried'
      this.state.forklift.carryingPalletId = pallet.id
      this.state.revision += 1
      return true
    }
    if (action.kind === 'detach') {
      const pallet = this.state.pallets[action.palletIndex]
      pallet.phase = 'staged'
      pallet.stagedSlot = action.stageIndex
      this.state.forklift.carryingPalletId = null
      this.state.revision += 1
      return true
    }
    if (action.kind === 'begin-batch') {
      this.state.truck.phase = 'docked'
      this.transition(
        `LOTE ${String(this.state.batch).padStart(3, '0')} LIBERADO · INICIANDO DESCARGA`,
        'parked',
        'docked',
      )
      this.enqueueBatchActions()
      return true
    }
    if (action.kind === 'reset-batch') {
      this.state.completedTrucks += 1
      this.state.batch += 1
      this.state.pallets = createPallets(this.state.batch)
      this.state.truck.z = RECEIVING_V2.truckSpawnZ
      this.state.truck.phase = 'gap'
      this.state.forklift.position = clonePoint(RECEIVING_V2.forkliftHome)
      this.state.forklift.heading = Math.PI
      this.state.forklift.speed = 0
      this.state.forklift.forkHeight = RECEIVING_V2.travelForkHeight
      this.state.forklift.phase = 'parked'
      this.state.forklift.carryingPalletId = null
      this.transition(
        `LOTE ${String(this.state.batch).padStart(3, '0')} CRIADO COM 6 PALLETS`,
        'parked',
        'gap',
      )
      return true
    }
    return false
  }

  private advanceLine(action: MoveLineAction, delta: number): boolean {
    const position = this.state.forklift.position
    const remaining = distance(position, action.target)
    if (remaining <= 0.015) {
      this.state.forklift.position = clonePoint(action.target)
      this.state.forklift.speed = 0
      return true
    }

    const brakingSpeed = Math.sqrt(
      Math.max(0, 2 * RECEIVING_V2.braking * remaining),
    )
    const desired = Math.min(action.maximumSpeed, brakingSpeed)
    this.state.forklift.speed = approach(
      this.state.forklift.speed,
      desired,
      RECEIVING_V2.acceleration * delta,
    )
    const step = Math.min(remaining, Math.max(0.08, this.state.forklift.speed) * delta)
    const proposed = {
      x: position.x + ((action.target.x - position.x) / remaining) * step,
      z: position.z + ((action.target.z - position.z) / remaining) * step,
    }
    const collision = forkliftCollisionReason(
      this.state,
      proposed,
      action.ignorePalletId,
    )
    if (collision) {
      this.fail(collision)
      return false
    }
    this.state.forklift.position = proposed
    this.state.forklift.heading = normalizeAngle(action.heading)
    return step >= remaining - 0.001
  }

  private advanceCurve(running: RunningAction, action: MoveCurveAction, delta: number): boolean {
    running.elapsed = Math.min(running.duration, running.elapsed + delta)
    const raw = running.duration <= 0 ? 1 : running.elapsed / running.duration
    const t = raw * raw * (3 - 2 * raw)
    const proposed = cubicPoint(
      running.startPosition,
      action.control1,
      action.control2,
      action.target,
      t,
    )
    const collision = forkliftCollisionReason(this.state, proposed)
    if (collision) {
      this.fail(collision)
      return false
    }
    const tangent = cubicTangent(
      running.startPosition,
      action.control1,
      action.control2,
      action.target,
      Math.min(0.999, Math.max(0.001, t)),
    )
    this.state.forklift.position = proposed
    this.state.forklift.heading = headingForVector(
      tangent.x,
      tangent.z,
      action.reverse,
    )
    this.state.forklift.speed =
      action.maximumSpeed * Math.sin(Math.max(0.08, raw) * Math.PI)
    if (raw >= 1) {
      this.state.forklift.position = clonePoint(action.target)
      this.state.forklift.speed = 0
      return true
    }
    return false
  }

  step(deltaSeconds: number): void {
    if (this.state.fault) return
    const delta = Math.min(0.05, Math.max(0, deltaSeconds))
    this.state.elapsed += delta

    let immediateGuard = 0
    while (!this.running && this.queue.length > 0 && immediateGuard < 12) {
      immediateGuard += 1
      const action = this.queue.shift()!
      if (this.processImmediate(action)) continue
      this.beginAction(action)
    }

    const running = this.running
    if (!running) return
    const action = running.action
    let completed = false

    if (action.kind === 'move-line') {
      completed = this.advanceLine(action, delta)
    } else if (action.kind === 'move-curve') {
      completed = this.advanceCurve(running, action, delta)
    } else if (action.kind === 'rotate') {
      const difference = normalizeAngle(action.heading - this.state.forklift.heading)
      const step = RECEIVING_V2.angularSpeed * delta
      if (Math.abs(difference) <= step) {
        this.state.forklift.heading = normalizeAngle(action.heading)
        completed = true
      } else {
        this.state.forklift.heading = normalizeAngle(
          this.state.forklift.heading + Math.sign(difference) * step,
        )
      }
      this.state.forklift.speed = 0
    } else if (action.kind === 'fork') {
      const next = approach(
        this.state.forklift.forkHeight,
        action.height,
        1.15 * delta,
      )
      this.state.forklift.forkHeight = next
      completed = Math.abs(next - action.height) <= 0.001
    } else if (action.kind === 'wait') {
      running.elapsed += delta
      this.state.forklift.speed = 0
      completed = running.elapsed >= action.seconds
    } else if (action.kind === 'truck-move') {
      const difference = action.targetZ - this.state.truck.z
      const step = Math.sign(difference) * RECEIVING_V2.truckSpeed * delta
      if (Math.abs(difference) <= Math.abs(step)) {
        this.state.truck.z = action.targetZ
        completed = true
        if (action.phase === 'arriving') this.state.truck.phase = 'docked'
      } else {
        this.state.truck.z += step
      }
    }

    if (completed) this.completeRunning()
  }
}
