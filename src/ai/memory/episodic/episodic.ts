import { getMemoryDb } from '../db'
import { keywordSearch } from '../search'
import { ASK_SCOPE, type Episode, type MemoryScope, inScope } from '../types'
import { indexText, searchByMeaning } from '../vector/meaning'
import { vectorIndex } from '../vector/vector-client'

/** Turns shorter than this are not worth an embedding call. */
const MIN_EMBED_LENGTH = 20

/** Episodic memory: what happened. Every turn of every conversation, plus events the model writes down. */
export const episodicMemory = {
  /** Saves one turn or event. The embedding is made in the background so the chat never waits on it. */
  async append(entry: Omit<Episode, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
    const saved: Episode = { id: crypto.randomUUID(), createdAt: Date.now(), scope: ASK_SCOPE, ...entry }
    if (!saved.content.trim()) return saved
    await (await getMemoryDb()).put('episodes', saved)
    if (saved.content.length >= MIN_EMBED_LENGTH) void indexText('episodic', saved.id, saved.content)
    return saved
  },

  /** The latest turns of one chat, oldest first. */
  async ofChat(chatId: string, limit = 20) {
    const entries = await (await getMemoryDb()).getAllFromIndex('episodes', 'byChat', chatId)
    return entries.sort((a, b) => a.createdAt - b.createdAt).slice(-limit)
  },

  async search(query: string, limit = 5, scope: MemoryScope = ASK_SCOPE) {
    const db = await getMemoryDb()
    return searchByMeaning({
      kind: 'episodic',
      query,
      limit,
      load: async (id) => {
        const entry = await db.get('episodes', id)
        return entry && inScope(entry, scope) ? entry : undefined
      },
      fallback: async () => keywordSearch(await db.getAllFromIndex('episodes', 'byScope', scope), (entry) => entry.content, query, limit),
    })
  },

  async removeChat(chatId: string) {
    const db = await getMemoryDb()
    for (const entry of await db.getAllFromIndex('episodes', 'byChat', chatId)) {
      await db.delete('episodes', entry.id)
      await vectorIndex.remove('episodic', entry.id).catch(() => {})
    }
  },
}
