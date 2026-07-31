import { useThree } from '@react-three/fiber'
import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import * as THREE from 'three'

function isDescendantOf(
  object: THREE.Object3D,
  ancestor: THREE.Object3D,
): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

function isRenderableObject(object: THREE.Object3D): boolean {
  const candidate = object as THREE.Object3D & {
    isMesh?: boolean
    isLine?: boolean
    isPoints?: boolean
    isSprite?: boolean
  }
  return Boolean(
    candidate.isMesh ||
      candidate.isLine ||
      candidate.isPoints ||
      candidate.isSprite,
  )
}

export function RealisticSceneIsolation({
  children,
}: {
  children: ReactNode
}) {
  const rootRef = useRef<THREE.Group | null>(null)
  const { scene, invalidate } = useThree()

  useLayoutEffect(() => {
    const hidden = new Map<THREE.Object3D, boolean>()

    const isolate = () => {
      const root = rootRef.current
      if (!root) return

      scene.traverse((object: THREE.Object3D) => {
        if (
          !isRenderableObject(object) ||
          isDescendantOf(object, root)
        ) {
          return
        }
        if (!hidden.has(object)) hidden.set(object, object.visible)
        object.visible = false
      })
      invalidate()
    }

    isolate()
    const frame = window.requestAnimationFrame(isolate)
    const timer = window.setTimeout(isolate, 120)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      hidden.forEach((visible, object) => {
        object.visible = visible
      })
      invalidate()
    }
  }, [invalidate, scene])

  return <group ref={rootRef}>{children}</group>
}
