import type { KernelEvent } from '../realistic/core/livingWorldKernel'
import {
  useRealisticExperienceStore,
  type RealisticCameraMode,
} from '../store/realisticExperienceStore'

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

const SPEEDS = [1, 2, 4, 8] as const

const CAMERA_LABELS: Record<RealisticCameraMode, string> = {
  cinematic: 'Cinema',
  overview: 'Visão geral',
  follow: 'Seguir RX20',
  dock: 'Doca inbound',
}

function eventLabel(event: KernelEvent): string {
  const payload = event.payload ?? {}

  if (event.type === 'pallet.picked') {
    return `Coleta · ${String(payload.palletId ?? 'pallet')}`
  }
  if (event.type === 'pallet.staged') {
    return `Staging · posição D${Number(payload.stagedSlot ?? 0) + 1}`
  }
  if (event.type === 'truck.receiving.completed') {
    return `Caminhão ${String(payload.completedBatch ?? '')} concluído`
  }
  if (event.type === 'truck.phase.changed') {
    return `Caminhão · ${String(payload.to ?? 'movimento')}`
  }
  if (event.type === 'receiving.batch.started') {
    return `Novo lote ${String(payload.batch ?? '')}`
  }
  if (event.type === 'safety.fault.activated') {
    return `Segurança · ${String(payload.reason ?? 'parada')}`
  }
  if (event.type === 'receiving.transition') {
    return String(payload.label ?? 'Transição operacional')
  }

  return event.type.replaceAll('.', ' · ')
}

function OperationPanel() {
  const connected = useRealisticExperienceStore((store) => store.connected)
  const state = useRealisticExperienceStore((store) => store.state)
  const telemetry = useRealisticExperienceStore((store) => store.telemetry)
  const timeScale = useRealisticExperienceStore((store) => store.timeScale)
  const paused = useRealisticExperienceStore((store) => store.paused)
  const changeTimeScale = useRealisticExperienceStore(
    (store) => store.changeTimeScale,
  )
  const togglePause = useRealisticExperienceStore((store) => store.togglePause)
  const stepOnce = useRealisticExperienceStore((store) => store.stepOnce)
  const reset = useRealisticExperienceStore((store) => store.reset)

  const staged =
    state?.pallets.filter((pallet) => pallet.phase === 'staged').length ?? 0
  const inTruck =
    state?.pallets.filter((pallet) => pallet.phase === 'truck').length ?? 0
  const carried =
    state?.pallets.filter((pallet) => pallet.phase === 'carried').length ?? 0
  const completedCurrent = Math.max(0, 6 - inTruck - carried)
  const progress = Math.min(100, (completedCurrent / 6) * 100)

  return (
    <section className="panel-section realistic-panel-section">
      <div className="realistic-panel-heading">
        <div>
          <span className="eyebrow">Gêmeo digital operacional</span>
          <h2>Recebimento em execução</h2>
        </div>
        <span
          className={`runtime-badge ${
            state?.fault ? 'fault' : paused ? 'paused' : connected ? 'live' : 'offline'
          }`}
        >
          {state?.fault
            ? 'Falha segura'
            : paused
              ? 'Pausado'
              : connected
                ? 'Motor ativo'
                : 'Conectando'}
        </span>
      </div>

      <p className="realistic-status-label">
        {state?.label ?? 'Inicializando célula de recebimento…'}
      </p>

      <div className="realistic-progress-heading">
        <span>Caminhão atual</span>
        <strong>{completedCurrent}/6 pallets</strong>
      </div>
      <div className="realistic-progress-track">
        <i style={{ width: `${progress}%` }} />
      </div>

      <div className="realistic-metrics-grid">
        <div>
          <span>Lote</span>
          <strong>{String(state?.batch ?? 0).padStart(3, '0')}</strong>
        </div>
        <div>
          <span>Staging In</span>
          <strong>{staged}</strong>
        </div>
        <div>
          <span>Caminhões</span>
          <strong>{state?.completedTrucks ?? 0}</strong>
        </div>
        <div>
          <span>Tempo simulado</span>
          <strong>{telemetry?.time.toFixed(1) ?? '0.0'}s</strong>
        </div>
        <div>
          <span>RX20</span>
          <strong>{state?.forklift.phase ?? 'aguardando'}</strong>
        </div>
        <div>
          <span>Velocidade</span>
          <strong>{state?.forklift.speed.toFixed(1) ?? '0.0'} m/s</strong>
        </div>
      </div>

      <div className="realistic-control-group">
        <span>Velocidade da simulação</span>
        <div className="realistic-button-row">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={timeScale === speed ? 'active' : ''}
              onClick={() => changeTimeScale(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div className="realistic-action-grid">
        <button type="button" className="primary" onClick={togglePause}>
          {paused ? 'Continuar operação' : 'Pausar operação'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!paused}
          onClick={stepOnce}
        >
          Avançar 1 tick
        </button>
        <button type="button" className="secondary" onClick={reset}>
          Reiniciar recebimento
        </button>
      </div>

      <div className="truth-box realistic-truth-box">
        <strong>Separação segura de dados</strong>
        <p>
          O estoque do modo operacional não é alterado por esta animação. O
          cenário realista usa inventário demonstrativo e eventos próprios.
        </p>
      </div>
    </section>
  )
}

function FlowPanel() {
  const state = useRealisticExperienceStore((store) => store.state)
  const staged =
    state?.pallets.filter((pallet) => pallet.phase === 'staged').length ?? 0

  const stages = [
    {
      id: 'inbound',
      title: 'Doca Inbound',
      detail: 'Atracamento, descarga e conferência do caminhão.',
      status: state ? 'active' : 'waiting',
      badge: state ? 'Em execução' : 'Aguardando motor',
    },
    {
      id: 'staging-in',
      title: 'Staging de Recebimento',
      detail: `${staged} pallet(s) descarregado(s), identificados e posicionados.`,
      status: staged > 0 ? 'active' : 'waiting',
      badge: staged > 0 ? 'Recebendo' : 'Aguardando pallets',
    },
    {
      id: 'putaway',
      title: 'Putaway / Endereçamento',
      detail: 'Próximo motor: tarefa, reserva de destino e deslocamento até a rua.',
      status: staged > 0 ? 'ready' : 'planned',
      badge: staged > 0 ? 'Pronto para integrar' : 'Próxima fase',
    },
    {
      id: 'storage',
      title: 'Armazenagem N1+',
      detail: 'Elevação, posicionamento XYZ e confirmação no porta-paletes.',
      status: 'planned',
      badge: 'Planejado',
    },
    {
      id: 'picking',
      title: 'Picking / Reposição N0',
      detail: 'Convocação, separação e transferência para consolidação.',
      status: 'planned',
      badge: 'Planejado',
    },
    {
      id: 'outbound',
      title: 'Staging Out + Doca Outbound',
      detail: 'Pré-embarque, carregamento e liberação do veículo de saída.',
      status: 'planned',
      badge: 'Planejado',
    },
  ] as const

  return (
    <section className="panel-section realistic-panel-section">
      <span className="eyebrow">Fluxo físico ponta a ponta</span>
      <h2>Arquitetura da operação</h2>
      <p className="muted">
        O recebimento já roda no kernel determinístico. As próximas células
        serão ligadas pela mesma cadeia de tarefas, recursos e reservas.
      </p>

      <div className="realistic-flow-list">
        {stages.map((stage, index) => (
          <article key={stage.id} className={`flow-stage ${stage.status}`}>
            <span className="flow-stage-index">{index + 1}</span>
            <div>
              <div className="flow-stage-heading">
                <strong>{stage.title}</strong>
                <small>{stage.badge}</small>
              </div>
              <p>{stage.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="realistic-spec-grid">
        <div>
          <span>Palete padrão</span>
          <strong>PBR 1200 × 1000 mm</strong>
        </div>
        <div>
          <span>Corredores AST</span>
          <strong>2,8 a 3,2 m</strong>
        </div>
        <div>
          <span>Equipamento inbound</span>
          <strong>Still RX 20-20</strong>
        </div>
        <div>
          <span>Modelo de posição</span>
          <strong>Coordenadas XYZ</strong>
        </div>
      </div>
    </section>
  )
}

function CameraPanel() {
  const cameraMode = useRealisticExperienceStore((store) => store.cameraMode)
  const changeCameraMode = useRealisticExperienceStore(
    (store) => store.changeCameraMode,
  )

  return (
    <section className="panel-section realistic-panel-section">
      <span className="eyebrow">Controle visual</span>
      <h2>Câmeras do CD</h2>
      <p className="muted">
        A câmera altera apenas a observação. A simulação continua sendo decidida
        pelo kernel, não pela renderização.
      </p>

      <div className="realistic-camera-grid">
        {(Object.keys(CAMERA_LABELS) as RealisticCameraMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={cameraMode === mode ? 'active' : ''}
            onClick={() => changeCameraMode(mode)}
          >
            <strong>{CAMERA_LABELS[mode]}</strong>
            <span>
              {mode === 'cinematic'
                ? 'Alterna automaticamente conforme a operação.'
                : mode === 'overview'
                  ? 'Mostra doca, staging e estrutura do armazém.'
                  : mode === 'follow'
                    ? 'Acompanha a RX20 durante o ciclo.'
                    : 'Foco no caminhão e na niveladora.'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function EventsPanel() {
  const events = useRealisticExperienceStore((store) => store.events)
  const telemetry = useRealisticExperienceStore((store) => store.telemetry)
  const recentEvents = events
    .filter((event) => !event.type.startsWith('kernel.'))
    .slice(-12)
    .reverse()

  return (
    <section className="panel-section realistic-panel-section">
      <div className="realistic-panel-heading">
        <div>
          <span className="eyebrow">Linha do tempo</span>
          <h2>Eventos da simulação</h2>
        </div>
        <span className="runtime-badge live">
          {telemetry?.tick.toLocaleString('pt-BR') ?? 0} ticks
        </span>
      </div>

      <div className="realistic-event-list">
        {recentEvents.length === 0 ? (
          <div className="empty-state-box">
            <strong>Aguardando eventos</strong>
            <p>O kernel publicará as transições conforme a operação avançar.</p>
          </div>
        ) : (
          recentEvents.map((event) => (
            <article key={event.id}>
              <time>{event.time.toFixed(1)}s</time>
              <div>
                <strong>{eventLabel(event)}</strong>
                <small>{event.type}</small>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

export function RealisticControlPanel({ section }: { section: RealisticPanel }) {
  if (section === 'flow') return <FlowPanel />
  if (section === 'camera') return <CameraPanel />
  if (section === 'events') return <EventsPanel />
  return <OperationPanel />
}
