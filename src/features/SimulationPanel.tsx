import { useState } from 'react'
import type { WarehouseLayout } from '../domain/layout'
import { buildRoutePlan, type RoutePlan } from '../domain/routePlanning'
import type { WarehouseLocation } from '../domain/warehouse'
import type { ActionResult } from '../store/digitalTwinStore'

export function SimulationPanel({
  layout,
  locations,
  selectedAddress,
  tasks,
  blocked,
  routePlan,
  onAdd,
  onRemove,
  onClear,
  onBlocked,
  onPlan,
  onRun,
}: {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
  selectedAddress: string | null
  tasks: string[]
  blocked: { left: boolean; right: boolean }
  routePlan: RoutePlan | null
  onAdd: (address: string) => ActionResult
  onRemove: (address: string) => void
  onClear: () => void
  onBlocked: (side: 'left' | 'right', value: boolean) => void
  onPlan: (plan: RoutePlan | null) => void
  onRun: () => void
}) {
  const [manualAddress, setManualAddress] = useState('')
  const [feedback, setFeedback] = useState('')

  function add(address: string) {
    const result = onAdd(address)
    setFeedback(result.message)
    if (result.ok) setManualAddress('')
  }

  function calculate(mode: 'reference' | 'optimized') {
    try {
      const plan = buildRoutePlan(layout, tasks, locations, mode, blocked)
      onPlan(plan)
      setFeedback(
        mode === 'optimized'
          ? 'Sequência heurística calculada.'
          : 'Rota de referência calculada.',
      )
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Não foi possível calcular a rota.',
      )
    }
  }

  return (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Laboratório operacional</span>
          <h2>Rotas e tarefas</h2>
        </div>
      </div>
      <p className="muted">
        Compare a ordem informada com uma sequência heurística de menor
        deslocamento. A heurística melhora o cenário calculado, mas não garante
        o ótimo global. Os números representam distância geométrica neste
        layout, não tempo real medido.
      </p>
      <div className="task-add">
        <input
          value={manualAddress}
          onChange={(event) =>
            setManualAddress(event.target.value.toUpperCase())
          }
          placeholder="Ex.: C-07-05"
        />
        <button
          type="button"
          onClick={() => manualAddress && add(manualAddress)}
        >
          Adicionar
        </button>
      </div>
      {selectedAddress && (
        <button
          type="button"
          className="secondary wide"
          onClick={() => add(selectedAddress)}
        >
          Adicionar posição selecionada ({selectedAddress})
        </button>
      )}
      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-state">Nenhuma tarefa adicionada.</p>
        ) : (
          tasks.map((address, index) => (
            <div className="task-item" key={`${address}-${index}`}>
              <span className="task-order">{index + 1}</span>
              <strong>{address}</strong>
              <button type="button" onClick={() => onRemove(address)}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="simulation-options">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={blocked.left}
            onChange={(event) => onBlocked('left', event.target.checked)}
          />
          <span>Cabeceira esquerda bloqueada</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={blocked.right}
            onChange={(event) => onBlocked('right', event.target.checked)}
          />
          <span>Cabeceira direita bloqueada</span>
        </label>
      </div>
      <div className="action-stack">
        <button
          type="button"
          className="secondary"
          onClick={() => calculate('reference')}
        >
          Calcular referência
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => calculate('optimized')}
        >
          Calcular sequência heurística
        </button>
      </div>
      {routePlan && (
        <article className="metrics-card">
          <div>
            <span>Modo</span>
            <strong>
              {routePlan.mode === 'optimized' ? 'Heurística' : 'Referência'}
            </strong>
          </div>
          <div>
            <span>Distância</span>
            <strong>{routePlan.distance.toLocaleString('pt-BR')} m</strong>
          </div>
          <div>
            <span>Referência</span>
            <strong>
              {routePlan.baselineDistance.toLocaleString('pt-BR')} m
            </strong>
          </div>
          <div>
            <span>Redução calculada</span>
            <strong>
              {routePlan.savedPercent.toLocaleString('pt-BR')}%
            </strong>
          </div>
          <p>Sequência: {routePlan.addresses.join(' → ')}</p>
          <button type="button" className="primary wide" onClick={onRun}>
            Executar animação
          </button>
        </article>
      )}
      <button type="button" className="danger-link" onClick={onClear}>
        Limpar tarefas e rota
      </button>
      {feedback && <div className="feedback">{feedback}</div>}
    </section>
  )
}
