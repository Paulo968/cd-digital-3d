import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import type { WarehouseLocation } from '../domain/warehouse'
import type {
  ActionResult,
  MovementInput,
} from '../store/digitalTwinStore'

function sameStockIdentity(
  left: WarehouseLocation,
  right: WarehouseLocation,
): boolean {
  return (
    left.sku === right.sku &&
    (left.lot ?? '') === (right.lot ?? '') &&
    (left.expirationDate ?? '') === (right.expirationDate ?? '')
  )
}

export function MovementPanel({
  locations,
  selectedAddress,
  onMove,
  onCount,
}: {
  locations: WarehouseLocation[]
  selectedAddress: string | null
  onMove: (input: MovementInput) => ActionResult
  onCount: (address: string, quantity: number, actor: string) => ActionResult
}) {
  const selected = locations.find(
    (location) => location.address === selectedAddress,
  )
  const [source, setSource] = useState(
    selected?.handlingUnitCode ?? selected?.address ?? '',
  )
  const [destination, setDestination] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [type, setType] = useState<MovementInput['type']>('transfer')
  const [actor, setActor] = useState('Operador Demo')
  const [documentReference, setDocumentReference] = useState('')
  const [physical, setPhysical] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [countAddress, setCountAddress] = useState(selected?.address ?? '')
  const [countQuantity, setCountQuantity] = useState(selected?.quantity ?? 0)

  useEffect(() => {
    if (!selected) return
    setSource(selected.handlingUnitCode ?? selected.address)
    setCountAddress(selected.address)
    setCountQuantity(selected.quantity)
  }, [selected])

  const sourceLocation = useMemo(
    () =>
      locations.find(
        (location) =>
          location.address === source.toUpperCase() ||
          location.handlingUnitCode?.toUpperCase() === source.toUpperCase(),
      ),
    [locations, source],
  )

  const destinations = useMemo(
    () =>
      locations
        .filter((location) => {
          if (location.status === 'blocked') return false
          if (location.address === sourceLocation?.address) return false
          if (location.quantity + Number(quantity) > location.capacity) {
            return false
          }
          if (location.quantity === 0) return true

          return (
            type === 'replenishment' &&
            location.zone === 'picking' &&
            Boolean(sourceLocation) &&
            sameStockIdentity(sourceLocation, location)
          )
        })
        .slice(0, 3000),
    [locations, quantity, sourceLocation, type],
  )

  function submitMovement(event: FormEvent) {
    event.preventDefault()
    const result = onMove({
      source,
      destination,
      quantity: Number(quantity),
      type,
      actorName: actor,
      documentReference,
      physicalConfirmation: physical,
    })
    setFeedback(result.message)
    if (result.ok) {
      setSource(destination)
      setDestination('')
    }
  }

  function submitCount(event: FormEvent) {
    event.preventDefault()
    const result = onCount(
      countAddress.toUpperCase(),
      Number(countQuantity),
      actor,
    )
    setFeedback(result.message)
  }

  return (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Execução operacional</span>
          <h2>Registrar movimentação</h2>
        </div>
      </div>
      <p className="muted">
        Cada origem, destino, quantidade, usuário e confirmação gera um evento
        de rastreabilidade. Expedição externa será um fluxo próprio; nesta etapa,
        use transferência até uma área de expedição.
      </p>
      <form onSubmit={submitMovement} className="form-stack">
        <label className="field">
          <span>Origem ou unidade logística</span>
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="A-01-01 ou PLT-00001"
          />
        </label>
        {sourceLocation && (
          <div className="source-preview">
            <strong>{sourceLocation.description ?? 'Sem produto'}</strong>
            <span>
              {sourceLocation.address} · saldo {sourceLocation.quantity} ·{' '}
              {sourceLocation.lot ?? 'sem lote'}
            </span>
          </div>
        )}
        <label className="field">
          <span>Destino</span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            required
          >
            <option value="">Selecione uma posição compatível</option>
            {destinations.map((location) => (
              <option key={location.address} value={location.address}>
                {location.address} —{' '}
                {location.quantity === 0
                  ? 'vazia'
                  : `${location.sku} · ${location.lot ?? 'sem lote'} · saldo ${location.quantity}`}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            <span>Quantidade</span>
            <input
              type="number"
              min="1"
              max={sourceLocation?.quantity ?? 999999}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Tipo</span>
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as MovementInput['type'])
              }
            >
              <option value="putaway">Armazenagem</option>
              <option value="transfer">Transferência interna</option>
              <option value="replenishment">Reabastecimento</option>
              <option value="picking">Separação para endereço</option>
            </select>
          </label>
          <label>
            <span>Operador</span>
            <input
              value={actor}
              onChange={(event) => setActor(event.target.value)}
            />
          </label>
          <label>
            <span>Documento</span>
            <input
              value={documentReference}
              onChange={(event) => setDocumentReference(event.target.value)}
              placeholder="NF, ordem ou tarefa"
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={physical}
            onChange={(event) => setPhysical(event.target.checked)}
          />
          <span>Movimentação confirmada fisicamente</span>
        </label>
        <button type="submit" className="primary wide">
          Confirmar movimentação
        </button>
      </form>
      <div className="divider" />
      <form onSubmit={submitCount} className="form-stack">
        <div>
          <span className="eyebrow">Auditoria móvel</span>
          <h3>Confirmar contagem física</h3>
        </div>
        <div className="form-grid">
          <label>
            <span>Endereço</span>
            <input
              value={countAddress}
              onChange={(event) =>
                setCountAddress(event.target.value.toUpperCase())
              }
            />
          </label>
          <label>
            <span>Quantidade física</span>
            <input
              type="number"
              min="0"
              value={countQuantity}
              onChange={(event) =>
                setCountQuantity(Number(event.target.value))
              }
            />
          </label>
        </div>
        <button type="submit" className="secondary wide">
          Registrar conferência
        </button>
      </form>
      {feedback && <div className="feedback">{feedback}</div>}
    </section>
  )
}
