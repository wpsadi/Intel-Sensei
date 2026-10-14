import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { secureDb } from '@/features/vault/secure-db'

export type UsageProvider = 'google' | 'anthropic' | 'openai'

/** One model call (or one agent step): what was sent and what came back. Cost is worked out when shown, from models.dev prices. */
export interface UsageLog {
  id: string
  at: number
  provider: UsageProvider
  model: string
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  /** Input tokens read from the provider's cache. They are part of `inputTokens` and cost less. */
  cachedTokens?: number
  /** Input tokens written to the provider's cache (Anthropic). Also part of `inputTokens`. */
  cacheWriteTokens?: number
}

interface IUsageDB extends DBSchema {
  logs: { key: string; value: UsageLog; indexes: { byAt: number } }
}

let dbPromise: Promise<IDBPDatabase<IUsageDB>> | null = null

export function getUsageDb() {
  dbPromise ??= openDB<IUsageDB>('sensei-usage', 1, {
    upgrade(db) {
      db.createObjectStore('logs', { keyPath: 'id' }).createIndex('byAt', 'at')
    },
  }).then((db) => secureDb(db, 'sensei-usage'))
  return dbPromise
}
