export type RealisticPanel = 'operation' | 'flow' | 'camera' | 'events'

export const REALISTIC_PANEL_LABEL: Record<RealisticPanel, string> = {
  operation: 'Operação viva',
  flow: 'Fluxo do CD',
  camera: 'Câmeras',
  events: 'Eventos',
}

export const REALISTIC_PANEL_ICON: Record<RealisticPanel, string> = {
  operation: '◉',
  flow: '⇢',
  camera: '◈',
  events: '≡',
}
