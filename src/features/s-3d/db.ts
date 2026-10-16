import { desc, eq } from 'drizzle-orm'

import { getDb } from '@/db/client'
import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

import type { AgentChat, Doc, FileMeta, Version } from './types'

export const s3dDocsStore = recordStore<Doc>(t.s3dDocs, { key: 'id', columns: (d) => ({ updatedAt: d.updatedAt }) })
export const s3dVersionsStore = recordStore<Version>(t.s3dVersions, { key: 'id', columns: (v) => ({ docId: v.docId }) })
/** Metadata only; the bytes live in the `s3d-files` Cache Storage bucket. */
export const filesStore = recordStore<FileMeta>(t.s3dFiles, {
  key: 'id',
  columns: (f) => ({ docId: f.docId ?? null, lastOpenedAt: f.lastOpenedAt }),
})
export const s3dChatsStore = recordStore<AgentChat>(t.s3dChats, { key: 'id', columns: (c) => ({ docId: c.docId }) })
export const s3dSettingsStore = recordStore<{ key: string; value: unknown }>(t.s3dSettings, { key: 'key' })

export const uid = () => crypto.randomUUID()

export const docsRepo = {
  async list() {
    return s3dDocsStore.list({ orderBy: [desc(t.s3dDocs.updatedAt)] })
  },
  async get(id: string) {
    return s3dDocsStore.get(id)
  },
  async put(doc: Doc) {
    await s3dDocsStore.put(doc)
  },
  async remove(id: string) {
    await (
      await getDb()
    ).transaction(async (tx) => {
      await s3dVersionsStore.removeWhere(eq(t.s3dVersions.docId, id), tx)
      await s3dDocsStore.remove(id, tx)
    })
  },
}

export const versionsRepo = {
  async list(docId: string) {
    return (await s3dVersionsStore.list({ where: eq(t.s3dVersions.docId, docId) })).sort((a, b) => b.createdAt - a.createdAt)
  },
  async add(doc: Doc, label: string) {
    const version: Version = { id: uid(), docId: doc.id, label, createdAt: Date.now(), doc: structuredClone(doc) }
    await s3dVersionsStore.put(version)
    return version
  },
  async remove(id: string) {
    await s3dVersionsStore.remove(id)
  },
}

export const chatsRepo = {
  async list(docId: string) {
    return (await s3dChatsStore.list({ where: eq(t.s3dChats.docId, docId) })).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async get(id: string) {
    return s3dChatsStore.get(id)
  },
  async put(chat: AgentChat) {
    await s3dChatsStore.put(chat)
  },
  async remove(id: string) {
    await s3dChatsStore.remove(id)
  },
}

export const settingsRepo = {
  async get<T>(key: string, fallback: T): Promise<T> {
    return ((await s3dSettingsStore.get(key))?.value as T) ?? fallback
  },
  async set(key: string, value: unknown) {
    await s3dSettingsStore.put({ key, value })
  },
}
