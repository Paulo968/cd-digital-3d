import { useEffect, useMemo, useState } from 'react'
import type { WarehouseLayout } from '../domain/layout'
import { buildPalletTransferSimulation } from '../domain/palletTransferSimulation'
import { buildRoutePlan, type RoutePlan } from '../domain/routePlanning'
import type { WarehouseLocation } from '../domain/warehouse'
import type { ActionResult } from '../store/digitalTwinStore'
import {
  describeOperationalVehicleAnchor,
  resolveOperationalVehiclePoint,
  useOperationalVehicleStore,
} from '../store/operationalVehicleStore'
import { usePalletTransferSimulationStore } from '../store/palletTransferSimulationStore'
import './pallet-transfer.css'

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
  const [mode, setMode] = useState<'routes' | 'transfer'>('routes')
  const [manualAddress, setManualAddress] = useState('')
  const [feedback, setFeedback] = useState('')

  const vehicleId = useOperationalVehicleStore((state) => state.vehicleId)
  const vehicleAnchor = useOperationalVehicleStore((state) => state.anchor)
  const vehiclePoint = useMemo(
    () => resolveOperationalVehiclePoint(layout, locations, vehicleAnchor),
    [layout, locations, vehicleAnchor],
  )
  const vehicleLabel = describeOperationalVehicleAnchor(vehicleAnchor, locations)

  const occupiedLocations = useMemo(
    () =>
      locations
        .filter(
          (location) =>
            location.status === 'occupied' &&
            location.quantity > 0 &&
            Boolean(location.sku),
        )
        .sort((left, right) => left.address.localeCompare(right.address)),
    [locations],
  )
  const selectedLocation = locations.find(
    (location) => location.address === selectedAddress,
  )
  const [sourceAddress, setSourceAddress] = useState(
    occupiedLocations[0]?.address ?? '',
  )
  const sourceLocation = locations.find(
    (location) => location.address === sourceAddress,
  )
  const destinationOptions = useMemo(
    () =>
      locations
        .filter(
          (location) =>
            location.address !== sourceAddress &&
            location.status === 'empty' &&
            location.quantity === 0 &&
            (!sourceLocation || location.capacity >= sourceLocation.quantity),
        )
        .sort((left, right) => left.address.localeCompare(right.address)),
    [locations, sourceAddress, sourceLocation],
  )
  const [destinationAddress, setDestinationAddress] = useState('')

  const transfer = usePalletTransferSimulationStore(
    (state) => state.simulation,
  )
  const transferStatus = usePalletTransferSimulationStore(
    (state) => state.status,
  )
  const startTransfer = usePalletTransferSimulationStore((state) => state.start)
  const clearTransfer = usePalletTransferSimulationStore((state) => state.clear)
  const applyTransfer = usePalletTransferSimulationStore(
    (state) => state.applyToScenario,
  )

  useEffect(() => {
    if (!sourceAddress && occupiedLocations[0]) {
      setSourceAddress(occupiedLocations[0].address)
    }
  }, [occupiedLocations, sourceAddress])

  useEffect(() => {
    if (
      destinationAddress &&
      !destinationOptions.some(
        (location) => location.address === destinationAddress,
      )
    ) {
      setDestinationAddress('')
    }
  }, [destinationAddress, destinationOptions])

  function add(address: string) {
    const result = onAdd(address)
    setFeedback(result.message)
    if (result.ok) setManualAddress('')
  }

  function calculate(modeToCalculate: 'reference' | 'optimized') {
    try {
      const plan = buildRoutePlan(
        layout,
        tasks,
        locations,
        modeToCalculate,
        blocked,
        vehiclePoint,
      )
      clearTransfer()
      onPlan(plan)
      setFeedback(
        modeToCalculate === 'optimized'
          ? `Sequência heurística calculada a partir de ${vehicleLabel}.`
          : `Rota de referência calculada a partir de ${vehicleLabel}.`,
      )
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Não foi possível calcular a rota.',
      )
    }
  }

  function simulateTransfer() {
    try {
      const source = locations.find(
        (location) => location.address === sourceAddress,
      )
      const destination = locations.find(
        (location) => location.address === destinationAddress,
      )
      if (!source) throw new Error('Escolha uma origem ocupada.')
      if (!destination) throw new Error('Escolha um endereço de destino vazio.')

      const simulation = buildPalletTransferSimulation(
        layout,
        source,
        destination,
        blocked,
        vehiclePoint,
      )
      const result = startTransfer(simulation)
      setFeedback(result.message)
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar a transferência.',
      )
    }
  }

  function changeBlocked(side: 'left' | 'right', value: boolean) {
    clearTransfer()
    onBlocked(side, value)
  }

  function applyCompletedTransfer() {
    const result = applyTransfer()
    setFeedback(result.message)
    if (result.ok) {
      setSourceAddress(destinationAddress)
      setDestinationAddress('')
    }
  }

  return (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Laboratório operacional</span>
          <h2>Simulação logística</h2>
        </div>
      </div>

      <article className="vehicle-position-card">
        <div>
          <span className="eyebrow">Empilhadeira operacional</span>
          <strong>{vehicleId}</strong>
        </div>
        <div>
          <span>Posição atual</span>
          <strong>{vehicleLabel}</strong>
          <small>A próxima missão parte exatamente deste ponto.</small>
        </div>
      </article>

      <div className="simulation-tabs" role="tablist" aria-label="Tipo de simulação">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'routes'}
          className={mode === 'routes' ? 'active' : ''}
          onClick={() => setMode('routes')}
        >
          Rotas e tarefas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'transfer'}
          className={mode === 'transfer' ? 'active' : ''}
          onClick={() => setMode('transfer')}
        >
          Movimentar pallet
        </button>
      </div>

      {mode === 'routes' ? (
        <>
          <p className="muted">
            Compare a ordem informada com uma sequência heurística de menor
            deslocamento. Ela melhora o cenário calculado, mas não garante o
            ótimo global. A rota começa na posição atual da {vehicleId} e retorna
            ao mesmo ponto ao final deste laboratório.
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
                onChange={(event) =>
                  changeBlocked('left', event.target.checked)
                }
              />
              <span>Cabeceira esquerda bloqueada</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={blocked.right}
                onChange={(event) =>
                  changeBlocked('right', event.target.checked)
                }
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
                Executar animação da rota
              </button>
            </article>
          )}
          <button type="button" className="danger-link" onClick={onClear}>
            Limpar tarefas e rota
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Simule uma unidade logística por vez. A {vehicleId} parte de{' '}
            <strong>{vehicleLabel}</strong>, coleta o pallet completo na origem e
            o deposita em um endereço vazio. Ao aplicar, o destino vira sua nova
            posição inicial.
          </p>

          {selectedLocation && (
            <button
              type="button"
              className="secondary wide selected-transfer-helper"
              disabled={transferStatus === 'running'}
              onClick={() => {
                if (
                  selectedLocation.status === 'occupied' &&
                  selectedLocation.quantity > 0
                ) {
                  setSourceAddress(selectedLocation.address)
                  setFeedback(`${selectedLocation.address} definida como origem.`)
                } else if (
                  selectedLocation.status === 'empty' &&
                  selectedLocation.quantity === 0
                ) {
                  setDestinationAddress(selectedLocation.address)
                  setFeedback(`${selectedLocation.address} definida como destino.`)
                } else {
                  setFeedback(
                    'A posição selecionada precisa estar ocupada para origem ou vazia para destino.',
                  )
                }
              }}
            >
              Usar posição selecionada ({selectedLocation.address})
            </button>
          )}

          <div className="transfer-form">
            <label className="field">
              <span>Retirar pallet de</span>
              <select
                value={sourceAddress}
                disabled={transferStatus === 'running'}
                onChange={(event) => {
                  clearTransfer()
                  setSourceAddress(event.target.value)
                }}
              >
                <option value="">Selecione a origem</option>
                {occupiedLocations.map((location) => (
                  <option key={location.address} value={location.address}>
                    {location.address} — {location.handlingUnitCode ?? location.sku}
                  </option>
                ))}
              </select>
            </label>

            {sourceLocation && (
              <div className="transfer-source-preview">
                <strong>
                  {sourceLocation.handlingUnitCode ??
                    'Unidade logística sem etiqueta'}
                </strong>
                <span>{sourceLocation.description ?? sourceLocation.sku}</span>
                <small>
                  SKU {sourceLocation.sku} · lote {sourceLocation.lot ?? '—'} ·{' '}
                  {sourceLocation.quantity} unidades · nível {sourceLocation.level}
                </small>
              </div>
            )}

            <label className="field">
              <span>Depositar pallet em</span>
              <select
                value={destinationAddress}
                disabled={transferStatus === 'running'}
                onChange={(event) => {
                  clearTransfer()
                  setDestinationAddress(event.target.value)
                }}
              >
                <option value="">Selecione um endereço vazio</option>
                {destinationOptions.map((location) => (
                  <option key={location.address} value={location.address}>
                    {location.address} — capacidade {location.capacity}
                  </option>
                ))}
              </select>
            </label>

            <div className="simulation-options">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={blocked.left}
                  disabled={transferStatus === 'running'}
                  onChange={(event) =>
                    changeBlocked('left', event.target.checked)
                  }
                />
                <span>Cabeceira esquerda bloqueada</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={blocked.right}
                  disabled={transferStatus === 'running'}
                  onChange={(event) =>
                    changeBlocked('right', event.target.checked)
                  }
                />
                <span>Cabeceira direita bloqueada</span>
              </label>
            </div>

            <button
              type="button"
              className="primary wide"
              disabled={
                transferStatus === 'running' ||
                !sourceAddress ||
                !destinationAddress
              }
              onClick={simulateTransfer}
            >
              {transferStatus === 'running'
                ? 'Transporte em execução…'
                : transferStatus === 'completed'
                  ? 'Repetir transporte visual'
                  : 'Simular coleta e entrega'}
            </button>
          </div>

          {transfer && (
            <article className="transfer-mission-card">
              <div className="transfer-mission-heading">
                <div>
                  <span className="eyebrow">Missão visual</span>
                  <strong>
                    {transfer.sourceAddress} → {transfer.destinationAddress}
                  </strong>
                </div>
                <span className={`transfer-status ${transferStatus}`}>
                  {transferStatus === 'running' ? 'Executando' : 'Concluída'}
                </span>
              </div>
              <div className="transfer-metrics">
                <div>
                  <span>Do estacionamento à origem</span>
                  <strong>{transfer.emptyDistance.toLocaleString('pt-BR')} m</strong>
                </div>
                <div>
                  <span>Com carga</span>
                  <strong>{transfer.loadedDistance.toLocaleString('pt-BR')} m</strong>
                </div>
                <div>
                  <span>Total visual</span>
                  <strong>{transfer.totalDistance.toLocaleString('pt-BR')} m</strong>
                </div>
              </div>
              <p>
                {transfer.handlingUnitCode ?? transfer.sku} · {transfer.quantity}{' '}
                unidades · coleta no nível{' '}
                {locations.find(
                  (location) => location.address === transfer.sourceAddress,
                )?.level ?? '—'}
              </p>
              {transferStatus === 'completed' && (
                <button
                  type="button"
                  className="secondary wide"
                  onClick={applyCompletedTransfer}
                >
                  Aplicar movimentação e estacionar no destino
                </button>
              )}
              <button
                type="button"
                className="danger-link"
                disabled={transferStatus === 'running'}
                onClick={() => {
                  clearTransfer()
                  setFeedback(
                    'Simulação descartada. Estoque e posição operacional da empilhadeira foram preservados.',
                  )
                }}
              >
                Descartar simulação
              </button>
            </article>
          )}

          <div className="truth-box">
            <strong>Separação entre simular e executar</strong>
            <p>
              Durante a animação, nada é confirmado fisicamente. Ao aplicar, a
              origem fica vazia, o destino recebe o pallet e a posição operacional
              da {vehicleId} passa a ser o endereço de destino. O evento continua
              marcado como informação sistêmica, sem confirmação física.
            </p>
          </div>
        </>
      )}

      {feedback && <div className="feedback">{feedback}</div>}
    </section>
  )
}
