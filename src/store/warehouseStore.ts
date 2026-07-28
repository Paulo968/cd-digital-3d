import { create } from 'zustand'
import {
  generateDemoWarehouse,
  type SlotStatus,
  type WarehouseLocation,
} from '../domain/warehouse'

interface WarehouseState {
  locations: WarehouseLocation[]
  selectedAddress: string | null
  search: string
  visibleStatuses: Record<SlotStatus, boolean>
  selectAddress: (address: string | null) => void
  setSearch: (value: string) => void
  toggleStatus: (status: SlotStatus) => void
  resetView: () => void
}

const allStatusesVisible: Record<SlotStatus, boolean> = {
  occupied: true,
  empty: true,
  blocked: true,
  divergent: true,
}

export const useWarehouseStore = create<WarehouseState>((set) => ({
  locations: generateDemoWarehouse(),
  selectedAddress: null,
  search: '',
  visibleStatuses: allStatusesVisible,
  selectAddress: (selectedAddress) => set({ selectedAddress }),
  setSearch: (search) => set({ search }),
  toggleStatus: (status) =>
    set((state) => ({
      visibleStatuses: {
        ...state.visibleStatuses,
        [status]: !state.visibleStatuses[status],
      },
    })),
  resetView: () =>
    set({
      selectedAddress: null,
      search: '',
      visibleStatuses: allStatusesVisible,
    }),
}))
