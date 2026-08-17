export type PalletTransferPhase =
  | 'idle'
  | 'going-to-source'
  | 'collecting'
  | 'transporting'
  | 'depositing'
  | 'completed'

export interface PalletTransferVisualState {
  hiddenSource: boolean
  cargoAtDestination: boolean
  phase: PalletTransferPhase
}

export const EMPTY_TRANSFER_VISUAL: PalletTransferVisualState = {
  hiddenSource: false,
  cargoAtDestination: false,
  phase: 'idle',
}
