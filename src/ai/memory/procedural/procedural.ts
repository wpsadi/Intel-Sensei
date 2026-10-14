import { getMemoryDb } from '../db'
import { keywordSearch } from '../search'
import { ASK_SCOPE, type MemoryScope, type Procedure, inScope } from '../types'
import { indexText, searchByMeaning } from '../vector/meaning'
import { vectorIndex } from '../vector/vector-client'

/** How many of the latest procedures go into the prompt. The rest are found by searching. */
export const PROCEDURE_PROMPT_LIMIT = 15

/** Procedural memory: how the user wants things done, such as a format, a tone or a routine to follow. */
export const proceduralMemory = {
  async list(scope: MemoryScope = ASK_SCOPE) {
    const procedures = (await (await getMemoryDb()).getAll('procedures')).filter((item) => inScope(item, scope))
    return procedures.sort((a, b) => b.updatedAt - a.updatedAt)
  },

  /** Saves a procedure. A procedure with the same name is replaced. */
  async save(name: string, instructions: string, scope: MemoryScope = ASK_SCOPE) {
    const db = await getMemoryDb()
    const now = Date.now()
    const existing = (await db.getAll('procedures')).find(
      (item) => inScope(item, scope) && item.name.toLowerCase() === name.trim().toLowerCase(),
    )
    const procedure: Procedure = {
      id: existing?.id ?? crypto.randomUUID(),
      scope,
      name: name.trim(),
      instructions: instructions.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.put('procedures', procedure)
    await indexText('procedural', procedure.id, `${procedure.name}: ${procedure.instructions}`)
    return procedure
  },

  async remove(id: string, scope: MemoryScope = ASK_SCOPE) {
    const db = await getMemoryDb()
    const item = await db.get('procedures', id)
    if (!item || !inScope(item, scope)) return
    await db.delete('procedures', id)
    await vectorIndex.remove('procedural', id).catch(() => {})
  },

  async search(query: string, limit = 5, scope: MemoryScope = ASK_SCOPE) {
    const db = await getMemoryDb()
    return searchByMeaning({
      kind: 'procedural',
      query,
      limit,
      load: async (id) => {
        const item = await db.get('procedures', id)
        return item && inScope(item, scope) ? item : undefined
      },
      fallback: async () =>
        keywordSearch(
          (await db.getAll('procedures')).filter((item) => inScope(item, scope)),
          (item) => `${item.name} ${item.instructions}`,
          query,
          limit,
        ),
    })
  },

  /** The latest procedures as a block for the system prompt, or '' when there are none. */
  async toPrompt(scope: MemoryScope = ASK_SCOPE) {
    const latest = (await proceduralMemory.list(scope)).slice(0, PROCEDURE_PROMPT_LIMIT)
    if (!latest.length) return ''
    return `Procedural memory (how the user wants things done, follow these):\n${latest.map((item) => `- [${item.id}] ${item.name}: ${item.instructions}`).join('\n')}`
  },
}
