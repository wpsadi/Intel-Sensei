import { episodesStore, proceduresStore, semanticStore, sessionStore } from '@/ai/memory/db'
import type { VectorKind } from '@/ai/memory/types'
import { vectorIndex } from '@/ai/memory/vector/vector-client'
import { skillsStore } from '@/ai/skills/db'
import { usageStore } from '@/ai/usage/db'
import { getDb } from '@/db/client'
import { memoryVectors } from '@/db/schema'
import type { RecordStore } from '@/db/store'
import { terminalStore } from '@/features/ask-sensei/terminal/terminal-db'
import {
  chatMessagesStore,
  chatsStore,
  databasesStore,
  pagesStore,
  peopleStore,
  settingsStore,
  syncedStore,
  viewsStore,
  widgetChatsStore,
} from '@/features/note/db/stores'
import { filesStore, s3dChatsStore, s3dDocsStore, s3dSettingsStore, s3dVersionsStore } from '@/features/s-3d/db'
import { grantsStore } from '@/pages/s-browse.db'

import { resealBlobs } from './blob'
import { resealSecrets } from './secrets'

/**
 * Every collection the app keeps. `database` and `name` are what the old IndexedDB databases and stores were called:
 * backups and the one-time import of old data are written in those names.
 */
export interface Collection {
  database: string
  name: string
  /** Every record, as the app sees it. */
  list(): Promise<unknown[]>
  put(record: never): Promise<void>
  /** Saves a record whose body arrived already encrypted. Absent for data that is never encrypted. */
  putSealed?(record: never, ciphertext: Uint8Array): Promise<void>
}

const of = <T extends object>(database: string, name: string, store: RecordStore<T>): Collection => ({
  database,
  name,
  list: () => store.list(),
  put: (record) => store.put(record as T),
  putSealed: (record, ciphertext) => store.putSealed(record as T, ciphertext),
})

/** Embeddings are plain rows of `memory_vectors`: pgvector cannot search encrypted ones. */
const vectors: Collection = {
  database: 'sensei-memory',
  name: 'vectors',
  async list() {
    const rows = await (await getDb()).select().from(memoryVectors)
    return rows.map((row) => ({ key: row.key, kind: row.kind, refId: row.refId, vector: row.embedding }))
  },
  async put(record) {
    const { kind, refId, vector } = record as { kind: VectorKind; refId: string; vector: Float32Array }
    await vectorIndex.upsert(kind, refId, vector)
  },
}

export const COLLECTIONS: Collection[] = [
  of('snote', 'pages', pagesStore),
  of('snote', 'databases', databasesStore),
  of('snote', 'views', viewsStore),
  of('snote', 'synced', syncedStore),
  of('snote', 'people', peopleStore),
  of('snote', 'settings', settingsStore),
  of('snote', 'chats', chatsStore),
  of('snote', 'chatMessages', chatMessagesStore),
  of('snote', 'widgetChats', widgetChatsStore),
  of('s3d', 'docs', s3dDocsStore),
  of('s3d', 'versions', s3dVersionsStore),
  of('s3d', 'files', filesStore),
  of('s3d', 'chats', s3dChatsStore),
  of('s3d', 'settings', s3dSettingsStore),
  of('sensei-memory', 'semantic', semanticStore),
  of('sensei-memory', 'episodes', episodesStore),
  of('sensei-memory', 'procedures', proceduresStore),
  of('sensei-memory', 'session', sessionStore),
  vectors,
  of('sensei-usage', 'logs', usageStore),
  of('sensei-skills', 'skills', skillsStore),
  of('sensei-terminals', 'sessions', terminalStore),
  of('sensei-sbrowse', 'grants', grantsStore),
]

/** The collection an old store maps to, or undefined for a store this version does not keep. */
export const collectionOf = (database: string, name: string) => COLLECTIONS.find((c) => c.database === database && c.name === name)

/**
 * Rewrites everything in the mode the vault is in now: encrypted when it is encrypting, plain when it is not.
 * Reads accept both forms, so this is safe to run again after an interruption.
 */
export async function resealAll() {
  for (const collection of COLLECTIONS) {
    // Embeddings never change form.
    if (collection === vectors) continue
    for (const record of await collection.list()) await collection.put(record as never)
  }
  await resealBlobs()
  await resealSecrets()
}
