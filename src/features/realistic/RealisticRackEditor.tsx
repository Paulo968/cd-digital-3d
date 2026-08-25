import { OrbitControls, Text, TransformControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import './realistic-rack-editor.css'

type RackTool = 'translate' | 'rotate'

interface RackSpec {
  bays: number
  levels: number
  bayWidth: number
  levelHeight: number
  depth: number
}

const DEFAULT_RACK: RackSpec = {
  bays: 5,
  levels: 4,
  bayWidth: 2.7,
  levelHeight: 1.55,
  depth: 1.1,
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function DiagonalBrace({
  y1,
  z1,
  y2,
  z2,
}: {
  y1: number
  z1: number
  y2: number
  z2: number
}) {
  const length = Math.hypot(y2 - y1, z2 - z1)
  const rotationX = Math.atan2(z2 - z1, y2 - y1)

  return (
    <mesh
      position={[0, (y1 + y2) / 2, (z1 + z2) / 2]}
      rotation={[rotationX, 0, 0]}
      castShadow
    >
      <boxGeometry args={[0.065, length, 0.065]} />
      <meshStandardMaterial color="#2563a6" metalness={0.72} roughness={0.28} />
    </mesh>
  )
}

function UprightFrame({
  x,
  height,
  depth,
  levelHeight,
  levels,
}: {
  x: number
  height: number
  depth: number
  levelHeight: number
  levels: number
}) {
  const innerDepth = Math.max(0.45, depth - 0.16)

  return (
    <group position={[x, 0, 0]}>
      {[-depth / 2, depth / 2].map((z) => (
        <group key={z}>
          <mesh position={[0, height / 2, z]} castShadow>
            <boxGeometry args={[0.13, height, 0.13]} />
            <meshStandardMaterial color="#164e86" metalness={0.72} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.055, z]} castShadow>
            <boxGeometry args={[0.34, 0.11, 0.34]} />
            <meshStandardMaterial color="#1e3a5f" metalness={0.78} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.025, z]}>
            <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.18} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: levels }, (_, index) => {
        const yBottom = 0.18 + index * levelHeight
        const yTop = Math.min(height - 0.18, yBottom + levelHeight * 0.88)
        const reverse = index % 2 === 1
        return (
          <group key={`brace-${index}`}>
            <DiagonalBrace
              y1={yBottom}
              z1={reverse ? innerDepth / 2 : -innerDepth / 2}
              y2={yTop}
              z2={reverse ? -innerDepth / 2 : innerDepth / 2}
            />
            <mesh position={[0, yBottom, 0]} castShadow>
              <boxGeometry args={[0.075, 0.075, innerDepth]} />
              <meshStandardMaterial color="#2563a6" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        )
      })}

      <mesh position={[0, height - 0.1, 0]} castShadow>
        <boxGeometry args={[0.075, 0.075, innerDepth]} />
        <meshStandardMaterial color="#2563a6" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

function RackAssembly({ spec }: { spec: RackSpec }) {
  const length = spec.bays * spec.bayWidth
  const beamHeights = useMemo(
    () => Array.from({ length: spec.levels }, (_, index) => 0.48 + index * spec.levelHeight),
    [spec.levelHeight, spec.levels],
  )
  const height = beamHeights[beamHeights.length - 1] + 0.58

  return (
    <group>
      {Array.from({ length: spec.bays + 1 }, (_, index) => (
        <UprightFrame
          key={`frame-${index}`}
          x={-length / 2 + index * spec.bayWidth}
          height={height}
          depth={spec.depth}
          levelHeight={spec.levelHeight}
          levels={spec.levels}
        />
      ))}

      {beamHeights.flatMap((y, levelIndex) =>
        [-spec.depth / 2, spec.depth / 2].map((z) => (
          <mesh key={`beam-${levelIndex}-${z}`} position={[0, y, z]} castShadow>
            <boxGeometry args={[length, 0.16, 0.12]} />
            <meshStandardMaterial color="#f97316" metalness={0.55} roughness={0.34} />
          </mesh>
        )),
      )}

      {beamHeights.flatMap((y, levelIndex) =>
        Array.from({ length: spec.bays }, (_, bayIndex) => {
          const bayCenter = -length / 2 + spec.bayWidth * (bayIndex + 0.5)
          return [-spec.bayWidth * 0.27, spec.bayWidth * 0.27].map((offset) => (
            <mesh
              key={`support-${levelIndex}-${bayIndex}-${offset}`}
              position={[bayCenter + offset, y + 0.04, 0]}
              castShadow
            >
              <boxGeometry args={[0.075, 0.075, spec.depth * 0.88]} />
              <meshStandardMaterial color="#475569" metalness={0.72} roughness={0.3} />
            </mesh>
          ))
        }).flat(),
      )}

      <mesh position={[0, 0.018, 0]}>
        <boxGeometry args={[length + 0.7, 0.035, spec.depth + 0.7]} />
        <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.5} />
      </mesh>

      <Text
        position={[0, height + 0.48, 0]}
        fontSize={0.34}
        color="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        PORTA-PALETES · {spec.bays} MÓDULOS · {spec.levels} NÍVEIS
      </Text>
    </group>
  )
}

function RackScene({
  spec,
  tool,
  resetToken,
}: {
  spec: RackSpec
  tool: RackTool
  resetToken: number
}) {
  const rackRef = useRef<THREE.Group | null>(null)

  function keepRackOnFloor() {
    const rack = rackRef.current
    if (!rack) return
    rack.position.y = 0
    rack.rotation.x = 0
    rack.rotation.z = 0
  }

  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [12, 9, 14], fov: 42, near: 0.1, far: 120 }}
    >
      <color attach="background" args={['#dfe5ea']} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#ffffff', '#64748b', 1.25]} />
      <directionalLight
        position={[9, 15, 10]}
        intensity={2.3}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[52, 40]} />
        <meshStandardMaterial color="#cbd2d8" roughness={0.94} />
      </mesh>
      <gridHelper args={[48, 48, '#7c8b99', '#b5c0ca']} position={[0, 0.012, 0]} />

      <TransformControls
        key={resetToken}
        mode={tool}
        translationSnap={0.5}
        rotationSnap={Math.PI / 12}
        size={0.8}
        onObjectChange={keepRackOnFloor}
      >
        <group ref={rackRef}>
          <RackAssembly spec={spec} />
        </group>
      </TransformControls>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={45}
        maxPolarAngle={Math.PI / 2.02}
      />
    </Canvas>
  )
}

function NumberField({
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
}: {
  label: string
  value: number
  minimum: number
  maximum: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="rack-field">
      <span>{label}</span>
      <input
        type="number"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          if (Number.isFinite(parsed)) onChange(clamp(parsed, minimum, maximum))
        }}
      />
    </label>
  )
}

export function RealisticRackEditor() {
  const [spec, setSpec] = useState<RackSpec>(DEFAULT_RACK)
  const [tool, setTool] = useState<RackTool>('translate')
  const [resetToken, setResetToken] = useState(0)
  const totalLength = spec.bays * spec.bayWidth
  const totalHeight = 0.48 + (spec.levels - 1) * spec.levelHeight + 0.58

  function updateSpec<Key extends keyof RackSpec>(key: Key, value: RackSpec[Key]) {
    setSpec((current) => ({ ...current, [key]: value }))
  }

  function restoreDefault() {
    setSpec(DEFAULT_RACK)
    setTool('translate')
    setResetToken((token) => token + 1)
  }

  return (
    <section className="realistic-rack-editor">
      <div className="rack-editor-viewport">
        <div className="rack-editor-toolbar" aria-label="Ferramentas do porta-paletes">
          <button
            type="button"
            className={tool === 'translate' ? 'active' : ''}
            onClick={() => setTool('translate')}
          >
            ↔ Mover
          </button>
          <button
            type="button"
            className={tool === 'rotate' ? 'active' : ''}
            onClick={() => setTool('rotate')}
          >
            ↻ Girar
          </button>
          <button type="button" onClick={() => setResetToken((token) => token + 1)}>
            Centralizar
          </button>
        </div>

        <RackScene spec={spec} tool={tool} resetToken={resetToken} />

        <div className="rack-editor-hint">
          Use as setas coloridas para mover · Use o anel para girar · Arraste o fundo para olhar
        </div>
      </div>

      <aside className="rack-properties" aria-label="Propriedades do porta-paletes">
        <div className="rack-properties-heading">
          <div>
            <span>Objeto selecionado</span>
            <h1>Porta-paletes seletivo</h1>
          </div>
          <i aria-hidden="true" />
        </div>

        <p className="rack-editor-note">
          Editor parado. Nenhuma empilhadeira, caminhão ou animação está rodando.
        </p>

        <div className="rack-metrics">
          <div>
            <span>Comprimento</span>
            <strong>{totalLength.toFixed(2)} m</strong>
          </div>
          <div>
            <span>Altura</span>
            <strong>{totalHeight.toFixed(2)} m</strong>
          </div>
          <div>
            <span>Posições</span>
            <strong>{spec.bays * spec.levels}</strong>
          </div>
        </div>

        <div className="rack-fields-grid">
          <NumberField
            label="Módulos"
            value={spec.bays}
            minimum={1}
            maximum={12}
            step={1}
            onChange={(value) => updateSpec('bays', Math.round(value))}
          />
          <NumberField
            label="Níveis"
            value={spec.levels}
            minimum={2}
            maximum={8}
            step={1}
            onChange={(value) => updateSpec('levels', Math.round(value))}
          />
          <NumberField
            label="Largura do módulo (m)"
            value={spec.bayWidth}
            minimum={1.8}
            maximum={3.4}
            step={0.05}
            onChange={(value) => updateSpec('bayWidth', value)}
          />
          <NumberField
            label="Altura entre níveis (m)"
            value={spec.levelHeight}
            minimum={1.05}
            maximum={2.2}
            step={0.05}
            onChange={(value) => updateSpec('levelHeight', value)}
          />
          <NumberField
            label="Profundidade (m)"
            value={spec.depth}
            minimum={0.8}
            maximum={1.6}
            step={0.05}
            onChange={(value) => updateSpec('depth', value)}
          />
        </div>

        <div className="rack-structure-list">
          <strong>Estrutura incluída</strong>
          <span>Montantes duplos com sapatas</span>
          <span>Diagonais e travessas laterais</span>
          <span>Longarinas dianteiras e traseiras</span>
          <span>Suportes internos para pallets</span>
          <span>Encaixe de movimento em grade de 50 cm</span>
        </div>

        <button type="button" className="rack-reset-button" onClick={restoreDefault}>
          Restaurar porta-paletes padrão
        </button>
      </aside>
    </section>
  )
}
