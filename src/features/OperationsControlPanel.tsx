import { useEffect } from 'react'
import {
  SCENARIO_PROFILES,
  type OperationMissionStatus,
  type OperationOrderStatus,
  type OperationScenario,
  type OperationVehicleStatus,
  type OperationZone,
  type TruckCyclePhase,
} from '../domain/operationsControl'
import {
  syncUnavailableVehicles,
  useOperationsControlStore,
} from '../store/operationsControlStore'
import './operations-control.css'

const VEHICLE_STATUS_LABEL: Record<OperationVehicleStatus, string> = {
  idle: 'Ocioso',
  working: 'Em operação',
  braking: 'Parada de segurança',
  fault: 'Avariado',
  unavailable: 'Indisponível',
}

const ORDER_STATUS_LABEL: Record<OperationOrderStatus, string> = {
  waiting: 'Aguardando',
  assigned: 'Designado',
  loading: 'Carregando',
  shipped: 'Expedido',
}

const MISSION_STATUS_LABEL: Record<OperationMissionStatus, string> = {
  queued: 'Na fila',
  running: 'Em execução',
  completed: 'Concluída',
  waiting: 'Aguardando',
}

const ZONE_LABEL: Record<OperationZone, string> = {
  receiving: 'Recebimento',
  staging: 'Espera',
  reserve: 'Reserva',
  picking: 'Picking',
  truck: 'Caminhão',
  transit: 'Em trânsito',
  shipped: 'Expedido',
}

const TRUCK_PHASE_LABEL: Record<TruckCyclePhase, string> = {
  approaching: 'Chegando à doca',
  docked: 'Na doca',
  closing: 'Fechando carga',
  departing: 'Saindo do CD',
  away: 'Em trânsito externo',
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="operations-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

export function OperationsControlPanel() {
  const scenario = useOperationsControlStore((state) => state.scenario)
  const collapsed = useOperationsControlStore((state) => state.collapsed)
  const metrics = useOperationsControlStore((state) => state.metrics)
  const pallets = useOperationsControlStore((state) => state.pallets)
  const orders = useOperationsControlStore((state) => state.orders)
  const missions = useOperationsControlStore((state) => state.missions)
  const vehicles = useOperationsControlStore((state) => state.vehicles)
  const events = useOperationsControlStore((state) => state.events)
  const truck = useOperationsControlStore((state) => state.truck)
  const setScenario = useOperationsControlStore((state) => state.setScenario)
  const toggleCollapsed = useOperationsControlStore((state) => state.toggleCollapsed)
  const triggerSafety = useOperationsControlStore((state) => state.triggerSafety)

  useEffect(() => {
    syncUnavailableVehicles()
  }, [scenario])

  const vehicleList = Object.values(vehicles).sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  const palletList = Object.values(pallets)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 5)
  const activeOrders = orders
    .filter((order) => order.status !== 'shipped')
    .slice(0, 5)
  const activeMissions = missions
    .filter((mission) => mission.status !== 'completed')
    .slice(0, 6)

  return (
    <aside className={`operations-control ${collapsed ? 'is-collapsed' : ''}`}>
      <button
        type="button"
        className="operations-control-toggle"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
      >
        <span>Central operacional</span>
        <strong>{collapsed ? 'Abrir' : 'Ocultar'}</strong>
      </button>

      {!collapsed && (
        <div className="operations-control-body">
          <header className="operations-control-heading">
            <div>
              <span className="eyebrow">Modo demonstrativo vivo</span>
              <h2>Controle da operação</h2>
            </div>
            <span className={`truck-phase phase-${truck.phase}`}>
              {TRUCK_PHASE_LABEL[truck.phase]}
            </span>
          </header>

          <label className="operations-scenario-field">
            <span>Cenário operacional</span>
            <select
              value={scenario}
              onChange={(event) =>
                setScenario(event.target.value as OperationScenario)
              }
            >
              {Object.values(SCENARIO_PROFILES).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <small>{SCENARIO_PROFILES[scenario].description}</small>
          </label>

          <div className="operations-metrics-grid">
            <Metric
              label="Pedidos abertos"
              value={metrics.openOrders.toLocaleString('pt-BR')}
              detail={`${metrics.ordersCreated.toLocaleString('pt-BR')} criados`}
            />
            <Metric
              label="Missões ativas"
              value={metrics.activeMissions.toLocaleString('pt-BR')}
              detail={`${metrics.missionsCompleted.toLocaleString('pt-BR')} concluídas`}
            />
            <Metric
              label="Reserva monitorada"
              value={`${metrics.reserveUnits.toLocaleString('pt-BR')} un.`}
              detail={`${metrics.storedPallets.toLocaleString('pt-BR')} armazenagens`}
            />
            <Metric
              label="Picking monitorado"
              value={`${metrics.pickingUnits.toLocaleString('pt-BR')} un.`}
            />
            <Metric
              label="Carga atual"
              value={`${metrics.truckUnits.toLocaleString('pt-BR')} un.`}
              detail={`Caminhão ${truck.cycle}`}
            />
            <Metric
              label="Expedido"
              value={`${metrics.shippedUnits.toLocaleString('pt-BR')} un.`}
              detail={`${metrics.shippedPallets.toLocaleString('pt-BR')} pallets`}
            />
            <Metric
              label="Frota trabalhando"
              value={metrics.workingVehicles.toLocaleString('pt-BR')}
              detail={`${metrics.idleVehicles.toLocaleString('pt-BR')} ociosos`}
            />
            <Metric
              label="Eventos de segurança"
              value={metrics.safetyStops.toLocaleString('pt-BR')}
              detail={`${metrics.vehicleFaults.toLocaleString('pt-BR')} avarias`}
            />
          </div>

          <div className="operations-safety-actions">
            <span>Testar segurança</span>
            <div>
              <button type="button" onClick={() => triggerSafety('pedestrian')}>
                Pedestre
              </button>
              <button type="button" onClick={() => triggerSafety('obstacle')}>
                Obstáculo
              </button>
              <button type="button" onClick={() => triggerSafety('failure')}>
                Avaria
              </button>
            </div>
          </div>

          <section className="operations-control-section">
            <div className="operations-section-heading">
              <strong>Frota</strong>
              <span>{vehicleList.length} equipamentos</span>
            </div>
            <div className="operations-vehicle-list">
              {vehicleList.length === 0 ? (
                <p className="operations-empty">Aguardando montagem da frota.</p>
              ) : (
                vehicleList.map((vehicle) => (
                  <article
                    key={vehicle.id}
                    className={`vehicle-row status-${vehicle.status}`}
                  >
                    <div>
                      <strong>{vehicle.id}</strong>
                      <span>{VEHICLE_STATUS_LABEL[vehicle.status]}</span>
                    </div>
                    <small>
                      {vehicle.decisionReason ??
                        (vehicle.currentMissionId
                          ? `Executando ${vehicle.currentMissionId}`
                          : vehicle.label)}
                    </small>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="operations-control-section">
            <div className="operations-section-heading">
              <strong>Inventário monitorado</strong>
              <span>{Object.keys(pallets).length} pallets</span>
            </div>
            <div className="operations-queue">
              {palletList.length === 0 ? (
                <p className="operations-empty">Aguardando a primeira unidade logística.</p>
              ) : (
                palletList.map((pallet) => (
                  <article key={pallet.id}>
                    <div>
                      <strong>{pallet.id}</strong>
                      <span>{ZONE_LABEL[pallet.zone]}</span>
                    </div>
                    <small>
                      SKU {pallet.sku} · {pallet.units}/{pallet.capacity} un. · ponto de
                      reposição {pallet.reorderPoint}
                    </small>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="operations-control-section">
            <div className="operations-section-heading">
              <strong>Pedidos automáticos</strong>
              <span>{activeOrders.length} visíveis</span>
            </div>
            <div className="operations-queue">
              {activeOrders.length === 0 ? (
                <p className="operations-empty">O cérebro ainda não criou pedidos.</p>
              ) : (
                activeOrders.map((order) => (
                  <article key={order.id}>
                    <div>
                      <strong>{order.id}</strong>
                      <span>{ORDER_STATUS_LABEL[order.status]}</span>
                    </div>
                    <small>
                      {order.quantity} un. · SKU {order.sku} · {order.palletId}
                    </small>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="operations-control-section">
            <div className="operations-section-heading">
              <strong>Fila de missões</strong>
              <span>{activeMissions.length} visíveis</span>
            </div>
            <div className="operations-queue">
              {activeMissions.length === 0 ? (
                <p className="operations-empty">Nenhuma missão aguardando.</p>
              ) : (
                activeMissions.map((mission) => (
                  <article key={mission.id}>
                    <div>
                      <strong>{mission.palletId}</strong>
                      <span>{MISSION_STATUS_LABEL[mission.status]}</span>
                    </div>
                    <small>
                      {mission.sourceLabel} → {mission.destinationLabel}
                    </small>
                    {mission.decisionReason && <em>{mission.decisionReason}</em>}
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="operations-control-section event-section">
            <div className="operations-section-heading">
              <strong>Eventos recentes</strong>
              <span>sessão atual</span>
            </div>
            <div className="operations-event-list">
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

          <p className="operations-disclaimer">
            Quantidades limitadas aos pallets acompanhados pela operação automática.
            Não altera o estoque oficial nem confirma movimentação física.
          </p>
        </div>
      )}
    </aside>
  )
}
