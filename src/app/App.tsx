import { useEffect, useMemo, useState } from 'react'
import { ImportPanel } from '../features/ImportPanel'
import { LayoutBuilderPanel } from '../features/LayoutBuilderPanel'
import { MovementPanel } from '../features/MovementPanel'
import { OperationalOverviewPanel } from '../features/OperationalOverviewPanel'
import {
  REALISTIC_PANEL_ICON,
  REALISTIC_PANEL_LABEL,
  RealisticControlPanel,
  type RealisticPanel,
} from '../features/RealisticControlPanel'
import { SimulationPanel } from '../features/SimulationPanel'
import { TraceabilityPanel } from '../features/TraceabilityPanel'
import type { RoutePlan } from '../domain/routePlanning'
import { generateWarehouseSkeleton } from '../domain/warehouse'
import { WarehouseScene } from '../scene/WarehouseScene'
import {
  useDigitalTwinStore,
  type ActivePanel,
  type RenderMode,
} from '../store/digitalTwinStore'
import {
  resolveOperationalVehiclePoint,
  useOperationalVehicleStore,
} from '../store/operationalVehicleStore'
import { useRealisticExperienceStore } from '../store/realisticExperienceStore'
import './app.css'
import './panel-toggle.css'
import './unified-shell.css'

const PANEL_LABEL: Record<ActivePanel, string> = {
  overview: 'Visão geral',
  layout: 'Layout',
  trace: 'Rastreabilidade',
  movement: 'Movimentações',
  simulation: 'Simulação',
  import: 'Importar',
}

const PANEL_ICON: Record<ActivePanel, string> = {
  overview: '◫',
  layout: '⌗',
  trace: '◎',
  movement: '↔',
  simulation: '▶',
  import: '⇩',
}

const PANEL_PREFERENCE_KEY = 'cd-digital-3d-panel-collapsed'
const MENU_PREFERENCE_KEY = 'cd-digital-3d-menu-open'

function initialPanelCollapsed(): boolean {
  const saved = window.localStorage.getItem(PANEL_PREFERENCE_KEY)
  if (saved !== null) return saved === 'true'
  return window.matchMedia('(max-width: 700px)').matches
}

function initialMenuOpen(): boolean {
  const saved = window.localStorage.getItem(MENU_PREFERENCE_KEY)
  if (saved !== null) return saved === 'true'
  return window.matchMedia('(min-width: 981px)').matches
}

export default function App() {
  const state = useDigitalTwinStore()
  const vehicleAnchor = useOperationalVehicleStore((store) => store.anchor)
  const changeRealisticCamera = useRealisticExperienceStore(
    (store) => store.changeCameraMode,
  )
  const [panelCollapsed, setPanelCollapsed] = useState(initialPanelCollapsed)
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen)
  const [realisticPanel, setRealisticPanel] =
    useState<RealisticPanel>('operation')

  const skeleton = useMemo(
    () => generateWarehouseSkeleton(state.layout),
    [state.layout],
  )
  const selected = state.locations.find(
    (location) => location.address === state.selectedAddress,
  )
  const parkedVehiclePoint = useMemo(
    () =>
      resolveOperationalVehiclePoint(
        state.layout,
        state.locations,
        vehicleAnchor,
      ),
    [state.layout, state.locations, vehicleAnchor],
  )
  const parkedVehiclePlan = useMemo<RoutePlan>(
    () => ({
      mode: 'reference',
      addresses: [],
      points: [parkedVehiclePoint],
      distance: 0,
      baselineDistance: 0,
      savedDistance: 0,
      savedPercent: 0,
      createdAt: 'operational-vehicle-parked',
    }),
    [parkedVehiclePoint],
  )
  const sceneRoutePlan =
    state.renderMode === 'operational'
      ? (state.routePlan ?? parkedVehiclePlan)
      : null
  const activePanelLabel =
    state.renderMode === 'operational'
      ? PANEL_LABEL[state.activePanel]
      : REALISTIC_PANEL_LABEL[realisticPanel]

  useEffect(() => {
    window.localStorage.setItem(
      PANEL_PREFERENCE_KEY,
      String(panelCollapsed),
    )
  }, [panelCollapsed])

  useEffect(() => {
    window.localStorage.setItem(MENU_PREFERENCE_KEY, String(menuOpen))
  }, [menuOpen])

  function closeMenuOnCompactScreen() {
    if (window.matchMedia('(max-width: 980px)').matches) {
      setMenuOpen(false)
    }
  }

  function selectOperationalPanel(panel: ActivePanel) {
    if (state.activePanel === panel && !panelCollapsed) {
      setPanelCollapsed(true)
      closeMenuOnCompactScreen()
      return
    }

    state.setActivePanel(panel)
    setPanelCollapsed(false)
    closeMenuOnCompactScreen()
  }

  function selectRealisticPanel(panel: RealisticPanel) {
    if (realisticPanel === panel && !panelCollapsed) {
      setPanelCollapsed(true)
      closeMenuOnCompactScreen()
      return
    }

    setRealisticPanel(panel)
    setPanelCollapsed(false)
    closeMenuOnCompactScreen()
  }

  function switchMode(mode: RenderMode) {
    state.setRenderMode(mode)
    setPanelCollapsed(false)

    if (mode === 'realistic') {
      setRealisticPanel('operation')
    }
  }

  function openOverview() {
    state.setActivePanel('overview')
    setPanelCollapsed(false)
  }

  function resetVisibleCamera() {
    if (state.renderMode === 'realistic') {
      changeRealisticCamera('overview')
      return
    }

    state.resetCamera()
  }

  return (
    <main
      className={`digital-twin-app mode-${state.renderMode} ${
        panelCollapsed ? 'panel-is-collapsed' : 'panel-is-open'
      } ${menuOpen ? 'menu-is-open' : 'menu-is-closed'}`}
    >
      <section
        className="scene-layer"
        aria-label="Gêmeo digital 3D do centro de distribuição"
      >
        <WarehouseScene
          layout={state.layout}
          locations={state.locations}
          selectedAddress={state.selectedAddress}
          visibleStatuses={state.visibleStatuses}
          mode={state.renderMode}
          routePlan={sceneRoutePlan}
          routeRunToken={state.routeRunToken}
          cameraResetToken={state.cameraResetToken}
          onSelect={state.selectAddress}
        />
      </section>

      <button
        type="button"
        className="menu-trigger"
        aria-label={menuOpen ? 'Fechar menu principal' : 'Abrir menu principal'}
        aria-expanded={menuOpen}
        aria-controls="main-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>

      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">CD</div>
          <div>
            <strong>CD Digital 3D</strong>
            <span>
              {state.renderMode === 'operational'
                ? 'Layout, rastreabilidade e simulação operacional'
                : 'Recebimento vivo e evolução para fluxo ponta a ponta'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <span
            className={`source-badge ${
              state.renderMode === 'realistic'
                ? 'source-simulation'
                : `source-${state.dataSource}`
            }`}
          >
            {state.renderMode === 'realistic'
              ? 'Simulação isolada'
              : state.dataSource === 'demo'
                ? 'Dados demonstrativos'
                : state.dataSource === 'csv'
                  ? 'CSV importado'
                  : 'Layout configurado'}
          </span>
          <div className="mode-switch" aria-label="Modo de visualização">
            <button
              type="button"
              className={state.renderMode === 'operational' ? 'active' : ''}
              onClick={() => switchMode('operational')}
            >
              Operacional
            </button>
            <button
              type="button"
              className={state.renderMode === 'realistic' ? 'active' : ''}
              onClick={() => switchMode('realistic')}
            >
              Realista
            </button>
          </div>
          <button
            type="button"
            className="header-button"
            onClick={resetVisibleCamera}
          >
            Visão geral
          </button>
        </div>
      </header>

      <nav
        id="main-navigation"
        className="app-nav"
        aria-label={`Menu do modo ${
          state.renderMode === 'operational' ? 'operacional' : 'realista'
        }`}
      >
        <div className="menu-mode-summary">
          <span className="eyebrow">Modo atual</span>
          <strong>
            {state.renderMode === 'operational'
              ? 'Central operacional'
              : 'Operação realista'}
          </strong>
          <small>
            {state.renderMode === 'operational'
              ? 'Dados, estoque, layout e movimentações.'
              : 'Motor, câmeras, eventos e fluxo físico.'}
          </small>
        </div>

        <div className="menu-items">
          {state.renderMode === 'operational'
            ? (Object.keys(PANEL_LABEL) as ActivePanel[]).map((panel) => (
                <button
                  key={panel}
                  type="button"
                  className={state.activePanel === panel ? 'active' : ''}
                  aria-pressed={
                    state.activePanel === panel && !panelCollapsed
                  }
                  onClick={() => selectOperationalPanel(panel)}
                >
                  <span>{PANEL_ICON[panel]}</span>
                  <small>{PANEL_LABEL[panel]}</small>
                </button>
              ))
            : (Object.keys(REALISTIC_PANEL_LABEL) as RealisticPanel[]).map(
                (panel) => (
                  <button
                    key={panel}
                    type="button"
                    className={realisticPanel === panel ? 'active' : ''}
                    aria-pressed={
                      realisticPanel === panel && !panelCollapsed
                    }
                    onClick={() => selectRealisticPanel(panel)}
                  >
                    <span>{REALISTIC_PANEL_ICON[panel]}</span>
                    <small>{REALISTIC_PANEL_LABEL[panel]}</small>
                  </button>
                ),
              )}
        </div>
      </nav>

      <aside
        className={`workspace-panel ${panelCollapsed ? 'is-collapsed' : ''}`}
        aria-label={`${activePanelLabel} — painel de trabalho`}
      >
        <button
          type="button"
          className="panel-toggle"
          aria-expanded={!panelCollapsed}
          onClick={() => setPanelCollapsed((collapsed) => !collapsed)}
        >
          <span className="panel-toggle-icon" aria-hidden="true">
            {panelCollapsed ? '⌃' : '⌄'}
          </span>
          <span>{panelCollapsed ? 'Abrir painel' : 'Ocultar painel'}</span>
          <small>{activePanelLabel}</small>
        </button>

        <div className="workspace-panel-content" aria-hidden={panelCollapsed}>
          {state.renderMode === 'realistic' ? (
            <RealisticControlPanel section={realisticPanel} />
          ) : (
            <>
              {state.activePanel === 'overview' && (
                <OperationalOverviewPanel />
              )}
              {state.activePanel === 'layout' && (
                <LayoutBuilderPanel
                  layout={state.layout}
                  onApply={state.applyLayout}
                />
              )}
              {state.activePanel === 'trace' && (
                <TraceabilityPanel
                  locations={state.locations}
                  events={state.traceEvents}
                  query={state.traceQuery}
                  selectedAddress={state.selectedAddress}
                  onQuery={state.setTraceQuery}
                  onSelect={state.selectAddress}
                />
              )}
              {state.activePanel === 'movement' && (
                <MovementPanel
                  locations={state.locations}
                  selectedAddress={state.selectedAddress}
                  onMove={state.registerMovement}
                  onCount={state.recordPhysicalCount}
                />
              )}
              {state.activePanel === 'simulation' && (
                <SimulationPanel
                  layout={state.layout}
                  locations={state.locations}
                  selectedAddress={state.selectedAddress}
                  tasks={state.simulationTasks}
                  blocked={state.blockedCrossAisles}
                  routePlan={state.routePlan}
                  onAdd={state.addSimulationTask}
                  onRemove={state.removeSimulationTask}
                  onClear={state.clearSimulationTasks}
                  onBlocked={state.setCrossAisleBlocked}
                  onPlan={state.setRoutePlan}
                  onRun={state.runRouteAnimation}
                />
              )}
              {state.activePanel === 'import' && (
                <ImportPanel
                  skeleton={skeleton}
                  onImport={state.loadImportedWarehouse}
                  onRestore={state.restoreDemo}
                  dataSource={state.dataSource}
                  summary={state.importSummary}
                />
              )}
            </>
          )}
        </div>
      </aside>

      <div className="scene-instructions">
        {state.renderMode === 'operational'
          ? 'Arraste para girar · Botão direito para mover · Scroll para aproximar · Clique para consultar'
          : 'Recebimento automático · Abra o menu para controlar ritmo, câmera e eventos'}
      </div>
      <div className="truth-banner">
        <strong>
          {state.renderMode === 'realistic'
            ? 'Simulação de processo:'
            : state.dataSource === 'demo'
              ? 'Cenário sintético:'
              : 'Fonte dos dados:'}
        </strong>{' '}
        {state.renderMode === 'realistic'
          ? 'o motor decide estados e eventos; o 3D apenas representa a operação.'
          : state.dataSource === 'demo'
            ? 'usado para demonstrar regras e funções; não representa uma operação real.'
            : 'o 3D representa o estado informado. Confirmação física é registrada separadamente.'}
      </div>
      {state.renderMode === 'operational' && selected && (
        <button
          type="button"
          className="mobile-selected"
          onClick={openOverview}
        >
          {selected.address} · {selected.sku ?? 'vazio'}
        </button>
      )}
    </main>
  )
}
