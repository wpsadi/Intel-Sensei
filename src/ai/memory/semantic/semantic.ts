import { getMemoryDb } from '../db'
import { keywordSearch } from '../search'
import type { SemanticFact } from '../types'
import { indexText, searchByMeaning } from '../vector/meaning'
import { vectorIndex } from '../vector/vector-client'

/** Semantic memory: facts and knowledge. Pinned facts are in every prompt, the others are found by searching. */
export const semanticMemory = {
  async list() {
    const facts = await (await getMemoryDb()).getAll('semantic')
    return facts.sort((a, b) => a.createdAt - b.createdAt)
  },

  async add(text: string, pinned = true) {
    const now = Date.now()
    const fact: SemanticFact = { id: crypto.randomUUID(), text: text.trim(), pinned, createdAt: now, updatedAt: now }
    await (await getMemoryDb()).put('semantic', fact)
    await indexText('semantic', fact.id, fact.text)
    return fact
  },

  /** Rewrites one fact. Returns undefined when the id is unknown. */
  async update(id: string, text: string) {
    const db = await getMemoryDb()
    const fact = await db.get('semantic', id)
    if (!fact) return undefined
    const updated = { ...fact, text: text.trim(), updatedAt: Date.now() }
    await db.put('semantic', updated)
    await indexText('semantic', id, updated.text)
    return updated
  },

  async remove(id: string) {
    await (await getMemoryDb()).delete('semantic', id)
    await vectorIndex.remove('semantic', id).catch(() => {})
  },

  async search(query: string, limit = 5) {
    const db = await getMemoryDb()
    return searchByMeaning({
      kind: 'semantic',
      query,
      limit,
      load: (id) => db.get('semantic', id),
      fallback: async () => keywordSearch(await db.getAll('semantic'), (fact) => fact.text, query, limit),
    })
  },

  /** The pinned facts as a block for the system prompt, or '' when there are none. */
  async toPrompt() {
    const pinned = (await semanticMemory.list()).filter((fact) => fact.pinned)
    if (!pinned.length) return ''
    return `Semantic memory (what you know about the user):\n${pinned.map((fact) => `- [${fact.id}] ${fact.text}`).join('\n')}`
  },
}
