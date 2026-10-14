import { getMemoryDb } from '../db'
import { keywordSearch } from '../search'
import { ASK_SCOPE, type MemoryScope, type SemanticFact, inScope } from '../types'
import { indexText, searchByMeaning } from '../vector/meaning'
import { vectorIndex } from '../vector/vector-client'

/** Semantic memory: facts and knowledge. Pinned facts are in every prompt, the others are found by searching. */
export const semanticMemory = {
  async list(scope: MemoryScope = ASK_SCOPE) {
    const facts = (await (await getMemoryDb()).getAll('semantic')).filter((fact) => inScope(fact, scope))
    return facts.sort((a, b) => a.createdAt - b.createdAt)
  },

  async add(text: string, pinned = true, scope: MemoryScope = ASK_SCOPE) {
    const now = Date.now()
    const fact: SemanticFact = { id: crypto.randomUUID(), scope, text: text.trim(), pinned, createdAt: now, updatedAt: now }
    await (await getMemoryDb()).put('semantic', fact)
    await indexText('semantic', fact.id, fact.text)
    return fact
  },

  /** Rewrites one fact. Returns undefined when the id is unknown. */
  async update(id: string, text: string, scope: MemoryScope = ASK_SCOPE) {
    const db = await getMemoryDb()
    const fact = await db.get('semantic', id)
    if (!fact || !inScope(fact, scope)) return undefined
    const updated = { ...fact, text: text.trim(), updatedAt: Date.now() }
    await db.put('semantic', updated)
    await indexText('semantic', id, updated.text)
    return updated
  },

  async remove(id: string, scope: MemoryScope = ASK_SCOPE) {
    const db = await getMemoryDb()
    const fact = await db.get('semantic', id)
    if (!fact || !inScope(fact, scope)) return
    await db.delete('semantic', id)
    await vectorIndex.remove('semantic', id).catch(() => {})
  },

  async search(query: string, limit = 5, scope: MemoryScope = ASK_SCOPE) {
    const db = await getMemoryDb()
    return searchByMeaning({
      kind: 'semantic',
      query,
      limit,
      load: async (id) => {
        const fact = await db.get('semantic', id)
        return fact && inScope(fact, scope) ? fact : undefined
      },
      fallback: async () =>
        keywordSearch(
          (await db.getAll('semantic')).filter((fact) => inScope(fact, scope)),
          (fact) => fact.text,
          query,
          limit,
        ),
    })
  },

  /** The pinned facts as a block for the system prompt, or '' when there are none. */
  async toPrompt(scope: MemoryScope = ASK_SCOPE) {
    const pinned = (await semanticMemory.list(scope)).filter((fact) => fact.pinned)
    if (!pinned.length) return ''
    return `Semantic memory (what you know about the user):\n${pinned.map((fact) => `- [${fact.id}] ${fact.text}`).join('\n')}`
  },
}
