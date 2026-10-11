import type { MemoryHit } from './types'

/** Ranks items by how many of the query's words they contain. The fallback when embeddings are not available. */
export function keywordSearch<T>(items: T[], textOf: (item: T) => string, query: string, limit: number): MemoryHit<T>[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return items
    .map((item) => {
      const text = textOf(item).toLowerCase()
      return { item, score: terms.filter((term) => text.includes(term)).length / terms.length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
