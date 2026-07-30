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
  type PanelPosition,
  type PanelPreset,
} from './operationsPanelPosition'
import './movable-operations-panel.css'

const POSITION_STORAGE_KEY = 'cd-digital-3d-operations-panel-position'

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

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function currentBounds() {
  return window.innerWidth <= 700
    ? COMPACT_PANEL_BOUNDS
    : DESKTOP_PANEL_BOUNDS
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
      positionRef.current = next
      setPosition(next)
      if (persist) savePosition(next)
    },
    [],
  )

  const clampToViewport = useCallback(
    (candidate?: PanelPosition, persist = true) => {
      const panel = panelRef.current
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      const viewport = currentViewport()
      const bounds = currentBounds()
      const fallback = panelPresetPosition(
        'top-right',
        { width: rect.width, height: rect.height },
        viewport,
        bounds,
      )
      const next = clampPanelPosition(
        candidate ?? positionRef.current ?? fallback,
        { width: rect.width, height: rect.height },
        viewport,
        bounds,
      )
      updatePosition(next, persist)
    },
    [updatePosition],
  )

  const applyPreset = useCallback(
    (preset: PanelPreset) => {
      const panel = panelRef.current
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      const next = panelPresetPosition(
        preset,
        { width: rect.width, height: rect.height },
        currentViewport(),
        currentBounds(),
      )
      updatePosition(next, true)
    },
    [updatePosition],
  )

  useLayoutEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      clampToViewport(undefined, true)
    })
    return () => window.cancelAnimationFrame(animationFrame)
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
    const rect = panel.getBoundingClientRect()
    const next = clampPanelPosition(
      {
        x: drag.originX + event.clientX - drag.startClientX,
        y: drag.originY + event.clientY - drag.startClientY,
      },
      { width: rect.width, height: rect.height },
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
  )
}
