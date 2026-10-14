import { EMBEDDINGS } from '@/ai/inference/embeddings'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'

import type { MemoryHit, VectorKind } from '../types'
import { vectorIndex } from './vector-client'

/** Embeds a text and adds it to the index. When the embedding fails the item is still saved and found by keywords. */
export async function indexText(kind: VectorKind, id: string, text: string) {
  if (!GEMINI_KEY.value) return
  try {
    await vectorIndex.upsert(kind, id, await EMBEDDINGS.embed_v1(text))
  } catch {
    // No embedding for this item yet.
  }
}

/** Finds items closest in meaning to the query. Falls back to `fallback` without a key, when embedding fails, or when nothing is indexed. */
export async function searchByMeaning<T>(options: {
  kind: VectorKind
  query: string
  limit: number
  load: (id: string) => Promise<T | undefined>
  fallback: () => Promise<MemoryHit<T>[]>
}): Promise<MemoryHit<T>[]> {
  const { kind, query, limit, load, fallback } = options
  if (GEMINI_KEY.value) {
    try {
      const nearest = await vectorIndex.search(kind, await EMBEDDINGS.embed_v1(query, 'RETRIEVAL_QUERY'), limit * 4)
      const hits: MemoryHit<T>[] = []
      for (const { refId, score } of nearest) {
        const item = await load(refId)
        if (item) hits.push({ item, score })
      }
      // The index holds every app's memory; `load` drops what is out of scope, so look wider and keep the best.
      if (hits.length) return hits.slice(0, limit)
    } catch {
      // Fall through to the keyword search.
    }
  }
  return fallback()
}
