import { useMemo, useState } from 'react'
import { SCENARIO_PROFILES, type OperationScenario } from '../domain/operationsControl'
import { useOperationsControlStore } from '../store/operationsControlStore'
import './realistic-operations-menu.css'

type RealisticPanel = 'flow' | 'fleet' | 'inventory' | 'safety'

const PANEL_LABEL: Record<RealisticPanel, string> = {
  flow: 'Fluxo ao vivo',
  fleet: 'Frota e ruas',
  inventory: 'Estoque e pedidos',
  safety: 'Segurança',
}

const PANEL_ICON: Record<RealisticPanel, string> = {
  flow: '▶',
  fleet: '▣',
  inventory: '▦',
  safety: '◉',
}

const ROLE_LABEL: Record<string, string> = {
  'inbound-transfer': 'Recebimento e distribuição',
  putaway: 'Armazenagem na rua',
  replenishment: 'Retirada interna / pré-embarque',
  shipping: 'Carregamento do caminhão',
}

const VEHICLE_STATUS: Record<string, string> = {
  idle: 'Aguardando tarefa',
  working: 'Em operação',
  braking: 'Parada de segurança',
  fault: 'Avariado',
  unavailable: 'Indisponível',
}

function FlowPanel() {
  const missions = useOperationsControlStore((state) => state.missions)
  const events = useOperationsControlStore((state) => state.events)
  const truck = useOperationsControlStore((state) => state.truck)
  const active = missions
    .filter((mission) => mission.status !== 'completed')
    .sort((left, right) => {
      const leftWeight = left.status === 'running' ? 0 : 1
      const rightWeight = right.status === 'running' ? 0 : 1
      return leftWeight - rightWeight || right.createdAt - left.createdAt
    })
    .slice(0, 8)

  return (
    <div className="realistic-panel-body">
      <section className="realistic-now-card">
        <span>Estado da doca</span>
        <strong>
          {truck.phase === 'docked'
            ? `Caminhão ${truck.cycle} na doca`
            : truck.phase === 'closing'
              ? 'Fechando a carga'
              : truck.phase === 'departing'
                ? 'Caminhão saindo'
                : truck.phase === 'away'
                  ? 'Doca aguardando próximo caminhão'
                  : 'Próximo caminhão se aproximando'}
        </strong>
        <small>
          {truck.loadPalletIds.length} pallets · {truck.loadedUnits} unidades
        </small>
      </section>

      <section className="realistic-section">
        <header>
          <strong>O que está acontecendo agora</strong>
          <span>{active.length} etapas visíveis</span>
        </header>
        <div className="realistic-list">
          {active.length === 0 ? (
            <p>Nenhuma etapa ativa neste instante.</p>
          ) : (
            active.map((mission) => (
              <article key={mission.id} className={`mission-${mission.status}`}>
                <div>
                  <strong>{mission.palletId}</strong>
                  <span>{mission.status === 'running' ? 'Em execução' : 'Na fila'}</span>
                </div>
                <small>
                  {ROLE_LABEL[mission.role] ?? mission.role}: {mission.sourceLabel} →{' '}
                  {mission.destinationLabel}
                </small>
                {mission.vehicleId && <em>Equipamento: {mission.vehicleId}</em>}
              </article>
            ))
          )}
        </div>
      </section>

      <section className="realistic-section">
        <header>
          <strong>Últimos eventos</strong>
          <span>sessão atual</span>
        </header>
        <div className="realistic-event-list">
          {events.slice(0, 6).map((event) => (
            <article key={event.id}>
              <time>
                {new Date(event.at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
              <div>
                <strong>{event.title}</strong>
                <small>{event.detail}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function FleetPanel() {
  const vehicles = useOperationsControlStore((state) => state.vehicles)
  const list = Object.values(vehicles).sort((left, right) => left.id.localeCompare(right.id))

  return (
    <div className="realistic-panel-body">
      <p className="realistic-explanation">
        Cada equipamento possui função definida. As empilhadeiras EMP atendem apenas as
        ruas indicadas no próprio código do veículo.
      </p>
      <div className="realistic-list">
        {list.map((vehicle) => (
          <article key={vehicle.id} className={`vehicle-${vehicle.status}`}>
            <div>
              <strong>{vehicle.id}</strong>
              <span>{VEHICLE_STATUS[vehicle.status] ?? vehicle.status}</span>
            </div>
            <small>{vehicle.label}</small>
            {vehicle.decisionReason && <em>{vehicle.decisionReason}</em>}
          </article>
        ))}
      </div>
      <div className="realistic-flow-map">
        <strong>Responsabilidades</strong>
        <span>RX-REC → descarrega o recebimento</span>
        <span>TP-IN → leva o pallet até o buffer da rua</span>
        <span>EMP-AB / EMP-CD / EMP-EF → armazenam e retiram nas próprias ruas</span>
        <span>RX-LOAD → carrega somente o caminhão da expedição</span>
      </div>
    </div>
  )
}

function InventoryPanel() {
  const pallets = useOperationsControlStore((state) => state.pallets)
  const orders = useOperationsControlStore((state) => state.orders)
  const metrics = useOperationsControlStore((state) => state.metrics)
  const palletList = Object.values(pallets)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 10)
  const activeOrders = orders.filter((order) => order.status !== 'shipped').slice(0, 8)

  return (
    <div className="realistic-panel-body">
      <div className="realistic-metrics">
        <div><span>Recebidos</span><strong>{metrics.receivedPallets}</strong></div>
        <div><span>Armazenados</span><strong>{metrics.storedPallets}</strong></div>
        <div><span>Expedidos</span><strong>{metrics.shippedPallets}</strong></div>
        <div><span>Pedidos abertos</span><strong>{metrics.openOrders}</strong></div>
      </div>

      <section className="realistic-section">
        <header><strong>Pallets acompanhados</strong><span>{Object.keys(pallets).length}</span></header>
        <div className="realistic-list compact-list">
          {palletList.map((pallet) => (
            <article key={pallet.id}>
              <div><strong>{pallet.id}</strong><span>{pallet.zone}</span></div>
              <small>SKU {pallet.sku} · {pallet.units}/{pallet.capacity} un.</small>
            </article>
          ))}
        </div>
      </section>

      <section className="realistic-section">
        <header><strong>Pedidos automáticos</strong><span>{activeOrders.length}</span></header>
        <div className="realistic-list compact-list">
          {activeOrders.map((order) => (
            <article key={order.id}>
              <div><strong>{order.id}</strong><span>{order.status}</span></div>
              <small>{order.quantity} un. · SKU {order.sku} · {order.palletId}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function SafetyPanel() {
  const scenario = useOperationsControlStore((state) => state.scenario)
  const setScenario = useOperationsControlStore((state) => state.setScenario)
  const triggerSafety = useOperationsControlStore((state) => state.triggerSafety)

  return (
    <div className="realistic-panel-body">
      <label className="realistic-scenario">
        <span>Cenário operacional</span>
        <select
          value={scenario}
          onChange={(event) => setScenario(event.target.value as OperationScenario)}
        >
          {Object.values(SCENARIO_PROFILES).map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.label}</option>
          ))}
        </select>
        <small>{SCENARIO_PROFILES[scenario].description}</small>
      </label>

      <section className="realistic-section">
        <header><strong>Testes controlados</strong><span>somente por comando</span></header>
        <div className="realistic-safety-buttons">
          <button type="button" onClick={() => triggerSafety('pedestrian')}>Travessia na faixa</button>
          <button type="button" onClick={() => triggerSafety('obstacle')}>Bloquear corredor</button>
          <button type="button" onClick={() => triggerSafety('failure')}>Simular avaria</button>
        </div>
      </section>

      <div className="realistic-flow-map">
        <strong>Regra humana</strong>
        <span>Conferente permanece na área de recebimento.</span>
        <span>Auxiliar permanece no pré-embarque.</span>
        <span>A travessia ocorre apenas na faixa e mediante comando do cenário.</span>
      </div>
    </div>
  )
}

export function RealisticOperationsMenu() {
  const [activePanel, setActivePanel] = useState<RealisticPanel>('flow')
  const [open, setOpen] = useState(true)
  const metrics = useOperationsControlStore((state) => state.metrics)
  const summary = useMemo(
    () => `${metrics.workingVehicles} operando · ${metrics.activeMissions} missões`,
    [metrics.activeMissions, metrics.workingVehicles],
  )

  return (
    <div className={`realistic-operations-ui ${open ? 'is-open' : 'is-closed'}`}>
      <nav className="realistic-mode-nav" aria-label="Módulos do modo realista">
        {(Object.keys(PANEL_LABEL) as RealisticPanel[]).map((panel) => (
          <button
            key={panel}
            type="button"
            className={activePanel === panel && open ? 'active' : ''}
            onClick={() => {
              setActivePanel(panel)
              setOpen(true)
            }}
          >
            <span>{PANEL_ICON[panel]}</span>
            <small>{PANEL_LABEL[panel]}</small>
          </button>
        ))}
      </nav>

      <aside className="realistic-workspace" aria-label={PANEL_LABEL[activePanel]}>
        <button type="button" className="realistic-workspace-toggle" onClick={() => setOpen((value) => !value)}>
          <span>{open ? 'Fechar visão realista' : 'Abrir visão realista'}</span>
          <small>{open ? summary : PANEL_LABEL[activePanel]}</small>
        </button>
        {open && (
          <div className="realistic-workspace-content">
            <header className="realistic-workspace-heading">
              <span>Operação física simulada</span>
              <h2>{PANEL_LABEL[activePanel]}</h2>
            </header>
            {activePanel === 'flow' && <FlowPanel />}
            {activePanel === 'fleet' && <FleetPanel />}
            {activePanel === 'inventory' && <InventoryPanel />}
            {activePanel === 'safety' && <SafetyPanel />}
            <p className="realistic-disclaimer">
              Simulação demonstrativa. Não altera o estoque oficial nem substitui controle industrial certificado.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
