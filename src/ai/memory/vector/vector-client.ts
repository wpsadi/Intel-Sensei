import { and, eq, sql } from 'drizzle-orm'

import { type Executor, getDb } from '@/db/client'
import { memoryVectors } from '@/db/schema'

import type { VectorKind } from '../types'

type Kind = VectorKind

const literal = (vector: Float32Array) => `[${Array.from(vector).join(',')}]`

/** Search over the saved embeddings, in pgvector: each kind has its own HNSW index, queried by cosine distance. */
export const vectorIndex = {
  /** Saves a vector, replacing the one the item had. */
  async upsert(kind: Kind, refId: string, vector: Float32Array, ex?: Executor) {
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

  /** The `k` nearest ids to the vector, best first. `score` is cosine similarity: 1 is identical. */
  async search(kind: Kind, vector: Float32Array, k = 10): Promise<{ refId: string; score: number }[]> {
    const distance = sql<number>`${memoryVectors.embedding} <=> ${literal(vector)}::vector`
    const rows = await (
      await getDb()
    )
      .select({ refId: memoryVectors.refId, distance })
      .from(memoryVectors)
      .where(and(eq(memoryVectors.kind, kind)))
      .orderBy(distance)
      .limit(k)
    return rows.map((row) => ({ refId: row.refId, score: 1 - Number(row.distance) }))
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
