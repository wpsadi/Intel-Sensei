import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { secureDb } from '@/features/vault/secure-db'

import type { Episode, Procedure, SemanticFact, SessionNote, VectorRecord } from './types'

interface IMemoryDB extends DBSchema {
  semantic: { key: string; value: SemanticFact }
  episodes: { key: string; value: Episode; indexes: { byChat: string; byCreated: number } }
  procedures: { key: string; value: Procedure }
  session: { key: string; value: SessionNote; indexes: { byChat: string } }
  vectors: { key: string; value: VectorRecord; indexes: { byKind: string } }
}

const DB_NAME = 'sensei-memory'
const DB_VERSION = 2

/** What version 1 stored: core facts, archival notes and conversations. */
interface LegacyStore {
  getAll(): Promise<unknown[]>
}

let dbPromise: Promise<IDBPDatabase<IMemoryDB>> | null = null

/** The memory database. Works on the page and inside the vector worker, which share the same IndexedDB. */
export function getMemoryDb() {
  dbPromise ??= openDB<IMemoryDB>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 2) {
        db.createObjectStore('semantic', { keyPath: 'id' })
        const episodes = db.createObjectStore('episodes', { keyPath: 'id' })
        episodes.createIndex('byChat', 'chatId')
        episodes.createIndex('byCreated', 'createdAt')
        db.createObjectStore('procedures', { keyPath: 'id' })
        db.createObjectStore('session', { keyPath: 'id' }).createIndex('byChat', 'chatId')
        if (oldVersion === 0) {
          db.createObjectStore('vectors', { keyPath: 'key' }).createIndex('byKind', 'kind')
          return
        }

        // Version 1 had core, notes and conversations. Core facts become pinned semantic facts, notes
        // become semantic facts, conversations become episodes, and the vectors follow their new kinds.
        const legacy = (name: string) => (transaction as unknown as { objectStore(name: string): LegacyStore }).objectStore(name)
        const semantic = transaction.objectStore('semantic')
        for (const fact of (await legacy('core').getAll()) as { id: string; text: string; createdAt: number; updatedAt: number }[]) {
          await semantic.put({ ...fact, pinned: true })
        }
        for (const note of (await legacy('notes').getAll()) as { id: string; text: string; createdAt: number }[]) {
          await semantic.put({ ...note, pinned: false, updatedAt: note.createdAt })
        }
        const episodes2 = transaction.objectStore('episodes')
        for (const entry of (await legacy('conversations').getAll()) as Episode[]) await episodes2.put(entry)
        const vectors = transaction.objectStore('vectors')
        const oldVectors = await vectors.getAll()
        await vectors.clear()
        for (const record of oldVectors) {
          const kind = (record.kind as string) === 'archival' ? 'semantic' : 'episodic'
          await vectors.put({ ...record, kind, key: `${kind}:${record.refId}` })
        }
        for (const name of ['core', 'notes', 'conversations'])
          (db as unknown as { deleteObjectStore(name: string): void }).deleteObjectStore(name)
      }
    },
    blocking() {
      // A newer version is waiting in another tab: let go of this connection.
      void dbPromise?.then((db) => db.close())
      dbPromise = null
    },
  }).then((db) => secureDb(db, DB_NAME))
  return dbPromise
}
