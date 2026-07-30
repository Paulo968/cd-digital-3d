import { describe, expect, it } from 'vitest'
import {
  COMPACT_PANEL_BOUNDS,
  DESKTOP_PANEL_BOUNDS,
  clampPanelPosition,
  panelPresetPosition,
  panelSizeIsUsable,
} from './operationsPanelPosition'

const desktopViewport = { width: 1440, height: 900 }
const desktopPanel = { width: 390, height: 620 }

describe('operationsPanelPosition', () => {
  it('mantém a janela dentro da área visível', () => {
    expect(
      clampPanelPosition(
        { x: -800, y: 4_000 },
        desktopPanel,
        desktopViewport,
        DESKTOP_PANEL_BOUNDS,
      ),
    ).toEqual({ x: 16, y: 264 })
  })

  it('posiciona a central no topo direito', () => {
    expect(
      panelPresetPosition(
        'top-right',
        desktopPanel,
        desktopViewport,
        DESKTOP_PANEL_BOUNDS,
      ),
    ).toEqual({ x: 1034, y: 82 })
  })

  it('centraliza a janela dentro da área operacional', () => {
    expect(
      panelPresetPosition(
        'center',
        desktopPanel,
        desktopViewport,
        DESKTOP_PANEL_BOUNDS,
      ),
    ).toEqual({ x: 525, y: 173 })
  })

  it('preserva a navegação inferior no perfil compacto', () => {
    expect(
      panelPresetPosition(
        'bottom-right',
        { width: 344, height: 420 },
        { width: 360, height: 760 },
        COMPACT_PANEL_BOUNDS,
      ),
    ).toEqual({ x: 8, y: 262 })
  })

  it('aguarda a medida real antes de salvar a posição', () => {
    expect(panelSizeIsUsable({ width: 0, height: 0 })).toBe(false)
    expect(panelSizeIsUsable({ width: 390, height: 0 })).toBe(false)
    expect(panelSizeIsUsable({ width: 390, height: 48 })).toBe(true)
  })
})
