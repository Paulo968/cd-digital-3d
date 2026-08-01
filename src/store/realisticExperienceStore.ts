import { create } from 'zustand'
import type {
  KernelEvent,
  KernelTelemetry,
} from '../realistic/core/livingWorldKernel'
import type { ReceivingSimulationState } from '../realistic-v2/receivingSimulation'

export type RealisticCameraMode =
  | 'cinematic'
  | 'overview'
  | 'follow'
  | 'dock'

interface RealisticController {
  setTimeScale: (scale: number) => void
  togglePause: () => void
  stepOnce: () => void
  reset: () => void
  setCameraMode: (mode: RealisticCameraMode) => void
}

export interface RealisticPresentation {
  state: ReceivingSimulationState | null
  telemetry: KernelTelemetry | null
  events: KernelEvent[]
  timeScale: number
  paused: boolean
  cameraMode: RealisticCameraMode
}

interface RealisticExperienceState extends RealisticPresentation {
  connected: boolean
  controller: RealisticController | null
  registerController: (controller: RealisticController) => void
  unregisterController: () => void
  publish: (presentation: RealisticPresentation) => void
  changeTimeScale: (scale: number) => void
  togglePause: () => void
  stepOnce: () => void
  reset: () => void
  changeCameraMode: (mode: RealisticCameraMode) => void
}

const DEFAULT_PRESENTATION: RealisticPresentation = {
  state: null,
  telemetry: null,
  events: [],
  timeScale: 2,
  paused: false,
  cameraMode: 'cinematic',
}

export const useRealisticExperienceStore = create<RealisticExperienceState>(
  (set, get) => ({
    ...DEFAULT_PRESENTATION,
    connected: false,
    controller: null,
    registerController: (controller) =>
      set({ controller, connected: true }),
    unregisterController: () =>
      set({ controller: null, connected: false }),
    publish: (presentation) => set(presentation),
    changeTimeScale: (timeScale) => {
      get().controller?.setTimeScale(timeScale)
      set({ timeScale })
    },
    togglePause: () => {
      get().controller?.togglePause()
      set((state) => ({ paused: !state.paused }))
    },
    stepOnce: () => {
      if (!get().paused) return
      get().controller?.stepOnce()
    },
    reset: () => {
      get().controller?.reset()
      set({ paused: false })
    },
    changeCameraMode: (cameraMode) => {
      get().controller?.setCameraMode(cameraMode)
      set({ cameraMode })
    },
  }),
)
