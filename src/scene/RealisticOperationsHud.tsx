import { useEffect } from 'react'
import type {
  KernelEvent,
  KernelTelemetry,
} from '../realistic/core/livingWorldKernel'
import type { ReceivingSimulationState } from '../realistic-v2/receivingSimulation'
import {
  useRealisticExperienceStore,
  type RealisticCameraMode,
} from '../store/realisticExperienceStore'

export type { RealisticCameraMode } from '../store/realisticExperienceStore'

interface RealisticOperationsHudProps {
  state: ReceivingSimulationState
  telemetry: KernelTelemetry
  events: KernelEvent[]
  timeScale: number
  paused: boolean
  cameraMode: RealisticCameraMode
  onTimeScaleChange: (scale: number) => void
  onTogglePause: () => void
  onStepOnce: () => void
  onReset: () => void
  onCameraModeChange: (mode: RealisticCameraMode) => void
}

/**
 * Ponte entre o motor 3D e o menu DOM da aplicação.
 *
 * Os controles não são mais renderizados dentro do Canvas. O mundo realista
 * continua dono do runtime, enquanto o shell React exibe e aciona a operação
 * no mesmo menu usado pelo modo operacional.
 */
export function RealisticOperationsHud({
  state,
  telemetry,
  events,
  timeScale,
  paused,
  cameraMode,
  onTimeScaleChange,
  onTogglePause,
  onStepOnce,
  onReset,
  onCameraModeChange,
}: RealisticOperationsHudProps) {
  const registerController = useRealisticExperienceStore(
    (store) => store.registerController,
  )
  const unregisterController = useRealisticExperienceStore(
    (store) => store.unregisterController,
  )
  const publish = useRealisticExperienceStore((store) => store.publish)

  useEffect(() => {
    registerController({
      setTimeScale: onTimeScaleChange,
      togglePause: onTogglePause,
      stepOnce: onStepOnce,
      reset: onReset,
      setCameraMode: onCameraModeChange,
    })

    return unregisterController
  }, [
    onCameraModeChange,
    onReset,
    onStepOnce,
    onTimeScaleChange,
    onTogglePause,
    registerController,
    unregisterController,
  ])

  useEffect(() => {
    publish({
      state,
      telemetry,
      events,
      timeScale,
      paused,
      cameraMode,
    })
  }, [cameraMode, events, paused, publish, state, telemetry, timeScale])

  return null
}
