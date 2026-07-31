import {
  ReceivingSimulation,
  type Point2,
  type ReceivingSimulationState,
} from './receivingSimulation'

interface InternalCurveAction {
  kind: string
  label?: string
  control1?: Point2
  [key: string]: unknown
}

interface InternalReceivingSimulation {
  state: ReceivingSimulationState
}

interface InternalPrototype {
  beginAction(
    this: InternalReceivingSimulation,
    action: InternalCurveAction,
  ): void
}

const prototype = ReceivingSimulation.prototype as unknown as InternalPrototype
const originalBeginAction = prototype.beginAction

/**
 * As seis ordens são preparadas quando o caminhão é liberado. Sem este ajuste,
 * as curvas dos pallets 2 a 6 ainda poderiam conservar como primeiro controle
 * a vaga inicial da RX20, embora a máquina já estivesse no staging.
 *
 * O primeiro controle da aproximação à doca passa a ser calculado no instante
 * em que a ação realmente começa. Assim cada retorno nasce da posição atual,
 * produzindo uma curva contínua, curta e visualmente coerente.
 */
prototype.beginAction = function beginRefinedReceivingAction(
  action: InternalCurveAction,
): void {
  const isDockApproach =
    action.kind === 'move-curve' &&
    action.label?.includes('RX20 APROXIMANDO DA DOCA')

  const refined = isDockApproach
    ? {
        ...action,
        control1: {
          x: this.state.forklift.position.x,
          z: Math.max(this.state.forklift.position.z + 10, 1),
        },
      }
    : action

  originalBeginAction.call(this, refined)
}
