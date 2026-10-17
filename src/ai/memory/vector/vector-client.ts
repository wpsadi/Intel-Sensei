import { and, eq, sql } from 'drizzle-orm'

import { EMBEDDING_DIMENSIONS } from '@/constants/ai'
import { type Executor, getDb } from '@/db/client'
import { memoryVectors } from '@/db/schema'

import type { VectorKind } from '../types'

type Kind = VectorKind

/**
 * Validate vectors before they reach pgvector. PGlite's error for a malformed
 * vector is difficult to act on, and a NaN or zero vector makes cosine scores
 * undefined. Keeping this check at the boundary also protects the SQL literal
 * used by search from non-finite values.
 */
function valuesOf(vector: Float32Array) {
  const values = Array.from(vector)
  if (values.length !== EMBEDDING_DIMENSIONS)
    throw new Error(`Embedding has ${values.length} dimensions; expected ${EMBEDDING_DIMENSIONS}.`)
  if (values.some((value) => !Number.isFinite(value))) throw new Error('Embedding contains a non-finite value.')
  let norm = 0
  for (const value of values) norm += value * value
  if (!Number.isFinite(norm)) throw new Error('Embedding norm is not finite.')
  if (norm === 0) throw new Error('Embedding cannot be the zero vector.')
  return values
}

const literal = (vector: Float32Array) => `[${valuesOf(vector).join(',')}]`

/** pgvector cosine distance is `1 - cosine similarity`; clamp tiny floating
 * point drift so callers always receive a valid cosine score in [-1, 1]. */
const cosineScore = (distance: unknown) => {
  const value = Number(distance)
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, 1 - value)) : -1
}

/** Search over the saved embeddings, in pgvector: each kind has its own HNSW index, queried by cosine distance. */
export const vectorIndex = {
  /** Saves a vector, replacing the one the item had. */
  async upsert(kind: Kind, refId: string, vector: Float32Array, ex?: Executor) {
    valuesOf(vector)
    const db = ex ?? (await getDb())
    const row = { key: `${kind}:${refId}`, kind, refId, embedding: vector }
    await db
      .insert(memoryVectors)
      .values(row)
      .onConflictDoUpdate({ target: memoryVectors.key, set: { embedding: vector } })
  },

  async remove(kind: Kind, refId: string) {
    await (await getDb()).delete(memoryVectors).where(eq(memoryVectors.key, `${kind}:${refId}`))
  },

  /** Whether an item already has a stored embedding. Useful for lazy
   * backfills: vectors survive reloads, while an in-memory cache does not. */
  async has(kind: Kind, refId: string) {
    const rows = await (
      await getDb()
    )
      .select({ key: memoryVectors.key })
      .from(memoryVectors)
      .where(eq(memoryVectors.key, `${kind}:${refId}`))
      .limit(1)
    return rows.length > 0
  },

  /**
   * The nearest ids to the vector, best first. `score` is cosine similarity:
   * 1 is identical and 0 is orthogonal. `offset` lets scoped callers page
   * through the global index when early rows belong to another scope.
   */
  async search(kind: Kind, vector: Float32Array, k = 10, offset = 0): Promise<{ refId: string; score: number }[]> {
    valuesOf(vector)
    const count = Number.isFinite(k) ? Math.max(0, Math.floor(k)) : 0
    const skip = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
    if (!count) return []
    const distance = sql<number>`${memoryVectors.embedding} <=> ${literal(vector)}::vector`
    const rows = await (
      await getDb()
    )
      .select({ refId: memoryVectors.refId, distance })
      .from(memoryVectors)
      .where(and(eq(memoryVectors.kind, kind)))
      .orderBy(distance)
      .limit(count)
      .offset(skip)
    return rows.map((row) => ({ refId: row.refId, score: cosineScore(row.distance) }))
  },

  async size(kind: Kind) {
    const rows = await (
      await getDb()
    )
      .select({ count: sql<number>`count(*)::int` })
      .from(memoryVectors)
      .where(eq(memoryVectors.kind, kind))
    return rows[0]?.count ?? 0
  },
}
