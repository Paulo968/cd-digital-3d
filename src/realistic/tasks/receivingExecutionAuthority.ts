import type { ReceivingSimulationState } from '../../realistic-v2/receivingSimulation'
import type { ReceivingOperationsTelemetry } from './receivingTaskResourceSystem'

export interface ReceivingExecutionPermit {
  allowed: boolean
  reason: string
  taskId: string | null
  palletId: string | null
  destinationSlot: number | null
}

function allow(
  reason: string,
  operations: ReceivingOperationsTelemetry,
): ReceivingExecutionPermit {
  return {
    allowed: true,
    reason,
    taskId: operations.activeTask?.id ?? null,
    palletId: operations.activeTask?.palletId ?? null,
    destinationSlot: operations.activeTask?.destinationSlot ?? null,
  }
}

function block(
  reason: string,
  operations: ReceivingOperationsTelemetry,
): ReceivingExecutionPermit {
  return {
    allowed: false,
    reason,
    taskId: operations.activeTask?.id ?? null,
    palletId: operations.activeTask?.palletId ?? null,
    destinationSlot: operations.activeTask?.destinationSlot ?? null,
  }
}

/**
 * A operação permite que o ciclo do caminhão continue livremente, mas exige
 * tarefa, recurso e destino válidos antes que a RX20 inicie ou continue uma
 * descarga. Assim o kernel passa a autorizar a execução, sem entregar a fonte
 * da verdade ao React ou ao Three.js.
 */
export function receivingExecutionPermit(
  state: Readonly<ReceivingSimulationState>,
  operations: ReceivingOperationsTelemetry,
): ReceivingExecutionPermit {
  if (state.fault) return block('safety-fault', operations)
  if (state.truck.phase !== 'docked') return allow('truck-cycle', operations)

  const truckPallets = state.pallets.filter((pallet) => pallet.phase === 'truck')
  if (truckPallets.length === 0) return allow('batch-finishing', operations)

  const active = operations.activeTask
  if (!active) return block('no-assigned-task', operations)
  if (active.destinationSlot === null) {
    return block('destination-not-reserved', operations)
  }
  if (operations.resource.taskId !== active.id) {
    return block('resource-task-mismatch', operations)
  }
  if (operations.resource.status === 'available') {
    return block('resource-not-reserved', operations)
  }

  const pallet = state.pallets.find((candidate) => candidate.id === active.palletId)
  if (!pallet) return block('assigned-pallet-not-found', operations)
  if (pallet.phase === 'staged') return block('assigned-task-already-completed', operations)

  const carryingPalletId = state.forklift.carryingPalletId
  if (carryingPalletId && carryingPalletId !== active.palletId) {
    return block('carrying-unassigned-pallet', operations)
  }

  return allow(
    pallet.phase === 'carried' ? 'executing-assigned-task' : 'assigned-task-ready',
    operations,
  )
}
