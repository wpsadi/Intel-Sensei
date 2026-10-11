/// <reference lib="webworker" />
import { getMemoryDb } from '../db'
import type { VectorKind } from '../types'
import { HnswIndex } from './hnsw'

/** What the page asks the worker to do. `id` pairs each request with its reply. */
export type VectorRequest = { id: number } & (
  | { type: 'upsert'; kind: VectorKind; refId: string; vector: Float32Array }
  | { type: 'remove'; kind: VectorKind; refId: string }
  | { type: 'search'; kind: VectorKind; vector: Float32Array; k: number }
  | { type: 'size'; kind: VectorKind }
)

export type VectorResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }

const indexes: Record<VectorKind, HnswIndex> = { semantic: new HnswIndex(), episodic: new HnswIndex(), procedural: new HnswIndex() }

/** Builds both indexes from the vectors saved in IndexedDB. Every request waits for this. */
const ready = (async () => {
  const db = await getMemoryDb()
  for (const record of await db.getAll('vectors')) indexes[record.kind].add(record.refId, record.vector)
})()

async function handle(request: VectorRequest): Promise<unknown> {
  await ready
  const db = await getMemoryDb()
  switch (request.type) {
    case 'upsert':
      await db.put('vectors', { key: `${request.kind}:${request.refId}`, kind: request.kind, refId: request.refId, vector: request.vector })
      indexes[request.kind].add(request.refId, request.vector)
      return null
    case 'remove':
      await db.delete('vectors', `${request.kind}:${request.refId}`)
      indexes[request.kind].remove(request.refId)
      return null
    case 'search':
      return indexes[request.kind].search(request.vector, request.k).map(({ key, score }) => ({ refId: key, score }))
    case 'size':
      return indexes[request.kind].size
  }
}

self.onmessage = async (event: MessageEvent<VectorRequest>) => {
  const { id } = event.data
  try {
    self.postMessage({ id, ok: true, result: await handle(event.data) } satisfies VectorResponse)
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Vector worker failed' } satisfies VectorResponse)
  }
}
