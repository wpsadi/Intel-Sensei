import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

import { ASK_SCOPE, type Episode, type Procedure, type SemanticFact, type SessionNote } from './types'

/** Memory's tables. Embeddings live in `memory_vectors` and are read through `vector/vector-client.ts`. */
export const semanticStore = recordStore<SemanticFact>(t.memorySemantic, { key: 'id' })
export const episodesStore = recordStore<Episode>(t.memoryEpisodes, {
  key: 'id',
  columns: (e) => ({ chatId: e.chatId ?? null, createdAt: e.createdAt, scope: e.scope ?? ASK_SCOPE }),
})
export const proceduresStore = recordStore<Procedure>(t.memoryProcedures, { key: 'id' })
export const sessionStore = recordStore<SessionNote>(t.memorySession, { key: 'id', columns: (n) => ({ chatId: n.chatId }) })
