import { type Neighbours, toGlb } from './convert'

/** Converts texture-free models off the main thread; see `convertModel`. */
self.onmessage = async (e: MessageEvent<{ id: number; file: File; neighbours: Neighbours; path: string }>) => {
  const { id, file, neighbours, path } = e.data
  try {
    const glb = await toGlb(file, neighbours, path)
    self.postMessage({ id, glb })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
