/// <reference lib="webworker" />
import { vault } from '@/features/vault/vault'

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

/** The page sends its vault state first, and again whenever it changes, so the worker can read and write encrypted vectors. */
export type VaultMessage = { type: 'vault'; key: CryptoKey | null; encrypting: boolean }

export type VectorResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }

const indexes: Record<VectorKind, HnswIndex> = { semantic: new HnswIndex(), episodic: new HnswIndex(), procedural: new HnswIndex() }

/** Builds both indexes from the vectors saved in IndexedDB. Every request waits for this. */
let vaultKnown: () => void
const vaultReady = new Promise<void>((resolve) => (vaultKnown = resolve))

const ready = (async () => {
  await vaultReady
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

self.onmessage = async (event: MessageEvent<VectorRequest | VaultMessage>) => {
  if (event.data.type === 'vault') {
    vault.set({ key: event.data.key, encrypting: event.data.encrypting })
    vaultKnown()
    return
  }
  const { id } = event.data
  try {
    self.postMessage({ id, ok: true, result: await handle(event.data) } satisfies VectorResponse)
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Vector worker failed' } satisfies VectorResponse)
  }
}
