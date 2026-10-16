import { asc, eq } from 'drizzle-orm'

import * as t from '@/db/schema'

import { episodesStore } from '../db'
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
    await episodesStore.put(saved)
    if (saved.content.length >= MIN_EMBED_LENGTH) void indexText('episodic', saved.id, saved.content)
    return saved
  },

  /** The latest turns of one chat, oldest first. */
  async ofChat(chatId: string, limit = 20) {
    const entries = await episodesStore.list({ where: eq(t.memoryEpisodes.chatId, chatId), orderBy: [asc(t.memoryEpisodes.createdAt)] })
    return entries.slice(-limit)
  },

  async search(query: string, limit = 5, scope: MemoryScope = ASK_SCOPE) {
    return searchByMeaning({
      kind: 'episodic',
      query,
      limit,
      load: async (id) => {
        const entry = await episodesStore.get(id)
        return entry && inScope(entry, scope) ? entry : undefined
      },
      fallback: async () =>
        keywordSearch(await episodesStore.list({ where: eq(t.memoryEpisodes.scope, scope) }), (entry) => entry.content, query, limit),
    })
  },

  async removeChat(chatId: string) {
    const ids = await episodesStore.keys(eq(t.memoryEpisodes.chatId, chatId))
    await episodesStore.removeWhere(eq(t.memoryEpisodes.chatId, chatId))
    for (const id of ids) await vectorIndex.remove('episodic', id).catch(() => {})
  },
}
