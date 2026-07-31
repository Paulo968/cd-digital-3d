import { create } from 'zustand'

export type InboundTruckPhase =
  | 'docked'
  | 'waiting'
  | 'departing'
  | 'away'
  | 'approaching'

interface InboundTruckState {
  phase: InboundTruckPhase
  cycle: number
  changedAt: number
  setPhase: (phase: InboundTruckPhase) => void
  completeCycle: () => void
  reset: () => void
}

function initialState() {
  return {
    phase: 'docked' as const,
    cycle: 1,
    changedAt: Date.now(),
  }
}

export const useInboundTruckStore = create<InboundTruckState>((set) => ({
  ...initialState(),
  setPhase: (phase) => set({ phase, changedAt: Date.now() }),
  completeCycle: () =>
    set((state) => ({
      phase: 'docked',
      cycle: state.cycle + 1,
      changedAt: Date.now(),
    })),
  reset: () => set(initialState()),
}))

export function inboundTruckIsDocked(): boolean {
  return useInboundTruckStore.getState().phase === 'docked'
}
