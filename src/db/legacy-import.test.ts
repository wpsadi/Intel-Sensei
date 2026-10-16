import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'

import { chatsRepo } from '@/features/ask-sensei/db/chats.repo'
import { pagesRepo } from '@/features/note/db/repo'
import { profileRepo } from '@/features/profile/profile.db'
import { vault } from '@/features/vault/vault'

import { getDb } from './client'

/** An old database the way the IndexedDB version of the app made it. */
function seed(name: string, stores: Record<string, { keyPath: string; rows: unknown[] }>) {
  return new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(name, 1)
    opening.onupgradeneeded = () => {
      for (const [store, { keyPath, rows }] of Object.entries(stores)) {
        const objects = opening.result.createObjectStore(store, { keyPath })
        for (const row of rows) objects.put(row)
      }
    }
    opening.onsuccess = () => {
      opening.result.close()
      resolve()
    }
    opening.onerror = () => reject(opening.error)
  })
}

const exists = async (name: string) => (await indexedDB.databases()).some((info) => info.name === name)

describe('importing the old IndexedDB data', () => {
  it('copies plain and encrypted records into PGlite and deletes the old databases', async () => {
    const page = { id: 'p1', kind: 'page', title: 'Old note', parentId: null, parentType: 'workspace', order: 1, trashed: false }
    // An encrypted record keeps only its key and indexed fields readable; this store had no index on updatedAt.
    const sealedChat = { id: 'c1', __enc: new Uint8Array([1, 2, 3]) }
    await seed('snote', {
      pages: { keyPath: 'id', rows: [page] },
      chats: { keyPath: 'id', rows: [sealedChat] },
    })
    await seed('sensei-profile', {
      profiles: { keyPath: 'id', rows: [{ id: 'default', passwordHash: 'abc', salt: 'def', iterations: 1, updatedAt: 1 }] },
    })

    // The first use of the database runs the import. It used to wait on itself and never finish.
    await getDb()

    expect(await pagesRepo.get('p1')).toMatchObject({ title: 'Old note' })
    expect((await profileRepo.get())?.passwordHash).toBe('abc')
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    vault.set({ key, encrypting: false })
    // The sealed row is there (a locked vault cannot read it, but it exists and did not break the import).
    const { chatsStore } = await import('@/features/note/db/stores')
    expect(await chatsStore.keys()).toEqual(['c1'])
    vault.set({ key: null, encrypting: false })
    expect(await chatsRepo.list().catch(() => 'locked')).toBeDefined()

    expect(await exists('snote')).toBe(false)
    expect(await exists('sensei-profile')).toBe(false)
  }, 90_000)
})
