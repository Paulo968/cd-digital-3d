import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, OrbitControls, Text } from '@react-three/drei'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ElementRef,
} from 'react'
import * as THREE from 'three'
import { importInventoryCsv } from './domain/importInventoryCsv'
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
import './experience.css'

const BAY_WIDTH = 2.25
const LEVEL_HEIGHT = 1.45
const RACK_DEPTH = 1.25
const AISLE_WIDTH = 4.2
const AISLE_PITCH = AISLE_WIDTH + RACK_DEPTH * 2 + 1.4
const RACK_LENGTH = WAREHOUSE_CONFIG.baysPerSide * BAY_WIDTH
const FLOOR_LENGTH = RACK_LENGTH + 8
const FLOOR_WIDTH = WAREHOUSE_CONFIG.aisles.length * AISLE_PITCH + 8
const RACK_HEIGHT = WAREHOUSE_CONFIG.levels * LEVEL_HEIGHT + 0.55
const DEFAULT_CAMERA = new THREE.Vector3(27, 22, 35)
const DEFAULT_TARGET = new THREE.Vector3(0, 3.2, 0)

const STATUS_COLOR: Record<SlotStatus, string> = {
  occupied: '#38bdf8',
  empty: '#64748b',
  blocked: '#ef4444',
  divergent: '#f59e0b',
}

const PRODUCT_COLORS = [
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#c084fc',
]

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
  const x = (location.bay - 0.5) * BAY_WIDTH - RACK_LENGTH / 2
  const sideDirection = location.side === 'left' ? -1 : 1
  const z =
    getAisleCenterZ(location.aisle) +
    sideDirection * (AISLE_WIDTH / 2 + RACK_DEPTH / 2)
  const y = (location.level - 0.5) * LEVEL_HEIGHT + 0.25

  return new THREE.Vector3(x, y, z)
}

function normalizeAddressInput(value: string): string | null {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[./_]/g, '-')
  const match = compact.match(/^([A-G])-?(\d{1,2})-?(\d{1,2})$/)

  if (!match) return null

  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function formatDateTime(value?: string): string {
  if (!value) return 'Não confirmada'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function productColor(location: WarehouseLocation): string {
  if (location.status === 'divergent') return '#f59e0b'
  if (!location.sku) return '#94a3b8'

  const hash = [...location.sku].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
  return PRODUCT_COLORS[hash % PRODUCT_COLORS.length]
}

function RackStructure({ aisle, side }: { aisle: string; side: SlotSide }) {
  const sideDirection = side === 'left' ? -1 : 1
  const centerZ =
    getAisleCenterZ(aisle) +
    sideDirection * (AISLE_WIDTH / 2 + RACK_DEPTH / 2)

  return (
    <group position={[0, 0, centerZ]}>
      {Array.from({ length: WAREHOUSE_CONFIG.baysPerSide + 1 }, (_, index) => {
        const x = index * BAY_WIDTH - RACK_LENGTH / 2

        return (
          <group key={`frame-${index}`} position={[x, 0, 0]}>
            <mesh position={[0, RACK_HEIGHT / 2, -RACK_DEPTH / 2]} castShadow>
              <boxGeometry args={[0.12, RACK_HEIGHT, 0.12]} />
              <meshStandardMaterial color="#334155" metalness={0.65} roughness={0.35} />
            </mesh>
            <mesh position={[0, RACK_HEIGHT / 2, RACK_DEPTH / 2]} castShadow>
              <boxGeometry args={[0.12, RACK_HEIGHT, 0.12]} />
              <meshStandardMaterial color="#334155" metalness={0.65} roughness={0.35} />
            </mesh>
            <mesh
              position={[0, RACK_HEIGHT / 2, 0]}
              rotation={[0, 0, index % 2 === 0 ? 0.33 : -0.33]}
            >
              <boxGeometry args={[0.07, RACK_HEIGHT * 0.78, 0.07]} />
              <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        )
      })}

      {Array.from({ length: WAREHOUSE_CONFIG.levels }, (_, index) => {
        const y = index * LEVEL_HEIGHT + 0.15

        return (
          <group key={`beam-${index}`} position={[0, y, 0]}>
            <mesh position={[0, 0, -RACK_DEPTH / 2]} castShadow>
              <boxGeometry args={[RACK_LENGTH, 0.11, 0.11]} />
              <meshStandardMaterial color="#f97316" metalness={0.45} roughness={0.42} />
            </mesh>
            <mesh position={[0, 0, RACK_DEPTH / 2]} castShadow>
              <boxGeometry args={[RACK_LENGTH, 0.11, 0.11]} />
              <meshStandardMaterial color="#f97316" metalness={0.45} roughness={0.42} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function SelectionBeacon({ address, color }: { address: string; color: string }) {
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 4.2) * 0.12
    ringRef.current.scale.setScalar(pulse)
    ringRef.current.rotation.z += 0.012
  })

  return (
    <group>
      <mesh ref={ringRef} position={[0, -0.53, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.92, 0.055, 10, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
      <pointLight position={[0, 0.5, 0]} color={color} intensity={2.1} distance={5} />
      <Billboard position={[0, 1.35, 0]} follow>
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[2.25, 0.58]} />
          <meshBasicMaterial color="#07111f" transparent opacity={0.94} />
        </mesh>
        <Text
          fontSize={0.31}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.025}
          outlineColor="#000000"
        >
          {address}
        </Text>
      </Billboard>
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
  const statusColor = STATUS_COLOR[location.status]
  const isOccupied =
    location.status === 'occupied' || location.status === 'divergent'
  const loadHeight = location.zone === 'picking' ? 0.58 : 0.92
  const loadColor = productColor(location)

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
          color={selected ? '#f8fafc' : statusColor}
          transparent
          opacity={location.status === 'empty' ? 0.18 : 0.3}
          wireframe={location.status === 'empty'}
        />
      </mesh>

      {isOccupied && (
        <>
          <mesh position={[0, -0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[BAY_WIDTH * 0.76, 0.12, RACK_DEPTH * 0.76]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.84} />
          </mesh>
          <mesh
            position={[0, -0.29 + loadHeight / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[BAY_WIDTH * 0.69, loadHeight, RACK_DEPTH * 0.69]} />
            <meshStandardMaterial
              color={loadColor}
              emissive={selected ? statusColor : '#000000'}
              emissiveIntensity={selected ? 0.28 : 0}
              roughness={0.68}
              metalness={0.02}
            />
          </mesh>
          <mesh position={[0, -0.01, RACK_DEPTH * 0.355]}>
            <boxGeometry args={[BAY_WIDTH * 0.58, 0.1, 0.025]} />
            <meshBasicMaterial color={statusColor} />
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

      {selected && <SelectionBeacon address={location.address} color={statusColor} />}
    </group>
  )
}

function FloorAddressLabels({ aisle }: { aisle: string }) {
  const centerZ = getAisleCenterZ(aisle)

  return (
    <group>
      {Array.from({ length: WAREHOUSE_CONFIG.baysPerSide }, (_, bayIndex) => {
        const bay = bayIndex + 1
        const x = (bay - 0.5) * BAY_WIDTH - RACK_LENGTH / 2
        const odd = String(bay * 2 - 1).padStart(2, '0')
        const even = String(bay * 2).padStart(2, '0')

        return (
          <group key={`${aisle}-${bay}`}>
            <Text
              position={[x, 0.035, centerZ - AISLE_WIDTH / 2 + 0.33]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.28}
              color="#f8fafc"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.018}
              outlineColor="#07111f"
            >
              {odd}
            </Text>
            <Text
              position={[x, 0.035, centerZ + AISLE_WIDTH / 2 - 0.33]}
              rotation={[-Math.PI / 2, 0, Math.PI]}
              fontSize={0.28}
              color="#f8fafc"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.018}
              outlineColor="#07111f"
            >
              {even}
            </Text>
          </group>
        )
      })}
    </group>
  )
}

function Aisle({
  aisle,
  locations,
}: {
  aisle: string
  locations: WarehouseLocation[]
}) {
  const centerZ = getAisleCenterZ(aisle)
  const selectedAddress = useWarehouseStore((state) => state.selectedAddress)

  return (
    <group>
      <RackStructure aisle={aisle} side="left" />
      <RackStructure aisle={aisle} side="right" />

      <mesh position={[0, 0.018, centerZ]} receiveShadow>
        <boxGeometry args={[FLOOR_LENGTH - 0.6, 0.035, AISLE_WIDTH]} />
        <meshStandardMaterial color="#27313b" roughness={0.96} />
      </mesh>

      {[-1, 1].map((direction) => (
        <mesh
          key={`safety-${direction}`}
          position={[0, 0.045, centerZ + direction * (AISLE_WIDTH / 2 - 0.08)]}
        >
          <boxGeometry args={[FLOOR_LENGTH - 0.9, 0.025, 0.09]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      ))}

      <FloorAddressLabels aisle={aisle} />

      <group position={[-FLOOR_LENGTH / 2 + 0.48, 0, centerZ]}>
        <mesh position={[0, 1.55, 0]} castShadow>
          <boxGeometry args={[0.1, 3.1, 0.1]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} />
        </mesh>
        <Billboard position={[0, 2.75, 0]} follow>
          <mesh>
            <planeGeometry args={[2.15, 0.82]} />
            <meshStandardMaterial color="#075985" roughness={0.45} />
          </mesh>
          <Text
            position={[0, 0, 0.015]}
            fontSize={0.38}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#082f49"
          >
            RUA {aisle}
          </Text>
        </Billboard>
      </group>

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

function FloorZone({
  position,
  label,
  color,
}: {
  position: [number, number, number]
  label: string
  color: string
}) {
  return (
    <group position={position}>
      <mesh receiveShadow>
        <boxGeometry args={[4.2, 0.035, 2.2]} />
        <meshStandardMaterial color={color} transparent opacity={0.25} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[4.35, 0.018, 0.08]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text
        position={[0, 0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.42}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.025}
        outlineColor="#07111f"
      >
        {label}
      </Text>
    </group>
  )
}

function Forklift() {
  const x = FLOOR_LENGTH / 2 + 1.2
  const z = -FLOOR_WIDTH / 2 + 2.4

  return (
    <group position={[x, 0.18, z]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[1.45, 0.75, 1.05]} />
        <meshStandardMaterial color="#eab308" roughness={0.48} metalness={0.18} />
      </mesh>
      <mesh position={[-0.08, 1.08, 0]} castShadow>
        <boxGeometry args={[0.82, 0.7, 0.9]} />
        <meshStandardMaterial color="#1e293b" transparent opacity={0.78} />
      </mesh>
      {[[-0.48, 0.1, -0.48], [-0.48, 0.1, 0.48], [0.48, 0.1, -0.48], [0.48, 0.1, 0.48]].map(
        (wheel, index) => (
          <mesh
            key={index}
            position={wheel as [number, number, number]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.23, 0.23, 0.16, 18]} />
            <meshStandardMaterial color="#111827" roughness={0.92} />
          </mesh>
        ),
      )}
      <mesh position={[-0.9, 1.15, -0.38]} castShadow>
        <boxGeometry args={[0.1, 2.3, 0.1]} />
        <meshStandardMaterial color="#334155" metalness={0.65} />
      </mesh>
      <mesh position={[-0.9, 1.15, 0.38]} castShadow>
        <boxGeometry args={[0.1, 2.3, 0.1]} />
        <meshStandardMaterial color="#334155" metalness={0.65} />
      </mesh>
      <mesh position={[-1.45, 0.12, -0.25]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.11]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} />
      </mesh>
      <mesh position={[-1.45, 0.12, 0.25]} castShadow>
        <boxGeometry args={[1.2, 0.08, 0.11]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} />
      </mesh>
    </group>
  )
}

function WarehouseShell() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_LENGTH + 10, FLOOR_WIDTH + 10]} />
        <meshStandardMaterial color="#171d23" roughness={0.98} />
      </mesh>

      <mesh position={[0, 6, -FLOOR_WIDTH / 2 - 4.8]} receiveShadow>
        <boxGeometry args={[FLOOR_LENGTH + 10, 12, 0.25]} />
        <meshStandardMaterial color="#26323d" roughness={0.82} />
      </mesh>
      <mesh position={[-FLOOR_LENGTH / 2 - 4.8, 6, 0]} receiveShadow>
        <boxGeometry args={[0.25, 12, FLOOR_WIDTH + 10]} />
        <meshStandardMaterial color="#26323d" roughness={0.82} />
      </mesh>
      <mesh position={[FLOOR_LENGTH / 2 + 4.8, 6, 0]} receiveShadow>
        <boxGeometry args={[0.25, 12, FLOOR_WIDTH + 10]} />
        <meshStandardMaterial color="#26323d" roughness={0.82} />
      </mesh>

      {WAREHOUSE_CONFIG.aisles.map((aisle) => (
        <mesh
          key={`light-${aisle}`}
          position={[0, RACK_HEIGHT + 2.1, getAisleCenterZ(aisle)]}
        >
          <boxGeometry args={[RACK_LENGTH * 0.86, 0.09, 0.38]} />
          <meshStandardMaterial
            color="#f8fafc"
            emissive="#dbeafe"
            emissiveIntensity={2.2}
          />
        </mesh>
      ))}

      <FloorZone
        position={[-FLOOR_LENGTH / 2 - 1.5, 0.045, FLOOR_WIDTH / 2 - 2.4]}
        label="RECEBIMENTO"
        color="#22c55e"
      />
      <FloorZone
        position={[FLOOR_LENGTH / 2 + 1.5, 0.045, FLOOR_WIDTH / 2 - 2.4]}
        label="EXPEDIÇÃO"
        color="#38bdf8"
      />
      <Forklift />
    </group>
  )
}

function CameraRig({
  selectedLocation,
  focusToken,
  resetToken,
}: {
  selectedLocation?: WarehouseLocation
  focusToken: number
  resetToken: number
}) {
  const controlsRef = useRef<ElementRef<typeof OrbitControls>>(null)
  const { camera } = useThree()
  const desiredTarget = useRef(DEFAULT_TARGET.clone())
  const desiredCamera = useRef(DEFAULT_CAMERA.clone())
  const animating = useRef(true)
  const initialized = useRef(false)
  const previousResetToken = useRef(resetToken)

  useEffect(() => {
    const resetRequested = resetToken !== previousResetToken.current

    if (selectedLocation) {
      const slotPosition = getSlotPosition(selectedLocation)
      const aisleCenter = getAisleCenterZ(selectedLocation.aisle)
      const approachDirection = selectedLocation.side === 'left' ? 1 : -1

      desiredTarget.current.copy(slotPosition)
      desiredCamera.current.set(
        slotPosition.x + 4.6,
        Math.max(slotPosition.y + 2.8, 3.8),
        aisleCenter + approachDirection * 3.2,
      )
      animating.current = true
    } else if (!initialized.current || resetRequested) {
      desiredTarget.current.copy(DEFAULT_TARGET)
      desiredCamera.current.copy(DEFAULT_CAMERA)
      animating.current = true
    }

    initialized.current = true
    previousResetToken.current = resetToken
  }, [selectedLocation, focusToken, resetToken])

  useFrame(() => {
    if (!animating.current || !controlsRef.current) return

    camera.position.lerp(desiredCamera.current, 0.085)
    controlsRef.current.target.lerp(desiredTarget.current, 0.1)
    controlsRef.current.update()

    const cameraReady = camera.position.distanceTo(desiredCamera.current) < 0.035
    const targetReady =
      controlsRef.current.target.distanceTo(desiredTarget.current) < 0.035

    if (cameraReady && targetReady) animating.current = false
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      enablePan
      screenSpacePanning
      dampingFactor={0.07}
      rotateSpeed={0.72}
      panSpeed={0.9}
      zoomSpeed={0.9}
      minDistance={2.1}
      maxDistance={95}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI / 2.02}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      onStart={() => {
        animating.current = false
      }}
    />
  )
}

function WarehouseScene({
  focusToken,
  resetToken,
}: {
  focusToken: number
  resetToken: number
}) {
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
      dpr={[1, 1.55]}
      camera={{ position: DEFAULT_CAMERA.toArray(), fov: 47, near: 0.1, far: 220 }}
      onPointerMissed={() => selectAddress(null)}
    >
      <color attach="background" args={['#111820']} />
      <fog attach="fog" args={['#111820', 48, 125]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#eef6ff', '#1f2937', 1.05]} />
      <directionalLight
        position={[24, 32, 18]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <WarehouseShell />

      {WAREHOUSE_CONFIG.aisles.map((aisle) => (
        <Aisle
          key={aisle}
          aisle={aisle}
          locations={visibleLocations.filter(
            (location) => location.aisle === aisle,
          )}
        />
      ))}

      <CameraRig
        selectedLocation={selectedLocation}
        focusToken={focusToken}
        resetToken={resetToken}
      />
    </Canvas>
  )
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
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
      <span
        className="status-dot"
        style={{ backgroundColor: STATUS_COLOR[status] }}
      />
      {SLOT_STATUS_LABEL[status]}
    </button>
  )
}

function LocationDetails({
  location,
  onFocus,
}: {
  location: WarehouseLocation
  onFocus: () => void
}) {
  const selectAddress = useWarehouseStore((state) => state.selectAddress)

  return (
    <aside className="details-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Endereço selecionado</span>
          <h2>{location.address}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => selectAddress(null)}
          aria-label="Fechar detalhes"
        >
          ×
        </button>
      </div>

      <button type="button" className="focus-location-button" onClick={onFocus}>
        Focar esta posição no 3D
      </button>

      <div className="status-line">
        <span
          className="status-dot large"
          style={{ backgroundColor: STATUS_COLOR[location.status] }}
        />
        <div>
          <strong>{SLOT_STATUS_LABEL[location.status]}</strong>
          <small>{CONFIRMATION_LABEL[location.confirmation]}</small>
        </div>
      </div>

      <dl className="details-grid">
        <div>
          <dt>Rua</dt>
          <dd>{location.aisle}</dd>
        </div>
        <div>
          <dt>Lado</dt>
          <dd>
            {location.side === 'left'
              ? 'Esquerdo — ímpar'
              : 'Direito — par'}
          </dd>
        </div>
        <div>
          <dt>Posição</dt>
          <dd>{String(location.position).padStart(2, '0')}</dd>
        </div>
        <div>
          <dt>Nível</dt>
          <dd>{location.level}</dd>
        </div>
        <div>
          <dt>Zona</dt>
          <dd>{location.zone === 'picking' ? 'Picking' : 'Reserva'}</dd>
        </div>
        <div>
          <dt>SKU</dt>
          <dd>{location.sku ?? '—'}</dd>
        </div>
        <div className="wide">
          <dt>Produto</dt>
          <dd>{location.description ?? 'Posição sem produto informado'}</dd>
        </div>
        <div>
          <dt>Quantidade</dt>
          <dd>{location.quantity}</dd>
        </div>
        <div>
          <dt>Capacidade</dt>
          <dd>{location.capacity}</dd>
        </div>
        <div>
          <dt>Lote</dt>
          <dd>{location.lot ?? '—'}</dd>
        </div>
        <div className="wide">
          <dt>Última confirmação física</dt>
          <dd>{formatDateTime(location.lastCheckedAt)}</dd>
        </div>
      </dl>

      <p className="truth-note">
        A cena representa os dados carregados. Uma posição vazia no sistema só
        se torna “vazia confirmada” após conferência física registrada.
      </p>
    </aside>
  )
}

export default function AppV2() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const locations = useWarehouseStore((state) => state.locations)
  const dataSource = useWarehouseStore((state) => state.dataSource)
  const importSummary = useWarehouseStore((state) => state.importSummary)
  const selectedAddress = useWarehouseStore((state) => state.selectedAddress)
  const search = useWarehouseStore((state) => state.search)
  const setSearch = useWarehouseStore((state) => state.setSearch)
  const selectAddress = useWarehouseStore((state) => state.selectAddress)
  const resetView = useWarehouseStore((state) => state.resetView)
  const loadImportedWarehouse = useWarehouseStore(
    (state) => state.loadImportedWarehouse,
  )
  const loadDemoWarehouse = useWarehouseStore(
    (state) => state.loadDemoWarehouse,
  )

  const [searchFeedback, setSearchFeedback] = useState('')
  const [importFeedback, setImportFeedback] = useState('')
  const [focusToken, setFocusToken] = useState(0)
  const [resetToken, setResetToken] = useState(0)
  const [navAisle, setNavAisle] = useState('A')
  const [navPosition, setNavPosition] = useState('01')
  const [navLevel, setNavLevel] = useState('01')

  const summary = useMemo(() => summarizeWarehouse(locations), [locations])
  const selectedLocation = locations.find(
    (location) => location.address === selectedAddress,
  )

  function focusAddress(address: string, feedback?: string) {
    const match = locations.find((location) => location.address === address)

    if (!match) {
      setSearchFeedback(`O endereço ${address} não existe nos dados carregados.`)
      return
    }

    selectAddress(match.address)
    setFocusToken((value) => value + 1)
    setSearchFeedback(feedback ?? `Localizado: ${match.address}`)
  }

  function handleSearch() {
    const rawSearch = search.trim()

    if (!rawSearch) {
      setSearchFeedback('Digite um endereço, SKU ou produto.')
      return
    }

    const normalizedAddress = normalizeAddressInput(rawSearch)
    if (normalizedAddress) {
      focusAddress(normalizedAddress)
      return
    }

    const normalizedSearch = rawSearch.toLocaleLowerCase('pt-BR')
    const match = locations.find((location) =>
      [location.sku, location.description]
        .filter(Boolean)
        .some((value) =>
          value!.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
        ),
    )

    if (!match) {
      setSearchFeedback('Nenhum endereço, SKU ou produto foi encontrado.')
      return
    }

    focusAddress(match.address, `Produto localizado em ${match.address}`)
  }

  function handleStructuredNavigation() {
    focusAddress(`${navAisle}-${navPosition}-${navLevel}`)
  }

  async function handleInventoryFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.csv')) {
      setImportFeedback('Nesta etapa, envie um arquivo CSV. Excel entra no próximo marco.')
      return
    }

    try {
      const result = importInventoryCsv(await file.text())

      if (result.importedRows === 0) {
        setImportFeedback(
          result.issues[0]?.message ?? 'Nenhuma linha válida foi encontrada.',
        )
        return
      }

      loadImportedWarehouse(result.locations, {
        fileName: file.name,
        rowsRead: result.rowsRead,
        importedRows: result.importedRows,
        issueCount: result.issues.length,
      })

      setImportFeedback(
        `${result.importedRows} linha(s) aplicada(s). ${result.issues.length} inconsistência(s) identificada(s).`,
      )
      setResetToken((value) => value + 1)
    } catch {
      setImportFeedback('Não foi possível ler o arquivo. Verifique o formato do CSV.')
    }
  }

  function restoreDemo() {
    loadDemoWarehouse()
    setImportFeedback('Dados demonstrativos restaurados.')
    setResetToken((value) => value + 1)
  }

  function handleResetView() {
    resetView()
    setResetToken((value) => value + 1)
  }

  return (
    <main className="app-shell">
      <section
        className="viewport"
        aria-label="Visualização 3D do centro de distribuição"
      >
        <WarehouseScene focusToken={focusToken} resetToken={resetToken} />
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
          <span className={`demo-badge ${dataSource === 'csv' ? 'is-live-data' : ''}`}>
            {dataSource === 'csv' ? 'CSV importado' : 'Dados demonstrativos'}
          </span>
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept=".csv,text/csv"
            onChange={handleInventoryFile}
          />
          <button
            type="button"
            className="primary-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Importar CSV
          </button>
          {dataSource === 'csv' && (
            <button type="button" className="secondary-button" onClick={restoreDemo}>
              Voltar ao demo
            </button>
          )}
          <button type="button" className="secondary-button" onClick={handleResetView}>
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
              placeholder="Ex.: A-01-01, A-1-1 ou 10005"
            />
            <button type="button" onClick={handleSearch}>
              Localizar
            </button>
          </div>
        </label>
        <small className="address-format">
          Padrão: Rua – Posição – Nível. Exemplo: A-01-01.
        </small>
        {searchFeedback && (
          <small className="search-feedback">{searchFeedback}</small>
        )}

        <div className="address-navigator">
          <span>Ir direto para uma posição</span>
          <div>
            <label>
              Rua
              <select value={navAisle} onChange={(event) => setNavAisle(event.target.value)}>
                {WAREHOUSE_CONFIG.aisles.map((aisle) => (
                  <option key={aisle} value={aisle}>
                    {aisle}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Posição
              <select
                value={navPosition}
                onChange={(event) => setNavPosition(event.target.value)}
              >
                {Array.from({ length: 16 }, (_, index) =>
                  String(index + 1).padStart(2, '0'),
                ).map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nível
              <select value={navLevel} onChange={(event) => setNavLevel(event.target.value)}>
                {Array.from({ length: 7 }, (_, index) =>
                  String(index + 1).padStart(2, '0'),
                ).map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={handleStructuredNavigation}>
              Ir
            </button>
          </div>
        </div>

        <div className="filters">
          <span>Exibir na cena</span>
          <div>
            <FilterButton status="occupied" />
            <FilterButton status="empty" />
            <FilterButton status="blocked" />
            <FilterButton status="divergent" />
          </div>
        </div>

        <div className="import-box">
          <div>
            <span className="eyebrow">Entrada de dados</span>
            <strong>
              {importSummary?.fileName ?? 'Modelo CSV disponível para teste'}
            </strong>
          </div>
          <a
            href={`${import.meta.env.BASE_URL}sample-inventory.csv`}
            download="sample-inventory.csv"
          >
            Baixar exemplo
          </a>
          {importSummary && (
            <small>
              {importSummary.importedRows}/{importSummary.rowsRead} linhas aplicadas ·{' '}
              {importSummary.issueCount} inconsistência(s)
            </small>
          )}
          {importFeedback && <small>{importFeedback}</small>}
        </div>
      </section>

      <div className="scene-hint scene-hint-desktop">
        Esquerdo: girar · Direito: mover · Scroll: zoom · Clique: consultar
      </div>
      <div className="scene-hint scene-hint-mobile">
        1 dedo: girar · 2 dedos: mover e aproximar
      </div>

      <div className="truth-banner">
        <strong>
          {dataSource === 'csv' ? 'Dados importados:' : 'Protótipo operacional:'}
        </strong>{' '}
        {dataSource === 'csv'
          ? 'a cena representa o conteúdo do CSV; confirmação física continua sendo um evento separado.'
          : 'geometria e regras são funcionais; o estoque atual é sintético para validação.'}
      </div>

      {selectedLocation && (
        <LocationDetails
          location={selectedLocation}
          onFocus={() => setFocusToken((value) => value + 1)}
        />
      )}
    </main>
  )
}
