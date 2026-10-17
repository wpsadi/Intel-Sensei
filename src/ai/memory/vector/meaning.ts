import { EMBEDDINGS } from '@/ai/inference/embeddings'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'

import type { MemoryHit, VectorKind } from '../types'
import { vectorIndex } from './vector-client'

/**
 * Embeds a text and adds it to the index. Returns whether an embedding was
 * saved; callers can use this to retry items that were created before a key
 * was configured or while a provider was temporarily unavailable.
 */
export async function indexText(kind: VectorKind, id: string, text: string): Promise<boolean> {
  if (!GEMINI_KEY.value) return false
  try {
    await vectorIndex.upsert(kind, id, await EMBEDDINGS.embed_v1(text))
    return true
  } catch {
    // No embedding for this item yet.
    return false
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
  const wanted = Math.max(0, Math.floor(limit))
  if (!wanted || !query.trim()) return []
  if (GEMINI_KEY.value) {
    try {
      const embedding = await EMBEDDINGS.embed_v1(query, 'RETRIEVAL_QUERY')
      const hits: MemoryHit<T>[] = []
      const seen = new Set<string>()
      // Vectors are shared by scopes, while `load` filters to the caller's
      // scope. Page through the nearest neighbors until enough in-scope items
      // are found; a fixed overfetch could return too few results when another
      // scope has many close vectors.
      const pageSize = Math.max(wanted * 4, 20)
      let offset = 0
      while (hits.length < wanted) {
        const nearest = await vectorIndex.search(kind, embedding, pageSize, offset)
        if (!nearest.length) break
        for (const { refId, score } of nearest) {
          if (seen.has(refId)) continue
          seen.add(refId)
          const item = await load(refId)
          if (item) hits.push({ item, score })
          if (hits.length >= wanted) break
        }
        if (nearest.length < pageSize) break
        offset += nearest.length
      }
      if (hits.length) return hits.slice(0, wanted)
    } catch {
      // Fall through to the keyword search.
    }
  }
  return fallback().then((hits) => hits.slice(0, wanted))
}
