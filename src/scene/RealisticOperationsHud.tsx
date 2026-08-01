import { Html } from '@react-three/drei'
import type { CSSProperties } from 'react'
import type { KernelEvent, KernelTelemetry } from '../realistic/core/livingWorldKernel'
import type { ReceivingOperationsTelemetry } from '../realistic/tasks/receivingTaskResourceSystem'
import type { ReceivingSimulationState } from '../realistic-v2/receivingSimulation'

export type RealisticCameraMode = 'cinematic' | 'overview' | 'follow' | 'dock'

interface RealisticOperationsHudProps {
  state: ReceivingSimulationState
  telemetry: KernelTelemetry
  operations?: ReceivingOperationsTelemetry
  events: KernelEvent[]
  timeScale: number
  paused: boolean
  cameraMode: RealisticCameraMode
  onTimeScaleChange: (scale: number) => void
  onTogglePause: () => void
  onStepOnce: () => void
  onReset: () => void
  onCameraModeChange: (mode: RealisticCameraMode) => void
}

const SPEEDS = [1, 2, 4, 8] as const

const CAMERA_LABELS: Record<RealisticCameraMode, string> = {
  cinematic: 'Cinema',
  overview: 'Visão geral',
  follow: 'Seguir RX20',
  dock: 'Doca',
}

const RESOURCE_LABELS: Record<
  ReceivingOperationsTelemetry['resource']['status'],
  string
> = {
  available: 'disponível',
  reserved: 'reservada',
  busy: 'em execução',
}

const INTERNAL_FLOW_EVENTS = new Set([
  'putaway.task.created',
  'tp-in.task.started',
  'tp-in.task.completed',
  'reach-put.task.started',
  'putaway.completed',
  'putaway.buffer.blocked',
  'putaway.buffer.released',
])

function eventLabel(event: KernelEvent): string {
  const payload = event.payload ?? {}
  if (event.type === 'pallet.picked') {
    return `Coleta · ${String(payload.palletId ?? 'pallet')}`
  }
  if (event.type === 'pallet.staged') {
    return `Staging · posição D${Number(payload.stagedSlot ?? 0) + 1}`
  }
  if (event.type === 'task.assigned') {
    return `Tarefa atribuída · ${String(payload.palletId ?? 'pallet')}`
  }
  if (event.type === 'task.started') {
    return `Tarefa em execução · ${String(payload.palletId ?? 'pallet')}`
  }
  if (event.type === 'task.completed') {
    return `Descarga concluída · ${String(payload.palletId ?? 'pallet')}`
  }
  if (event.type === 'reservation.created') {
    return `Reserva · D${Number(payload.slot ?? 0) + 1}`
  }
  if (event.type === 'receiving.execution.blocked') {
    return `RX20 bloqueada · ${String(payload.reason ?? 'sem autorização')}`
  }
  if (event.type === 'receiving.execution.resumed') {
    return `RX20 liberada · ${String(payload.palletId ?? 'operação')}`
  }
  if (event.type === 'putaway.task.created') {
    return `Putaway criado · ${String(payload.palletId ?? 'pallet')}`
  }
  if (event.type === 'tp-in.task.started') {
    return `TP-IN levando ao buffer B${Number(payload.bufferSlot ?? 0) + 1}`
  }
  if (event.type === 'tp-in.task.completed') {
    return `Buffer recebido · ${String(payload.palletId ?? 'pallet')}`
  }
  if (event.type === 'reach-put.task.started') {
    return `Retrátil → ${String(payload.rackAddress ?? 'Rua A')}`
  }
  if (event.type === 'putaway.completed') {
    return `Armazenado · ${String(payload.rackAddress ?? 'Rua A')}`
  }
  if (event.type === 'putaway.buffer.blocked') {
    return 'Buffer da Rua A cheio · TP-IN aguardando'
  }
  if (event.type === 'putaway.buffer.released') {
    return 'Buffer da Rua A liberado'
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

function internalFlowSummary(event: KernelEvent | undefined): string {
  if (!event) return 'Aguardando primeiro pallet liberado pelo recebimento'
  return eventLabel(event)
}

function buttonStyle(active = false): CSSProperties {
  return {
    border: `1px solid ${active ? '#22d3ee' : '#475569'}`,
    borderRadius: 8,
    background: active ? 'rgba(8,145,178,.28)' : 'rgba(15,23,42,.88)',
    color: active ? '#cffafe' : '#cbd5e1',
    padding: '6px 8px',
    fontSize: 9,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function metricCard(label: string, value: string) {
  return (
    <div
      key={label}
      style={{
        padding: '8px 7px',
        borderRadius: 10,
        background: 'rgba(30,41,59,.72)',
        border: '1px solid rgba(148,163,184,.12)',
      }}
    >
      <span style={{ display: 'block', fontSize: 8, color: '#94a3b8' }}>
        {label}
      </span>
      <strong style={{ display: 'block', marginTop: 2, fontSize: 13 }}>
        {value}
      </strong>
    </div>
  )
}

export function RealisticOperationsHud({
  state,
  telemetry,
  operations,
  events,
  timeScale,
  paused,
  cameraMode,
  onTimeScaleChange,
  onTogglePause,
  onStepOnce,
  onReset,
  onCameraModeChange,
}: RealisticOperationsHudProps) {
  const staged = state.pallets.filter((pallet) => pallet.phase === 'staged').length
  const inTruck = state.pallets.filter((pallet) => pallet.phase === 'truck').length
  const carried = state.pallets.filter((pallet) => pallet.phase === 'carried').length
  const currentCompleted = Math.max(0, 6 - inTruck - carried)
  const currentProgress = Math.min(100, (currentCompleted / 6) * 100)
  const resolvedOperations: ReceivingOperationsTelemetry = operations ?? {
    tasks: [],
    activeTask: null,
    queued: inTruck,
    executing: carried,
    completed: staged,
    reservedSlots: [],
    resource: {
      id: 'RX20-REC',
      kind: 'counterbalance-forklift',
      status:
        carried > 0
          ? 'busy'
          : state.truck.phase === 'docked' && inTruck > 0
            ? 'reserved'
            : 'available',
      taskId: null,
    },
  }
  const activeTask = resolvedOperations.activeTask
  const recentEvents = events
    .filter((event) => !event.type.startsWith('kernel.'))
    .slice(-5)
    .reverse()
  const latestInternalEvent = [...events]
    .reverse()
    .find((event) => INTERNAL_FLOW_EVENTS.has(event.type))
  const recentStored = events.filter((event) => event.type === 'putaway.completed')
    .length
  const internalBlocked = latestInternalEvent?.type === 'putaway.buffer.blocked'

  return (
    <Html fullscreen zIndexRange={[100, 70]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 76,
          left: 12,
          width: 'min(390px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 94px)',
          borderRadius: 16,
          border: `1px solid ${state.fault ? '#ef4444' : '#22d3ee'}`,
          background:
            'linear-gradient(145deg,rgba(3,12,24,.96),rgba(15,23,42,.92))',
          boxShadow: '0 18px 45px rgba(0,0,0,.42)',
          color: '#f8fafc',
          fontFamily: 'Inter,system-ui,sans-serif',
          overflowY: 'auto',
          pointerEvents: 'auto',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid rgba(148,163,184,.18)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: state.fault
                      ? '#ef4444'
                      : paused
                        ? '#f59e0b'
                        : '#22c55e',
                    boxShadow: `0 0 14px ${
                      state.fault ? '#ef4444' : paused ? '#f59e0b' : '#22c55e'
                    }`,
                  }}
                />
                <strong style={{ fontSize: 12, letterSpacing: '.08em' }}>
                  CD REALISTA · OPERAÇÃO VIVA
                </strong>
              </div>
              <div style={{ marginTop: 5, fontSize: 10, color: '#a5f3fc' }}>
                {state.label}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#67e8f9' }}>
                {timeScale}×
              </div>
              <div style={{ fontSize: 8, color: '#94a3b8' }}>RITMO</div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9,
                color: '#cbd5e1',
                marginBottom: 5,
              }}
            >
              <span>Caminhão atual</span>
              <span>{currentCompleted}/6 pallets</span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'rgba(51,65,85,.75)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${currentProgress}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg,#0891b2,#22d3ee,#4ade80)',
                  transition: 'width 220ms ease',
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
            gap: 7,
            padding: '10px 12px',
          }}
        >
          {metricCard('Lote', String(state.batch).padStart(3, '0'))}
          {metricCard('Staging', String(staged))}
          {metricCard('Caminhões', String(state.completedTrucks))}
          {metricCard('Tick', telemetry.tick.toLocaleString('pt-BR'))}
        </div>

        <div
          style={{
            margin: '0 12px 10px',
            padding: '9px 10px',
            borderRadius: 11,
            background:
              'linear-gradient(135deg,rgba(8,145,178,.16),rgba(15,23,42,.72))',
            border: '1px solid rgba(34,211,238,.2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 8,
              color: '#67e8f9',
              letterSpacing: '.06em',
            }}
          >
            <span>TAREFA DE DESCARGA</span>
            <span>
              {resolvedOperations.resource.id} ·{' '}
              {RESOURCE_LABELS[resolvedOperations.resource.status]}
            </span>
          </div>
          <strong
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: 10,
              color: activeTask ? '#f8fafc' : '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeTask
              ? `${activeTask.palletId} → D${String(
                  (activeTask.destinationSlot ?? 0) + 1,
                ).padStart(2, '0')}`
              : 'Aguardando tarefa válida e recurso livre'}
          </strong>
          <div
            style={{
              marginTop: 5,
              display: 'flex',
              gap: 12,
              fontSize: 8,
              color: '#94a3b8',
            }}
          >
            <span>Fila: {resolvedOperations.queued}</span>
            <span>Executando: {resolvedOperations.executing}</span>
            <span>Concluídas: {resolvedOperations.completed}</span>
          </div>
        </div>

        <div
          style={{
            margin: '0 12px 10px',
            padding: '9px 10px',
            borderRadius: 11,
            background: internalBlocked
              ? 'rgba(127,29,29,.28)'
              : 'linear-gradient(135deg,rgba(34,197,94,.12),rgba(15,23,42,.72))',
            border: `1px solid ${
              internalBlocked ? 'rgba(248,113,113,.5)' : 'rgba(74,222,128,.22)'
            }`,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 8,
              color: internalBlocked ? '#fca5a5' : '#86efac',
              letterSpacing: '.06em',
            }}
          >
            <span>FLUXO INTERNO · RUA A</span>
            <span>ARMAZENADOS NO LOG: {recentStored}</span>
          </div>
          <strong
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: 10,
              color: '#e2e8f0',
            }}
          >
            {internalFlowSummary(latestInternalEvent)}
          </strong>
          <div style={{ marginTop: 5, fontSize: 8, color: '#94a3b8' }}>
            STAGING → TP-IN → BUFFER → RETRÁTIL → ENDEREÇO A-XX-XX
          </div>
        </div>

        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ fontSize: 8, color: '#64748b', marginBottom: 5 }}>
            VELOCIDADE DA EXPERIÊNCIA
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onTimeScaleChange(speed)}
                style={buttonStyle(timeScale === speed)}
              >
                {speed}×
              </button>
            ))}
            <button type="button" onClick={onTogglePause} style={buttonStyle(paused)}>
              {paused ? 'Continuar' : 'Pausar'}
            </button>
            <button
              type="button"
              onClick={onStepOnce}
              disabled={!paused}
              style={{ ...buttonStyle(false), opacity: paused ? 1 : 0.4 }}
            >
              +1 tick
            </button>
          </div>
        </div>

        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ fontSize: 8, color: '#64748b', marginBottom: 5 }}>
            CÂMERA
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(CAMERA_LABELS) as RealisticCameraMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onCameraModeChange(mode)}
                style={buttonStyle(cameraMode === mode)}
              >
                {CAMERA_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            margin: '0 12px 10px',
            padding: '9px 10px',
            borderRadius: 11,
            background: 'rgba(2,6,23,.56)',
            border: '1px solid rgba(34,211,238,.12)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
              fontSize: 8,
              color: '#64748b',
            }}
          >
            <span>EVENTOS AO VIVO</span>
            <span>{telemetry.time.toFixed(1)}s simulados</span>
          </div>
          {recentEvents.length === 0 ? (
            <div style={{ fontSize: 9, color: '#94a3b8' }}>
              Aguardando operação…
            </div>
          ) : (
            recentEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '42px minmax(0,1fr)',
                  gap: 7,
                  padding: '3px 0',
                  fontSize: 9,
                }}
              >
                <span style={{ color: '#67e8f9' }}>{event.time.toFixed(1)}s</span>
                <span
                  style={{
                    color:
                      event.type === 'safety.fault.activated' ||
                      event.type === 'receiving.execution.blocked' ||
                      event.type === 'putaway.buffer.blocked'
                        ? '#fca5a5'
                        : '#cbd5e1',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {eventLabel(event)}
                </span>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '9px 12px',
            borderTop: '1px solid rgba(148,163,184,.14)',
            background: 'rgba(2,6,23,.48)',
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: state.fault ? '#fca5a5' : '#94a3b8',
            }}
          >
            RX20: {state.forklift.phase} · {state.forklift.speed.toFixed(1)} m/s ·{' '}
            {RESOURCE_LABELS[resolvedOperations.resource.status]}
          </span>
          <button type="button" onClick={onReset} style={buttonStyle(false)}>
            Reiniciar
          </button>
        </div>
      </div>
    </Html>
  )
}
