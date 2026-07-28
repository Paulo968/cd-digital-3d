import { create } from 'zustand'
import {
  generateDemoWarehouse,
  type SlotStatus,
  type WarehouseLocation,
} from '../domain/warehouse'

export interface ImportSummary {
  fileName: string
  rowsRead: number
  importedRows: number
  issueCount: number
}

type DataSource = 'demo' | 'csv'

interface WarehouseState {
  locations: WarehouseLocation[]
  dataSource: DataSource
  importSummary: ImportSummary | null
  selectedAddress: string | null
  search: string
  visibleStatuses: Record<SlotStatus, boolean>
  selectAddress: (address: string | null) => void
  setSearch: (value: string) => void
  toggleStatus: (status: SlotStatus) => void
  loadImportedWarehouse: (
    locations: WarehouseLocation[],
    summary: ImportSummary,
  ) => void
  loadDemoWarehouse: () => void
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
  dataSource: 'demo',
  importSummary: null,
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
  loadImportedWarehouse: (locations, importSummary) =>
    set({
      locations,
      dataSource: 'csv',
      importSummary,
      selectedAddress: null,
      search: '',
      visibleStatuses: allStatusesVisible,
    }),
  loadDemoWarehouse: () =>
    set({
      locations: generateDemoWarehouse(),
      dataSource: 'demo',
      importSummary: null,
      selectedAddress: null,
      search: '',
      visibleStatuses: allStatusesVisible,
    }),
  resetView: () =>
    set({
      selectedAddress: null,
      search: '',
      visibleStatuses: allStatusesVisible,
    }),
}))
