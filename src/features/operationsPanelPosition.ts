export interface PanelPosition {
  x: number
  y: number
}

export interface PanelSize {
  width: number
  height: number
}

export interface PanelViewport {
  width: number
  height: number
}

export interface PanelBounds {
  margin: number
  topInset: number
  bottomInset: number
}

export type PanelPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center'
  | 'bottom-left'
  | 'bottom-right'

export const DESKTOP_PANEL_BOUNDS: PanelBounds = {
  margin: 16,
  topInset: 82,
  bottomInset: 16,
}

export const COMPACT_PANEL_BOUNDS: PanelBounds = {
  margin: 8,
  topInset: 72,
  bottomInset: 78,
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum
  return Math.min(Math.max(value, minimum), maximum)
}

export function clampPanelPosition(
  position: PanelPosition,
  size: PanelSize,
  viewport: PanelViewport,
  bounds: PanelBounds,
): PanelPosition {
  const maximumX = Math.max(bounds.margin, viewport.width - size.width - bounds.margin)
  const maximumY = Math.max(
    bounds.topInset,
    viewport.height - size.height - bounds.bottomInset,
  )

  return {
    x: Math.round(
      clamp(finite(position.x, bounds.margin), bounds.margin, maximumX),
    ),
    y: Math.round(
      clamp(finite(position.y, bounds.topInset), bounds.topInset, maximumY),
    ),
  }
}

export function panelPresetPosition(
  preset: PanelPreset,
  size: PanelSize,
  viewport: PanelViewport,
  bounds: PanelBounds,
): PanelPosition {
  const left = bounds.margin
  const right = Math.max(bounds.margin, viewport.width - size.width - bounds.margin)
  const top = bounds.topInset
  const bottom = Math.max(
    bounds.topInset,
    viewport.height - size.height - bounds.bottomInset,
  )
  const centerX = left + (right - left) / 2
  const centerY = top + (bottom - top) / 2

  const positions: Record<PanelPreset, PanelPosition> = {
    'top-left': { x: left, y: top },
    'top-center': { x: centerX, y: top },
    'top-right': { x: right, y: top },
    center: { x: centerX, y: centerY },
    'bottom-left': { x: left, y: bottom },
    'bottom-right': { x: right, y: bottom },
  }

  return clampPanelPosition(positions[preset], size, viewport, bounds)
}
