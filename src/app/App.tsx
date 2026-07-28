import { useEffect, useMemo, useState } from 'react'
import { LayoutBuilderPanel } from '../features/LayoutBuilderPanel'
import { TraceabilityPanel } from '../features/TraceabilityPanel'
import { MovementPanel } from '../features/MovementPanel'
import { SimulationPanel } from '../features/SimulationPanel'
import { ImportPanel } from '../features/ImportPanel'
import { WarehouseScene } from '../scene/WarehouseScene'
import type { RoutePlan } from '../domain/routePlanning'
import {
  generateWarehouseSkeleton,
  summarizeWarehouse,
  SLOT_STATUS_LABEL,
  CONFIRMATION_LABEL,
  type SlotStatus,
} from '../domain/warehouse'
import { useDigitalTwinStore, type ActivePanel } from '../store/digitalTwinStore'
import {
  resolveOperationalVehiclePoint,
  useOperationalVehicleStore,
} from '../store/operationalVehicleStore'
import './app.css'
import './panel-toggle.css'

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

const STATUS_COLOR: Record<SlotStatus, string> = {
  occupied: '#38bdf8',
  empty: '#64748b',
  blocked: '#ef4444',
  divergent: '#f59e0b',
}

function OverviewPanel() {
  const layout = useDigitalTwinStore((state) => state.layout)
  const locations = useDigitalTwinStore((state) => state.locations)
  const selectedAddress = useDigitalTwinStore((state) => state.selectedAddress)
  const selectAddress = useDigitalTwinStore((state) => state.selectAddress)
  const visible = useDigitalTwinStore((state) => state.visibleStatuses)
  const toggleStatus = useDigitalTwinStore((state) => state.toggleStatus)
  const setActivePanel = useDigitalTwinStore((state) => state.setActivePanel)
  const addTask = useDigitalTwinStore((state) => state.addSimulationTask)
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState('')
  const [navAisle, setNavAisle] = useState(layout.rackRows[0]?.aisle ?? 'A')
  const [navPosition, setNavPosition] = useState('01')
  const [navLevel, setNavLevel] = useState('01')
  const summary = useMemo(() => summarizeWarehouse(locations), [locations])
  const selected = locations.find((location) => location.address === selectedAddress)

  function locate() {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')

    if (!normalized) {
      setFeedback('Digite um endereço, SKU, lote, produto ou pallet.')
      return
    }

    const match = locations.find((location) =>
      [
        location.address,
        location.sku,
        location.description,
        location.lot,
        location.handlingUnitCode,
      ]
        .filter(Boolean)
        .some((value) =>
          value!.toLocaleLowerCase('pt-BR').includes(normalized),
        ),
    )

    if (!match) {
      setFeedback('Nenhum registro localizado.')
      return
    }

    selectAddress(match.address)
    setFeedback(`Localizado em ${match.address}.`)
  }

  return (
    <section className="panel-section overview-panel">
      <span className="eyebrow">Resumo operacional</span>
      <div className="summary-grid">
        <div>
          <span>Endereços</span>
          <strong>{summary.total.toLocaleString('pt-BR')}</strong>
        </div>
        <div>
          <span>Ocupação</span>
          <strong>{summary.occupancyRate.toLocaleString('pt-BR')}%</strong>
        </div>
        <div>
          <span>Vazios</span>
          <strong>{summary.empty.toLocaleString('pt-BR')}</strong>
        </div>
        <div>
          <span>Divergências</span>
          <strong>{summary.divergent.toLocaleString('pt-BR')}</strong>
        </div>
        <div>
          <span>Confirmados</span>
          <strong>{summary.confirmed.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      <div className="quick-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') locate()
          }}
          placeholder="Localizar endereço, SKU, lote ou pallet"
        />
        <button type="button" onClick={locate}>
          Localizar
        </button>
      </div>
      {feedback && <small className="inline-feedback">{feedback}</small>}

      <div className="address-navigator">
        <label>
          <span>Rua</span>
          <select
            value={navAisle}
            onChange={(event) => setNavAisle(event.target.value)}
          >
            {layout.rackRows
              .filter((row) => row.active)
              .map((row) => (
                <option key={row.id} value={row.aisle}>
                  {row.aisle}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Posição</span>
          <select
            value={navPosition}
            onChange={(event) => setNavPosition(event.target.value)}
          >
            {Array.from(
              {
                length:
                  (layout.rackRows.find((row) => row.aisle === navAisle)
                    ?.baysPerSide ?? 1) * 2,
              },
              (_, index) => String(index + 1).padStart(2, '0'),
            ).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Nível</span>
          <select
            value={navLevel}
            onChange={(event) => setNavLevel(event.target.value)}
          >
            {Array.from(
              {
                length:
                  layout.rackRows.find((row) => row.aisle === navAisle)
                    ?.levels ?? 1,
              },
              (_, index) => String(index + 1).padStart(2, '0'),
            ).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            const address = `${navAisle}-${navPosition}-${navLevel}`
            selectAddress(address)
            setFeedback(`Localizado: ${address}.`)
          }}
        >
          Ir
        </button>
      </div>

      <div className="status-filters">
        <span>Exibir no 3D</span>
        <div>
          {(Object.keys(visible) as SlotStatus[]).map((status) => (
            <button
              type="button"
              key={status}
              className={visible[status] ? 'active' : ''}
              onClick={() => toggleStatus(status)}
            >
              <i style={{ background: STATUS_COLOR[status] }} />
              {SLOT_STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <article className="selected-card">
          <div className="selected-heading">
            <div>
              <span className="eyebrow">Posição selecionada</span>
              <h2>{selected.address}</h2>
            </div>
            <span className={`status-pill ${selected.status}`}>
              {SLOT_STATUS_LABEL[selected.status]}
            </span>
          </div>
          <p>{selected.description ?? 'Sem produto informado'}</p>
          <dl className="data-grid">
            <div>
              <dt>Rua</dt>
              <dd>{selected.aisle}</dd>
            </div>
            <div>
              <dt>Nível</dt>
              <dd>{selected.level}</dd>
            </div>
            <div>
              <dt>SKU</dt>
              <dd>{selected.sku ?? '—'}</dd>
            </div>
            <div>
              <dt>Lote</dt>
              <dd>{selected.lot ?? '—'}</dd>
            </div>
            <div>
              <dt>Pallet/UL</dt>
              <dd>{selected.handlingUnitCode ?? '—'}</dd>
            </div>
            <div>
              <dt>Quantidade</dt>
              <dd>{selected.quantity}</dd>
            </div>
            <div className="wide">
              <dt>Confirmação</dt>
              <dd>{CONFIRMATION_LABEL[selected.confirmation]}</dd>
            </div>
          </dl>
          <div className="action-stack">
            <button
              type="button"
              className="primary"
              onClick={() => setActivePanel('trace')}
            >
              Abrir rastreabilidade
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setActivePanel('movement')}
            >
              Registrar movimentação
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const result = addTask(selected.address)
                setFeedback(result.message)
                setActivePanel('simulation')
              }}
            >
              Adicionar à simulação
            </button>
          </div>
        </article>
      ) : (
        <div className="empty-state-box">
          <strong>Selecione uma posição</strong>
          <p>Clique no CD ou utilize a busca para consultar estoque e histórico.</p>
        </div>
      )}
    </section>
  )
}

const PANEL_PREFERENCE_KEY = 'cd-digital-3d-panel-collapsed'

function initialPanelCollapsed(): boolean {
  const saved = window.localStorage.getItem(PANEL_PREFERENCE_KEY)
  if (saved !== null) return saved === 'true'
  return window.matchMedia('(max-width: 700px)').matches
}

export default function App() {
  const state = useDigitalTwinStore()
  const vehicleAnchor = useOperationalVehicleStore((store) => store.anchor)
  const [panelCollapsed, setPanelCollapsed] = useState(initialPanelCollapsed)
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
    state.routePlan ??
    (state.renderMode === 'operational' ? parkedVehiclePlan : null)

  useEffect(() => {
    window.localStorage.setItem(
      PANEL_PREFERENCE_KEY,
      String(panelCollapsed),
    )
  }, [panelCollapsed])

  function selectPanel(panel: ActivePanel) {
    if (state.activePanel === panel) {
      setPanelCollapsed((collapsed) => !collapsed)
      return
    }

    state.setActivePanel(panel)
    setPanelCollapsed(false)
  }

  function openOverview() {
    state.setActivePanel('overview')
    setPanelCollapsed(false)
  }

  return (
    <main
      className={`digital-twin-app mode-${state.renderMode} ${
        panelCollapsed ? 'panel-is-collapsed' : 'panel-is-open'
      }`}
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

      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">CD</div>
          <div>
            <strong>CD Digital 3D</strong>
            <span>Layout, rastreabilidade e simulação operacional</span>
          </div>
        </div>
        <div className="header-actions">
          <span className={`source-badge source-${state.dataSource}`}>
            {state.dataSource === 'demo'
              ? 'Dados demonstrativos'
              : state.dataSource === 'csv'
                ? 'CSV importado'
                : 'Layout configurado'}
          </span>
          <div className="mode-switch">
            <button
              type="button"
              className={state.renderMode === 'operational' ? 'active' : ''}
              onClick={() => state.setRenderMode('operational')}
            >
              Operacional
            </button>
            <button
              type="button"
              className={state.renderMode === 'realistic' ? 'active' : ''}
              onClick={() => state.setRenderMode('realistic')}
            >
              Realista
            </button>
          </div>
          <button type="button" className="header-button" onClick={state.resetCamera}>
            Visão geral
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Módulos do sistema">
        {(Object.keys(PANEL_LABEL) as ActivePanel[]).map((panel) => (
          <button
            key={panel}
            type="button"
            className={state.activePanel === panel ? 'active' : ''}
            aria-pressed={state.activePanel === panel && !panelCollapsed}
            onClick={() => selectPanel(panel)}
          >
            <span>{PANEL_ICON[panel]}</span>
            <small>{PANEL_LABEL[panel]}</small>
          </button>
        ))}
      </nav>

      <aside
        className={`workspace-panel ${panelCollapsed ? 'is-collapsed' : ''}`}
        aria-label={`${PANEL_LABEL[state.activePanel]} — painel de trabalho`}
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
          <small>{PANEL_LABEL[state.activePanel]}</small>
        </button>

        <div className="workspace-panel-content" aria-hidden={panelCollapsed}>
          {state.activePanel === 'overview' && <OverviewPanel />}
          {state.activePanel === 'layout' && (
            <LayoutBuilderPanel layout={state.layout} onApply={state.applyLayout} />
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
        </div>
      </aside>

      <div className="scene-instructions">
        Arraste para girar · Botão direito para mover · Scroll para aproximar ·
        Clique para consultar
      </div>
      <div className="truth-banner">
        <strong>
          {state.dataSource === 'demo' ? 'Cenário sintético:' : 'Fonte dos dados:'}
        </strong>{' '}
        {state.dataSource === 'demo'
          ? 'usado para demonstrar regras e funções; não representa uma operação real.'
          : 'o 3D representa o estado informado. Confirmação física é registrada separadamente.'}
      </div>
      {selected && (
        <button type="button" className="mobile-selected" onClick={openOverview}>
          {selected.address} · {selected.sku ?? 'vazio'}
        </button>
      )}
    </main>
  )
}
