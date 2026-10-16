import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { vectorIndex } from '@/ai/memory/vector/vector-client'
import { chatsRepo } from '@/features/ask-sensei/db/chats.repo'
import { pagesRepo } from '@/features/note/db/repo'
import { pagesStore } from '@/features/note/db/stores'
import { vault } from '@/features/vault/vault'

import { getClient, getDb } from './client'
import * as t from './schema'

const unit = (index: number, size = 768) => Float32Array.from({ length: size }, (_, i) => (i === index ? 1 : 0))

describe('PGlite database', () => {
  // The first start loads PGlite's WASM and creates the tables.
  beforeAll(() => getDb(), 60_000)

  it('creates every table and the vector extension', async () => {
    const client = await getClient()
    const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    const names = tables.rows.map((row) => row.tablename)
    for (const name of ['note_pages', 'note_chat_messages', 'memory_vectors', 'profiles', 's3d_files', 'usage_logs'])
      expect(names).toContain(name)
    const extensions = await client.query<{ extname: string }>('SELECT extname FROM pg_extension')
    expect(extensions.rows.map((row) => row.extname)).toContain('vector')
  })

  it('stores pages and queries children by their parent column', async () => {
    const root = await pagesRepo.create({ parentId: null, parentType: 'workspace', title: 'Root' })
    const a = await pagesRepo.create({ parentId: root.id, parentType: 'page', title: 'A', order: 2 })
    const b = await pagesRepo.create({ parentId: root.id, parentType: 'page', title: 'B', order: 1 })
    expect((await pagesRepo.children(root.id)).map((p) => p.title)).toEqual(['B', 'A'])
    expect(await pagesRepo.get(a.id)).toMatchObject({ title: 'A' })
    await pagesRepo.setTrashed(root.id, true)
    expect((await pagesRepo.get(b.id))?.trashed).toBe(true)
    await pagesRepo.destroy(root.id)
    expect(await pagesRepo.get(a.id)).toBeUndefined()
  })

  it('rolls a transaction back on failure', async () => {
    const chat = await chatsRepo.create('Hello')
    await expect(chatsRepo.append('missing', 'user', 'x')).rejects.toThrow('does not exist')
    await chatsRepo.append(chat.id, 'user', 'hi')
    expect((await chatsRepo.messages(chat.id)).map((m) => m.content)).toEqual(['hi'])
    await chatsRepo.remove(chat.id)
    expect(await chatsRepo.messages(chat.id)).toEqual([])
  })

  it('encrypts a record when the vault is encrypting and reads it back', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    vault.set({ key, encrypting: true })
    try {
      const page = await pagesRepo.create({ parentId: null, parentType: 'workspace', title: 'Secret title' })
      const db = await getDb()
      const [row] = await db.select().from(t.notePages).where(eq(t.notePages.id, page.id))
      expect(JSON.stringify(row.data)).not.toContain('Secret title')
      expect(row.data).toHaveProperty('__enc')
      expect((await pagesStore.get(page.id))?.title).toBe('Secret title')
    } finally {
      vault.set({ key: null, encrypting: false })
    }
  })

  it('finds the nearest embeddings with pgvector', async () => {
    await vectorIndex.upsert('semantic', 'near', unit(0))
    await vectorIndex.upsert('semantic', 'far', unit(5))
    await vectorIndex.upsert('episodic', 'other-kind', unit(0))
    const hits = await vectorIndex.search('semantic', unit(0), 5)
    expect(hits.map((hit) => hit.refId)).toEqual(['near', 'far'])
    expect(hits[0].score).toBeCloseTo(1)
    expect(await vectorIndex.size('semantic')).toBe(2)
    await vectorIndex.remove('semantic', 'far')
    expect(await vectorIndex.size('semantic')).toBe(1)
  })
})
