import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  COMPACT_PANEL_BOUNDS,
  DESKTOP_PANEL_BOUNDS,
  clampPanelPosition,
  panelPresetPosition,
  panelSizeIsUsable,
  type PanelPosition,
  type PanelPreset,
  type PanelSize,
} from './operationsPanelPosition'
import './movable-operations-panel.css'

const POSITION_STORAGE_KEY = 'cd-digital-3d-operations-panel-position-v2'
const LEGACY_POSITION_STORAGE_KEY = 'cd-digital-3d-operations-panel-position'
const MAX_MEASURE_ATTEMPTS = 24

const PRESETS: Array<{
  id: PanelPreset
  icon: string
  label: string
}> = [
  { id: 'top-left', icon: '↖', label: 'Sup. esq.' },
  { id: 'top-center', icon: '↑', label: 'Topo' },
  { id: 'top-right', icon: '↗', label: 'Sup. dir.' },
  { id: 'bottom-left', icon: '↙', label: 'Inf. esq.' },
  { id: 'center', icon: '●', label: 'Centro' },
  { id: 'bottom-right', icon: '↘', label: 'Inf. dir.' },
]

interface MovableOperationsPanelProps {
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}

interface DragState {
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
}

function readSavedPosition(): PanelPosition | null {
  if (typeof window === 'undefined') return null

  try {
    // A versão anterior podia salvar uma coordenada calculada antes da medição real.
    window.localStorage.removeItem(LEGACY_POSITION_STORAGE_KEY)
    const value = window.localStorage.getItem(POSITION_STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<PanelPosition>
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
    return { x: Number(parsed.x), y: Number(parsed.y) }
  } catch {
    return null
  }
}

function savePosition(position: PanelPosition): void {
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // A central continua funcionando quando o navegador bloqueia armazenamento local.
  }
}

function clearSavedPosition(): void {
  try {
    window.localStorage.removeItem(POSITION_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_POSITION_STORAGE_KEY)
  } catch {
    // A recuperação visual não depende do armazenamento local.
  }
}

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function currentBounds() {
  return window.innerWidth <= 700
    ? COMPACT_PANEL_BOUNDS
    : DESKTOP_PANEL_BOUNDS
}

function measuredPanelSize(panel: HTMLElement): PanelSize | null {
  const rect = panel.getBoundingClientRect()
  const size = { width: rect.width, height: rect.height }
  return panelSizeIsUsable(size) ? size : null
}

function estimatedPanelSize(collapsed: boolean): PanelSize {
  const viewport = currentViewport()
  const bounds = currentBounds()
  const availableWidth = Math.max(120, viewport.width - bounds.margin * 2)
  const availableHeight = Math.max(
    44,
    viewport.height - bounds.topInset - bounds.bottomInset,
  )

  return {
    width: collapsed ? Math.min(250, availableWidth) : Math.min(390, availableWidth),
    height: collapsed ? 48 : Math.min(620, availableHeight),
  }
}

export function MovableOperationsPanel({
  collapsed,
  onToggle,
  children,
}: MovableOperationsPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [position, setPosition] = useState<PanelPosition | null>(readSavedPosition)
  const positionRef = useRef<PanelPosition | null>(position)
  const [dragging, setDragging] = useState(false)

  const updatePosition = useCallback(
    (next: PanelPosition, persist = false) => {
      const previous = positionRef.current
      if (previous?.x === next.x && previous.y === next.y) {
        if (persist) savePosition(next)
        return
      }
      positionRef.current = next
      setPosition(next)
      if (persist) savePosition(next)
    },
    [],
  )

  const clampToViewport = useCallback(
    (candidate?: PanelPosition, persist = true): boolean => {
      const panel = panelRef.current
      if (!panel) return false
      const size = measuredPanelSize(panel)
      if (!size) return false

      const viewport = currentViewport()
      const bounds = currentBounds()
      const fallback = panelPresetPosition('top-right', size, viewport, bounds)
      const next = clampPanelPosition(
        candidate ?? positionRef.current ?? fallback,
        size,
        viewport,
        bounds,
      )
      updatePosition(next, persist)
      return true
    },
    [updatePosition],
  )

  const applyPreset = useCallback(
    (preset: PanelPreset) => {
      const panel = panelRef.current
      const size = panel ? measuredPanelSize(panel) : null
      const next = panelPresetPosition(
        preset,
        size ?? estimatedPanelSize(collapsed),
        currentViewport(),
        currentBounds(),
      )
      updatePosition(next, true)
    },
    [collapsed, updatePosition],
  )

  const recoverPanel = useCallback(() => {
    clearSavedPosition()
    const next = panelPresetPosition(
      'top-right',
      estimatedPanelSize(false),
      currentViewport(),
      currentBounds(),
    )
    updatePosition(next, true)
    if (collapsed) onToggle()

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        clampToViewport(next, true)
      })
    })
  }, [clampToViewport, collapsed, onToggle, updatePosition])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    let animationFrame = 0
    let attempts = 0

    const positionWhenMeasured = () => {
      if (clampToViewport(undefined, attempts === 0)) return
      attempts += 1
      if (attempts < MAX_MEASURE_ATTEMPTS) {
        animationFrame = window.requestAnimationFrame(positionWhenMeasured)
      }
    }

    animationFrame = window.requestAnimationFrame(positionWhenMeasured)

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            window.cancelAnimationFrame(animationFrame)
            animationFrame = window.requestAnimationFrame(() => {
              clampToViewport(undefined, false)
            })
          })
    observer?.observe(panel)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer?.disconnect()
    }
  }, [clampToViewport, collapsed])

  useEffect(() => {
    const handleResize = () => clampToViewport(undefined, true)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [clampToViewport])

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    event.preventDefault()
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel || drag.pointerId !== event.pointerId) return
    const size = measuredPanelSize(panel)
    if (!size) return

    const next = clampPanelPosition(
      {
        x: drag.originX + event.clientX - drag.startClientX,
        y: drag.originY + event.clientY - drag.startClientY,
      },
      size,
      currentViewport(),
      currentBounds(),
    )
    updatePosition(next)
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (positionRef.current) savePosition(positionRef.current)
  }

  return (
    <>
      <button
        type="button"
        className="operations-panel-recover"
        onClick={recoverPanel}
        title="Trazer a central operacional para a tela"
        aria-label="Localizar a central operacional"
      >
        <span aria-hidden="true">◎</span>
        <strong>Localizar central</strong>
      </button>

      <aside
        ref={panelRef}
        className={`operations-control movable-operations-control ${
          collapsed ? 'is-collapsed' : ''
        } ${dragging ? 'is-dragging' : ''}`}
        style={
          position
            ? {
                left: position.x,
                top: position.y,
                right: 'auto',
                bottom: 'auto',
              }
            : undefined
        }
      >
        <div className="movable-operations-toolbar">
          <button
            type="button"
            className="movable-operations-drag-handle"
            aria-label="Arrastar a central operacional"
            title="Segure e arraste para mover"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <span className="movable-operations-grip" aria-hidden="true">
              ⠿
            </span>
            <span>
              <strong>Central operacional</strong>
              <small>Segure e arraste</small>
            </span>
          </button>
          <button
            type="button"
            className="movable-operations-collapse"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            {collapsed ? 'Abrir' : 'Ocultar'}
          </button>
        </div>

        {!collapsed && (
          <div className="movable-operations-presets">
            <span>Posição rápida</span>
            <div role="group" aria-label="Posições rápidas da central operacional">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  aria-label={`Mover para ${preset.label}`}
                  title={`Mover para ${preset.label}`}
                >
                  <strong aria-hidden="true">{preset.icon}</strong>
                  <small>{preset.label}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {children}
      </aside>
    </>
  )
}
