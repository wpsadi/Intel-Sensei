import type { VectorKind } from '../types'
import type { VectorRequest, VectorResponse } from './vector.worker'

type Kind = VectorKind
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./vector.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<VectorResponse>) => {
    const reply = event.data
    const waiting = pending.get(reply.id)
    if (!waiting) return
    pending.delete(reply.id)
    if (reply.ok) waiting.resolve(reply.result)
    else waiting.reject(new Error(reply.error))
  }
  worker.onerror = () => {
    // The worker died: fail what is waiting and start a new one on the next call.
    for (const waiting of pending.values()) waiting.reject(new Error('Vector worker stopped'))
    pending.clear()
    worker = null
  }
  return worker
}

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never

function call<T>(request: Distribute<VectorRequest>) {
  return new Promise<T>((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    getWorker().postMessage({ ...request, id })
  })
}

/** Search over the saved embeddings. The index is built and queried in a Web Worker, so the page never waits on it. */
export const vectorIndex = {
  /** Saves a vector in IndexedDB and adds it to the index. */
  upsert: (kind: Kind, refId: string, vector: Float32Array) => call<null>({ type: 'upsert', kind, refId, vector }),
  remove: (kind: Kind, refId: string) => call<null>({ type: 'remove', kind, refId }),
  /** The `k` nearest ids to the vector, best first. */
  search: (kind: Kind, vector: Float32Array, k = 10) => call<{ refId: string; score: number }[]>({ type: 'search', kind, vector, k }),
  size: (kind: Kind) => call<number>({ type: 'size', kind }),
}
