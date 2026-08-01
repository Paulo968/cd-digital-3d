import { useMemo, useState } from 'react'
import {
  CONFIRMATION_LABEL,
  SLOT_STATUS_LABEL,
  summarizeWarehouse,
  type SlotStatus,
} from '../domain/warehouse'
import { useDigitalTwinStore } from '../store/digitalTwinStore'

const STATUS_COLOR: Record<SlotStatus, string> = {
  occupied: '#38bdf8',
  empty: '#64748b',
  blocked: '#ef4444',
  divergent: '#f59e0b',
}

export function OperationalOverviewPanel() {
  const layout = useDigitalTwinStore((state) => state.layout)
  const locations = useDigitalTwinStore((state) => state.locations)
  const selectedAddress = useDigitalTwinStore(
    (state) => state.selectedAddress,
  )
  const selectAddress = useDigitalTwinStore((state) => state.selectAddress)
  const visible = useDigitalTwinStore((state) => state.visibleStatuses)
  const toggleStatus = useDigitalTwinStore((state) => state.toggleStatus)
  const setActivePanel = useDigitalTwinStore((state) => state.setActivePanel)
  const addTask = useDigitalTwinStore((state) => state.addSimulationTask)
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState('')
  const [navAisle, setNavAisle] = useState(
    layout.rackRows[0]?.aisle ?? 'A',
  )
  const [navPosition, setNavPosition] = useState('01')
  const [navLevel, setNavLevel] = useState('01')
  const summary = useMemo(() => summarizeWarehouse(locations), [locations])
  const selected = locations.find(
    (location) => location.address === selectedAddress,
  )

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
          <p>
            Clique no CD ou utilize a busca para consultar estoque e histórico.
          </p>
        </div>
      )}
    </section>
  )
}
