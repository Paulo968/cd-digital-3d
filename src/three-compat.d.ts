import 'three'

declare module 'three' {
  interface Vector3 {
    toArray(): [number, number, number]
  }
}
