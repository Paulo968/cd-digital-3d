import { useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { WarehouseLayout } from '../domain/layout'
import {
  findLocationRow,
  getLoadCenterY,
  getPalletCenterY,
  PALLET_HEIGHT,
} from '../domain/warehouseGeometry'
import { getLocationWorldPoint } from '../domain/routePlanning'
import type { WarehouseLocation } from '../domain/warehouse'
import { useRealisticPalletVisibilityStore } from '../store/realisticPalletVisibilityStore'

const INSTANCE_DUMMY = new THREE.Object3D()
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

function productColor(location: WarehouseLocation): THREE.Color {
  if (location.status === 'divergent') return new THREE.Color('#f59e0b')
  const value = location.sku ?? location.address
  const hash = [...value].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
  return new THREE.Color(PRODUCT_COLORS[hash % PRODUCT_COLORS.length])
}

function configureInstance(
  mesh: THREE.InstancedMesh | null,
  index: number,
  position: THREE.Vector3,
  rotationY: number,
  scale: [number, number, number],
  color?: THREE.Color,
): void {
  if (!mesh) return
  INSTANCE_DUMMY.position.copy(position)
  INSTANCE_DUMMY.rotation.set(0, rotationY, 0)
  INSTANCE_DUMMY.scale.set(...scale)
  INSTANCE_DUMMY.updateMatrix()
  mesh.setMatrixAt(index, INSTANCE_DUMMY.matrix)
  if (color) mesh.setColorAt(index, color)
}

function isOriginalStaticRackLoad(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.InstancedMesh)) return false
  if (object.name.startsWith('outbound-pilot-')) return false
  const material = Array.isArray(object.material)
    ? object.material[0]
    : object.material
  if (!(material instanceof THREE.MeshStandardMaterial)) return false

  const palletMaterial = material.color.getHexString() === '8b5a2b'
  const productMaterial = object.castShadow && material.vertexColors
  return palletMaterial || productMaterial
}

/**
 * A cena principal desenha o inventário como instâncias fixas. Durante o piloto
 * escondemos somente essas duas malhas antigas (pallet e produto) e desenhamos
 * abaixo uma cópia controlável. Estruturas, slots, vigas e endereços continuam
 * intactos.
 */
function StaticRackLoadSuppressor() {
  const { scene, invalidate } = useThree()
  const suppressedRef = useRef<THREE.InstancedMesh[]>([])

  useLayoutEffect(() => {
    const suppress = () => {
      suppressedRef.current.forEach((mesh) => {
        mesh.visible = true
      })
      suppressedRef.current = []
      scene.traverse((object) => {
        if (!isOriginalStaticRackLoad(object)) return
        object.visible = false
        suppressedRef.current.push(object)
      })
      invalidate()
    }

    suppress()
    const frame = window.requestAnimationFrame(suppress)
    const timer = window.setTimeout(suppress, 120)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      suppressedRef.current.forEach((mesh) => {
        mesh.visible = true
      })
      suppressedRef.current = []
      invalidate()
    }
  }, [invalidate, scene])

  return null
}

function ControlledRackInventory({
  layout,
  locations,
}: {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
}) {
  const palletRef = useRef<THREE.InstancedMesh | null>(null)
  const loadRef = useRef<THREE.InstancedMesh | null>(null)
  const hiddenAddresses = useRealisticPalletVisibilityStore(
    (state) => state.hiddenAddresses,
  )
  const occupied = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.quantity > 0 && location.status !== 'blocked',
      ),
    [locations],
  )
  const hiddenSet = useMemo(
    () => new Set(hiddenAddresses),
    [hiddenAddresses],
  )
  const { invalidate } = useThree()

  useLayoutEffect(() => {
    if (!palletRef.current || !loadRef.current) return

    occupied.forEach((location, index) => {
      const row = findLocationRow(layout, location)
      if (!row) return
      const point = getLocationWorldPoint(layout, location)
      const hidden = hiddenSet.has(location.address)
      const loadHeight = location.zone === 'picking' ? 0.58 : 0.92
      const zeroOr = (
        scale: [number, number, number],
      ): [number, number, number] => (hidden ? [0, 0, 0] : scale)

      configureInstance(
        palletRef.current,
        index,
        new THREE.Vector3(
          point.x,
          getPalletCenterY(layout, location),
          point.z,
        ),
        row.rotationY,
        zeroOr([
          row.bayWidth * 0.76,
          PALLET_HEIGHT,
          row.rackDepth * 0.76,
        ]),
      )
      configureInstance(
        loadRef.current,
        index,
        new THREE.Vector3(
          point.x,
          getLoadCenterY(layout, location, loadHeight),
          point.z,
        ),
        row.rotationY,
        zeroOr([
          row.bayWidth * 0.69,
          loadHeight,
          row.rackDepth * 0.69,
        ]),
        productColor(location),
      )
    })

    palletRef.current.instanceMatrix.needsUpdate = true
    loadRef.current.instanceMatrix.needsUpdate = true
    if (loadRef.current.instanceColor) {
      loadRef.current.instanceColor.needsUpdate = true
    }
    invalidate()
  }, [hiddenSet, invalidate, layout, occupied])

  if (occupied.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={palletRef}
        name="outbound-pilot-pallets"
        args={[undefined, undefined, occupied.length]}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
      </instancedMesh>
      <instancedMesh
        ref={loadRef}
        name="outbound-pilot-loads"
        args={[undefined, undefined, occupied.length]}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.68} />
      </instancedMesh>
    </group>
  )
}

export function OutboundPilotRackLayer({
  layout,
  locations,
}: {
  layout: WarehouseLayout
  locations: WarehouseLocation[]
}) {
  return (
    <>
      <StaticRackLoadSuppressor />
      <ControlledRackInventory layout={layout} locations={locations} />
    </>
  )
}
