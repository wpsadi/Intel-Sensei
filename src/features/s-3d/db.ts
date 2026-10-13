import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { AgentChat, Doc, FileMeta, Version } from './types'

interface S3DSchema extends DBSchema {
  docs: { key: string; value: Doc; indexes: { byUpdated: number } }
  versions: { key: string; value: Version; indexes: { byDoc: string } }
  /** Metadata only; the bytes live in the `s3d-files` Cache Storage bucket. */
  files: { key: string; value: FileMeta; indexes: { byOpened: number; byDoc: string } }
  chats: { key: string; value: AgentChat; indexes: { byDoc: string } }
  settings: { key: string; value: { key: string; value: unknown } }
}

let dbPromise: Promise<IDBPDatabase<S3DSchema>> | null = null

export function getDb() {
  dbPromise ??= openDB<S3DSchema>('s3d', 1, {
    upgrade(db) {
      db.createObjectStore('docs', { keyPath: 'id' }).createIndex('byUpdated', 'updatedAt')
      db.createObjectStore('versions', { keyPath: 'id' }).createIndex('byDoc', 'docId')
      const files = db.createObjectStore('files', { keyPath: 'id' })
      files.createIndex('byOpened', 'lastOpenedAt')
      files.createIndex('byDoc', 'docId')
      db.createObjectStore('chats', { keyPath: 'id' }).createIndex('byDoc', 'docId')
      db.createObjectStore('settings', { keyPath: 'key' })
    },
  })
  return dbPromise
}

export const uid = () => crypto.randomUUID()

export const docsRepo = {
  async list() {
    return (await (await getDb()).getAllFromIndex('docs', 'byUpdated')).reverse()
  },
  async get(id: string) {
    return (await getDb()).get('docs', id)
  },
  async put(doc: Doc) {
    await (await getDb()).put('docs', doc)
  },
  async remove(id: string) {
    const db = await getDb()
    await db.delete('docs', id)
    for (const v of await db.getAllFromIndex('versions', 'byDoc', id)) await db.delete('versions', v.id)
  },
}

export const versionsRepo = {
  async list(docId: string) {
    return (await (await getDb()).getAllFromIndex('versions', 'byDoc', docId)).sort((a, b) => b.createdAt - a.createdAt)
  },
  async add(doc: Doc, label: string) {
    const version: Version = { id: uid(), docId: doc.id, label, createdAt: Date.now(), doc: structuredClone(doc) }
    await (await getDb()).put('versions', version)
    return version
  },
  async remove(id: string) {
    await (await getDb()).delete('versions', id)
  },
}

export const chatsRepo = {
  async list(docId: string) {
    return (await (await getDb()).getAllFromIndex('chats', 'byDoc', docId)).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async get(id: string) {
    return (await getDb()).get('chats', id)
  },
  async put(chat: AgentChat) {
    await (await getDb()).put('chats', chat)
  },
  async remove(id: string) {
    await (await getDb()).delete('chats', id)
  },
}

export const settingsRepo = {
  async get<T>(key: string, fallback: T): Promise<T> {
    return ((await (await getDb()).get('settings', key))?.value as T) ?? fallback
  },
  async set(key: string, value: unknown) {
    await (await getDb()).put('settings', { key, value })
  },
}
