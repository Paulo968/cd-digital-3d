import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import { useMemo, useRef, useState, type ElementRef } from 'react'
import * as THREE from 'three'
import {
  CONFIRMATION_LABEL,
  SLOT_STATUS_LABEL,
  WAREHOUSE_CONFIG,
  summarizeWarehouse,
  type SlotSide,
  type SlotStatus,
  type WarehouseLocation,
} from './domain/warehouse'
import { useWarehouseStore } from './store/warehouseStore'

const BAY_WIDTH = 2.25
const LEVEL_HEIGHT = 1.45
const RACK_DEPTH = 1.25
const AISLE_WIDTH = 4.2
const AISLE_PITCH = AISLE_WIDTH + RACK_DEPTH * 2 + 1.4
const FLOOR_LENGTH = WAREHOUSE_CONFIG.baysPerSide * BAY_WIDTH + 5
const FLOOR_WIDTH = WAREHOUSE_CONFIG.aisles.length * AISLE_PITCH + 4
const RACK_HEIGHT = WAREHOUSE_CONFIG.levels * LEVEL_HEIGHT + 0.55

const STATUS_COLOR: Record<SlotStatus, string> = {
  occupied: '#38bdf8',
  empty: '#64748b',
  blocked: '#ef4444',
  divergent: '#f59e0b',
}

function aisleIndex(aisle: string): number {
  return WAREHOUSE_CONFIG.aisles.indexOf(
    aisle as (typeof WAREHOUSE_CONFIG.aisles)[number],
  )
}

function getAisleCenterZ(aisle: string): number {
  return (
    aisleIndex(aisle) * AISLE_PITCH -
    ((WAREHOUSE_CONFIG.aisles.length - 1) * AISLE_PITCH) / 2
  )
}

function getSlotPosition(location: WarehouseLocation): THREE.Vector3 {
  const rackLength = WAREHOUSE_CONFIG.baysPerSide * BAY_WIDTH
  const x =
    (location.bay - 0.5) * BAY_WIDTH -
    rackLength / 2
  const sideDirection = location.side === 'left' ? -1 : 1
  const z =
    getAisleCenterZ(location.aisle) +
    sideDirection * (AISLE_WIDTH / 2 + RACK_DEPTH / 2)
  const y = (location.level - 0.5) * LEVEL_HEIGHT + 0.25

  return new THREE.Vector3(x, y, z)
}

function RackStructure({ aisle, side }: { aisle: string; side: SlotSide }) {
  const rackLength = WAREHOUSE_CONFIG.baysPerSide * BAY_WIDTH
  const sideDirection = side === 'left' ? -1 : 1
  const centerZ =
    getAisleCenterZ(aisle) +
    sideDirection * (AISLE_WIDTH / 2 + RACK_DEPTH / 2)

  return (
    <group position={[0, 0, centerZ]}>
      {Array.from({ length: WAREHOUSE_CONFIG.baysPerSide + 1 }, (_, index) => {
        const x = index * BAY_WIDTH - rackLength / 2

        return (
          <mesh key={`post-${index}`} position={[x, RACK_HEIGHT / 2, 0]}>
            <boxGeometry args={[0.12, RACK_HEIGHT, 0.12]} />
            <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.45} />
          </mesh>
        )
      })}

      {Array.from({ length: WAREHOUSE_CONFIG.levels }, (_, index) => {
        const y = index * LEVEL_HEIGHT + 0.15

        return (
          <group key={`beam-${index}`} position={[0, y, 0]}>
            <mesh position={[0, 0, -RACK_DEPTH / 2]}>
              <boxGeometry args={[rackLength, 0.1, 0.1]} />
              <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, RACK_DEPTH / 2]}>
              <boxGeometry args={[rackLength, 0.1, 0.1]} />
              <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function PalletSlot({
  location,
  selected,
}: {
  location: WarehouseLocation
  selected: boolean
}) {
  const selectAddress = useWarehouseStore((state) => state.selectAddress)
  const position = getSlotPosition(location)
  const color = STATUS_COLOR[location.status]
  const isOccupied = location.status === 'occupied' || location.status === 'divergent'
  const loadHeight = location.zone === 'picking' ? 0.55 : 0.9

  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation()
        selectAddress(location.address)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <mesh position={[0, -0.52, 0]}>
        <boxGeometry args={[BAY_WIDTH * 0.84, 0.08, RACK_DEPTH * 0.82]} />
        <meshStandardMaterial
          color={selected ? '#f8fafc' : color}
          transparent
          opacity={location.status === 'empty' ? 0.14 : 0.35}
          wireframe={location.status === 'empty'}
        />
      </mesh>

      {isOccupied && (
        <>
          <mesh position={[0, -0.4, 0]} castShadow>
            <boxGeometry args={[BAY_WIDTH * 0.72, 0.12, RACK_DEPTH * 0.72]} />
            <meshStandardMaterial color="#9a6a3a" roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.28 + loadHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[BAY_WIDTH * 0.68, loadHeight, RACK_DEPTH * 0.68]} />
            <meshStandardMaterial
              color={color}
              emissive={selected ? color : '#000000'}
              emissiveIntensity={selected ? 0.35 : 0}
              roughness={0.58}
            />
          </mesh>
        </>
      )}

      {location.status === 'blocked' && (
        <group rotation={[0, 0, Math.PI / 4]}>
          <mesh>
            <boxGeometry args={[1.25, 0.12, 0.12]} />
            <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[1.25, 0.12, 0.12]} />
            <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" />
          </mesh>
        </group>
      )}

      {selected && (
        <mesh>
          <boxGeometry args={[BAY_WIDTH * 0.92, 1.15, RACK_DEPTH * 0.92]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  )
}

function Aisle({ aisle, locations }: { aisle: string; locations: WarehouseLocation[] }) {
  const centerZ = getAisleCenterZ(aisle)
  const selectedAddress = useWarehouseStore((state) => state.selectedAddress)

  return (
    <group>
      <RackStructure aisle={aisle} side="left" />
      <RackStructure aisle={aisle} side="right" />

      <mesh position={[0, 0.012, centerZ]} receiveShadow>
        <boxGeometry args={[FLOOR_LENGTH - 1, 0.02, AISLE_WIDTH]} />
        <meshStandardMaterial color="#0f1f30" roughness={0.95} />
      </mesh>

      <mesh position={[-FLOOR_LENGTH / 2 + 0.75, 0.025, centerZ]}>
        <boxGeometry args={[1.2, 0.03, AISLE_WIDTH * 0.9]} />
        <meshStandardMaterial color="#0ea5e9" emissive="#082f49" />
      </mesh>

      <Text
        position={[-FLOOR_LENGTH / 2 + 0.75, 0.08, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.72}
        color="#e0f2fe"
        anchorX="center"
        anchorY="middle"
      >
        RUA {aisle}
      </Text>

      {locations.map((location) => (
        <PalletSlot
          key={location.address}
          location={location}
          selected={selectedAddress === location.address}
        />
      ))}
    </group>
  )
}

function CameraRig({ selectedLocation }: { selectedLocation?: WarehouseLocation }) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null)
  const { camera } = useThree()
  const desiredTarget = useRef(new THREE.Vector3(0, 2.5, 0))
  const desiredCamera = useRef(new THREE.Vector3(23, 21, 31))

  useFrame(() => {
    if (selectedLocation) {
      const slotPosition = getSlotPosition(selectedLocation)
      const sideDirection = selectedLocation.side === 'left' ? 1 : -1
      desiredTarget.current.copy(slotPosition)
      desiredCamera.current.set(
        slotPosition.x + 6,
        Math.max(slotPosition.y + 3.5, 5),
        slotPosition.z + sideDirection * 7,
      )
    } else {
      desiredTarget.current.set(0, 2.5, 0)
      desiredCamera.current.set(23, 21, 31)
    }

    camera.position.lerp(desiredCamera.current, 0.055)
    controlsRef.current?.target.lerp(desiredTarget.current, 0.075)
    controlsRef.current?.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={75}
      maxPolarAngle={Math.PI / 2.04}
    />
  )
}

function WarehouseScene() {
  const locations = useWarehouseStore((state) => state.locations)
  const selectedAddress = useWarehouseStore((state) => state.selectedAddress)
  const visibleStatuses = useWarehouseStore((state) => state.visibleStatuses)
  const selectAddress = useWarehouseStore((state) => state.selectAddress)

  const visibleLocations = useMemo(
    () => locations.filter((location) => visibleStatuses[location.status]),
    [locations, visibleStatuses],
  )

  const selectedLocation = locations.find(
    (location) => location.address === selectedAddress,
  )

  return (
    <Canvas
      shadows
      dpr={[1, 1.65]}
      camera={{ position: [23, 21, 31], fov: 48, near: 0.1, far: 180 }}
      onPointerMissed={() => selectAddress(null)}
    >
      <color attach="background" args={['#07111f']} />
      <fog attach="fog" args={['#07111f', 42, 105]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#dbeafe', '#0f172a', 1.2]} />
      <directionalLight
        position={[18, 28, 16]}
        intensity={2.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_LENGTH + 8, FLOOR_WIDTH + 8]} />
        <meshStandardMaterial color="#0a1522" roughness={0.98} />
      </mesh>

      <gridHelper
        args={[Math.max(FLOOR_LENGTH, FLOOR_WIDTH) + 15, 80, '#1e3a5f', '#13263c']}
        position={[0, 0.015, 0]}
      />

      {WAREHOUSE_CONFIG.aisles.map((aisle) => (
        <Aisle
          key={aisle}
          aisle={aisle}
          locations={visibleLocations.filter((location) => location.aisle === aisle)}
        />
      ))}

      <CameraRig selectedLocation={selectedLocation} />
    </Canvas>
  )
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FilterButton({ status }: { status: SlotStatus }) {
  const enabled = useWarehouseStore((state) => state.visibleStatuses[status])
  const toggleStatus = useWarehouseStore((state) => state.toggleStatus)

  return (
    <button
      type="button"
      className={`filter-button ${enabled ? 'is-active' : ''}`}
      onClick={() => toggleStatus(status)}
    >
      <span className="status-dot" style={{ backgroundColor: STATUS_COLOR[status] }} />
      {SLOT_STATUS_LABEL[status]}
    </button>
  )
}

function LocationDetails({ location }: { location: WarehouseLocation }) {
  const selectAddress = useWarehouseStore((state) => state.selectAddress)

  return (
    <aside className="details-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Endereço selecionado</span>
          <h2>{location.address}</h2>
        </div>
        <button type="button" className="icon-button" onClick={() => selectAddress(null)}>
          ×
        </button>
      </div>

      <div className="status-line">
        <span className="status-dot large" style={{ backgroundColor: STATUS_COLOR[location.status] }} />
        <div>
          <strong>{SLOT_STATUS_LABEL[location.status]}</strong>
          <small>{CONFIRMATION_LABEL[location.confirmation]}</small>
        </div>
      </div>

      <dl className="details-grid">
        <div><dt>Rua</dt><dd>{location.aisle}</dd></div>
        <div><dt>Lado</dt><dd>{location.side === 'left' ? 'Esquerdo — ímpar' : 'Direito — par'}</dd></div>
        <div><dt>Posição</dt><dd>{String(location.position).padStart(2, '0')}</dd></div>
        <div><dt>Nível</dt><dd>{location.level}</dd></div>
        <div><dt>Zona</dt><dd>{location.zone === 'picking' ? 'Picking' : 'Reserva'}</dd></div>
        <div><dt>SKU</dt><dd>{location.sku ?? '—'}</dd></div>
        <div className="wide"><dt>Produto</dt><dd>{location.description ?? 'Posição sem produto informado'}</dd></div>
        <div><dt>Quantidade</dt><dd>{location.quantity}</dd></div>
        <div><dt>Capacidade</dt><dd>{location.capacity}</dd></div>
        <div><dt>Lote</dt><dd>{location.lot ?? '—'}</dd></div>
        <div className="wide"><dt>Última confirmação física</dt><dd>{location.lastCheckedAt ? '27/07/2026 às 18:30' : 'Não confirmada'}</dd></div>
      </dl>

      <p className="truth-note">
        A cena representa os dados carregados. Uma posição vazia no sistema só se torna
        “vazia confirmada” após conferência física registrada.
      </p>
    </aside>
  )
}

export default function App() {
  const locations = useWarehouseStore((state) => state.locations)
  const selectedAddress = useWarehouseStore((state) => state.selectedAddress)
  const search = useWarehouseStore((state) => state.search)
  const setSearch = useWarehouseStore((state) => state.setSearch)
  const selectAddress = useWarehouseStore((state) => state.selectAddress)
  const resetView = useWarehouseStore((state) => state.resetView)
  const [searchFeedback, setSearchFeedback] = useState('')

  const summary = useMemo(() => summarizeWarehouse(locations), [locations])
  const selectedLocation = locations.find(
    (location) => location.address === selectedAddress,
  )

  function handleSearch() {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')

    if (!normalizedSearch) {
      setSearchFeedback('Digite um endereço, SKU ou produto.')
      return
    }

    const match = locations.find((location) =>
      [location.address, location.sku, location.description]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('pt-BR').includes(normalizedSearch)),
    )

    if (!match) {
      setSearchFeedback('Nenhum endereço encontrado nos dados demonstrativos.')
      return
    }

    selectAddress(match.address)
    setSearchFeedback(`Localizado: ${match.address}`)
  }

  return (
    <main className="app-shell">
      <section className="viewport" aria-label="Visualização 3D do centro de distribuição">
        <WarehouseScene />
      </section>

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">CD</div>
          <div>
            <strong>CD Digital 3D</strong>
            <span>Gêmeo digital logístico orientado por dados</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="demo-badge">Dados demonstrativos</span>
          <button type="button" className="secondary-button" onClick={resetView}>
            Visão geral
          </button>
        </div>
      </header>

      <section className="control-panel">
        <span className="eyebrow">Resumo operacional</span>
        <div className="summary-grid">
          <SummaryCard label="Endereços" value={summary.total} />
          <SummaryCard label="Ocupação" value={`${summary.occupancyRate}%`} />
          <SummaryCard label="Vazios" value={summary.empty} />
          <SummaryCard label="Divergências" value={summary.divergent} />
        </div>

        <label className="search-field">
          <span>Localizar endereço, SKU ou produto</span>
          <div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch()
              }}
              placeholder="Ex.: A-01-01 ou 10005"
            />
            <button type="button" onClick={handleSearch}>Localizar</button>
          </div>
        </label>
        {searchFeedback && <small className="search-feedback">{searchFeedback}</small>}

        <div className="filters">
          <span>Exibir na cena</span>
          <div>
            <FilterButton status="occupied" />
            <FilterButton status="empty" />
            <FilterButton status="blocked" />
            <FilterButton status="divergent" />
          </div>
        </div>
      </section>

      <div className="scene-hint">
        Arraste para girar · Role para aproximar · Clique em um pallet ou posição
      </div>

      <div className="truth-banner">
        <strong>Protótipo operacional:</strong> geometria e regras são funcionais; o estoque atual é sintético para validação.
      </div>

      {selectedLocation && <LocationDetails location={selectedLocation} />}
    </main>
  )
}
