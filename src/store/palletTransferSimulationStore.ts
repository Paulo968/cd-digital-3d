import { create } from 'zustand'
import {
  buildPalletTransferSimulation,
  type PalletTransferSimulation,
} from '../domain/palletTransferSimulation'
import { useDigitalTwinStore, type ActionResult } from './digitalTwinStore'
import { getOperationalVehicleRuntimePose } from './operationalVehicleRuntime'
import { useOperationalVehicleStore } from './operationalVehicleStore'

export type PalletTransferStatus = 'idle' | 'running' | 'completed'

interface PalletTransferSimulationState {
  simulation: PalletTransferSimulation | null
  status: PalletTransferStatus
  runToken: number
  start: (simulation: PalletTransferSimulation) => ActionResult
  complete: () => void
  clear: () => void
  applyToScenario: () => ActionResult
}

function identityStillMatches(
  simulation: PalletTransferSimulation,
): ActionResult {
  const twin = useDigitalTwinStore.getState()
  const source = twin.locations.find(
    (location) => location.address === simulation.sourceAddress,
  )
  const destination = twin.locations.find(
    (location) => location.address === simulation.destinationAddress,
  )

  if (!source || !destination) {
    return { ok: false, message: 'A origem ou o destino não existe mais no layout.' }
  }
  if (
    source.sku !== simulation.sku ||
    source.quantity !== simulation.quantity ||
    (source.lot ?? '') !== (simulation.lot ?? '') ||
    (source.expirationDate ?? '') !== (simulation.expirationDate ?? '') ||
    (source.handlingUnitCode ?? '') !== (simulation.handlingUnitCode ?? '')
  ) {
    return {
      ok: false,
      message:
        'O conteúdo da origem mudou depois do planejamento. Prepare a simulação novamente.',
    }
  }
  if (destination.quantity > 0 || destination.status !== 'empty') {
    return {
      ok: false,
      message: 'O destino deixou de estar vazio. Escolha outra posição.',
    }
  }

  return { ok: true, message: 'Simulação validada.' }
}

function rebuildFromRuntimePose(
  simulation: PalletTransferSimulation,
): PalletTransferSimulation {
  const runtimePose = getOperationalVehicleRuntimePose()
  if (!runtimePose) return simulation

  const twin = useDigitalTwinStore.getState()
  const source = twin.locations.find(
    (location) => location.address === simulation.sourceAddress,
  )
  const destination = twin.locations.find(
    (location) => location.address === simulation.destinationAddress,
  )
  if (!source || !destination) return simulation

  return buildPalletTransferSimulation(
    twin.layout,
    source,
    destination,
    twin.blockedCrossAisles,
    runtimePose.point,
  )
}

export const usePalletTransferSimulationStore =
  create<PalletTransferSimulationState>((set, get) => ({
    simulation: null,
    status: 'idle',
    runToken: 0,
    start: (simulation) => {
      const effectiveSimulation = rebuildFromRuntimePose(simulation)
      const validation = identityStillMatches(effectiveSimulation)
      if (!validation.ok) return validation

      useDigitalTwinStore.getState().setRoutePlan(null)
      set((state) => ({
        simulation: effectiveSimulation,
        status: 'running',
        runToken: state.runToken + 1,
      }))
      return {
        ok: true,
        message: `Transporte simulado iniciado da posição atual da EMP-01: ${effectiveSimulation.sourceAddress} → ${effectiveSimulation.destinationAddress}.`,
      }
    },
    complete: () => {
      const simulation = get().simulation
      const destinationPoint = simulation?.loadedPoints.at(-1)

      if (simulation && destinationPoint) {
        useOperationalVehicleStore.getState().parkAtPoint(
          destinationPoint,
          `Ao lado de ${simulation.destinationAddress}`,
          simulation.destinationFacing,
        )
      } else if (simulation) {
        useOperationalVehicleStore
          .getState()
          .parkAtAddress(simulation.destinationAddress)
      }

      set({ status: 'completed' })
    },
    clear: () => set({ simulation: null, status: 'idle' }),
    applyToScenario: () => {
      const simulation = get().simulation
      if (!simulation || get().status !== 'completed') {
        return {
          ok: false,
          message: 'Conclua a animação antes de aplicar a movimentação ao cenário.',
        }
      }

      const result = useDigitalTwinStore.getState().registerMovement({
        source: simulation.sourceAddress,
        destination: simulation.destinationAddress,
        quantity: simulation.quantity,
        type: 'transfer',
        actorName: 'Simulador 3D',
        documentReference: simulation.id,
        physicalConfirmation: false,
      })

      if (result.ok) {
        set({ simulation: null, status: 'idle' })
      }

      return result.ok
        ? {
            ok: true,
            message:
              'Movimentação aplicada ao cenário sistêmico. A EMP-01 permanece estacionada exatamente onde concluiu a entrega, sem confirmação física.',
          }
        : result
    },
  }))
