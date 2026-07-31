import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FUTURE_TRANSPALLET_LANE } from '../realistic-v2/compactStagingLayout'

const OVERLAY_NAME = 'future-transpallet-lane'

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    materials.forEach((material) => material.dispose())
  })
}

/**
 * A faixa é adicionada dentro do grupo da Realistic V2. Assim ela participa do
 * mesmo isolamento visual e não interfere no modo operacional.
 */
export function CompactStagingLaneOverlay() {
  const { scene, invalidate } = useThree()

  useLayoutEffect(() => {
    let overlay: THREE.Group | null = null
    let frame = 0

    const mount = () => {
      const root = scene.getObjectByName('realistic-v2-root')
      if (!root) {
        frame = window.requestAnimationFrame(mount)
        return
      }

      const previous = root.getObjectByName(OVERLAY_NAME)
      if (previous) {
        root.remove(previous)
        disposeObject(previous)
      }

      overlay = new THREE.Group()
      overlay.name = OVERLAY_NAME

      const laneMaterial = new THREE.MeshStandardMaterial({
        color: '#0ea5e9',
        transparent: true,
        opacity: 0.16,
        roughness: 0.92,
      })
      const lane = new THREE.Mesh(
        new THREE.BoxGeometry(
          FUTURE_TRANSPALLET_LANE.width,
          0.045,
          FUTURE_TRANSPALLET_LANE.depth,
        ),
        laneMaterial,
      )
      lane.position.set(
        FUTURE_TRANSPALLET_LANE.centerX,
        0.052,
        FUTURE_TRANSPALLET_LANE.centerZ,
      )
      lane.receiveShadow = true
      overlay.add(lane)

      for (const side of [-1, 1]) {
        const boundary = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.055, FUTURE_TRANSPALLET_LANE.depth),
          new THREE.MeshStandardMaterial({
            color: '#38bdf8',
            emissive: '#082f49',
            emissiveIntensity: 0.35,
            roughness: 0.7,
          }),
        )
        boundary.position.set(
          FUTURE_TRANSPALLET_LANE.centerX +
            side * (FUTURE_TRANSPALLET_LANE.width / 2),
          0.06,
          FUTURE_TRANSPALLET_LANE.centerZ,
        )
        overlay.add(boundary)
      }

      const entrance = new THREE.Mesh(
        new THREE.BoxGeometry(FUTURE_TRANSPALLET_LANE.width, 0.06, 0.16),
        new THREE.MeshStandardMaterial({
          color: '#7dd3fc',
          emissive: '#0c4a6e',
          emissiveIntensity: 0.45,
        }),
      )
      entrance.position.set(
        FUTURE_TRANSPALLET_LANE.centerX,
        0.065,
        FUTURE_TRANSPALLET_LANE.entryZ,
      )
      overlay.add(entrance)

      const maneuver = new THREE.Mesh(
        new THREE.RingGeometry(
          FUTURE_TRANSPALLET_LANE.maneuverRadius - 0.12,
          FUTURE_TRANSPALLET_LANE.maneuverRadius,
          40,
        ),
        new THREE.MeshStandardMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        }),
      )
      maneuver.rotation.x = -Math.PI / 2
      maneuver.position.set(
        FUTURE_TRANSPALLET_LANE.centerX,
        0.07,
        FUTURE_TRANSPALLET_LANE.centerZ -
          FUTURE_TRANSPALLET_LANE.depth / 2 +
          FUTURE_TRANSPALLET_LANE.maneuverRadius +
          0.7,
      )
      overlay.add(maneuver)

      root.add(overlay)
      invalidate()
    }

    mount()

    return () => {
      window.cancelAnimationFrame(frame)
      if (overlay?.parent) overlay.parent.remove(overlay)
      if (overlay) disposeObject(overlay)
      invalidate()
    }
  }, [invalidate, scene])

  return null
}
