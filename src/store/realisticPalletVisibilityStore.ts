import { create } from 'zustand'

interface RealisticPalletVisibilityState {
  hiddenAddresses: string[]
  reset: (addresses?: Iterable<string>) => void
  add: (addresses: Iterable<string>) => void
}

function normalizedAddresses(addresses: Iterable<string>): string[] {
  return [...new Set([...addresses].filter(Boolean))].sort()
}

export const useRealisticPalletVisibilityStore =
  create<RealisticPalletVisibilityState>((set) => ({
    hiddenAddresses: [],
    reset: (addresses = []) =>
      set({ hiddenAddresses: normalizedAddresses(addresses) }),
    add: (addresses) =>
      set((state) => ({
        hiddenAddresses: normalizedAddresses([
          ...state.hiddenAddresses,
          ...addresses,
        ]),
      })),
  }))

export function resetRealisticMovablePalletAddresses(
  addresses: Iterable<string> = [],
): void {
  useRealisticPalletVisibilityStore.getState().reset(addresses)
}

export function addRealisticMovablePalletAddresses(
  addresses: Iterable<string>,
): void {
  useRealisticPalletVisibilityStore.getState().add(addresses)
}
