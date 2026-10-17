import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'

import { semanticStore } from '@/ai/memory/db'
import { pagesRepo } from '@/features/note/db/repo'
import { chatsStore } from '@/features/note/db/stores'
import { profileRepo } from '@/features/profile/profile.db'
import { drawChats } from '@/features/s-draw/agent/chats'
import { readDrawWorkspace } from '@/features/s-draw/s-draw.db'
import { LEGACY_DRAW_FILE_ID } from '@/features/s-draw/s-draw.types'

import { getDb, whenLegacyImported } from './client'

/** An old database the way the IndexedDB version of the app made it. */
function seed(name: string, stores: Record<string, { keyPath?: string; rows: unknown[] }>) {
  return new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(name, 1)
    opening.onupgradeneeded = () => {
      for (const [store, { keyPath, rows }] of Object.entries(stores)) {
        const objects = opening.result.createObjectStore(store, keyPath ? { keyPath } : undefined)
        for (const row of rows) {
          if (keyPath) objects.put(row)
          else objects.put(row, 'default')
        }
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
  it('opens at once, brings the profile in first and the rest in the background', async () => {
    const page = { id: 'p1', kind: 'page', title: 'Old note', parentId: null, parentType: 'workspace', order: 1, trashed: false }
    const nul = { id: 'p2', kind: 'page', title: 'Has a \u0000 in it', parentId: null, parentType: 'workspace', order: 2, trashed: false }
    // An encrypted record keeps only its key and indexed fields readable; this store had no index on updatedAt.
    const sealedChat = { id: 'c1', __enc: new Uint8Array([1, 2, 3]) }
    await seed('snote', {
      pages: { keyPath: 'id', rows: [page, nul] },
      chats: { keyPath: 'id', rows: [sealedChat] },
    })
    await seed('sensei-profile', {
      profiles: { keyPath: 'id', rows: [{ id: 'default', passwordHash: 'abc', salt: 'def', iterations: 1, updatedAt: 1 }] },
    })
    // Memory as version 1 of the app stored it.
    await seed('sensei-memory', {
      core: { keyPath: 'id', rows: [{ id: 'f1', text: 'Name is Asha', createdAt: 1, updatedAt: 1 }] },
      notes: { keyPath: 'id', rows: [{ id: 'f2', text: 'Likes tea', createdAt: 2 }] },
    })

    await seed('sensei-s-draw', {
      workspace: {
        rows: [
          {
            activeId: 'old-sheet',
            libraryItems: [],
            sheets: [
              {
                id: 'old-sheet',
                name: 'Old drawing',
                createdAt: 1,
                updatedAt: 1,
                scene: { elements: [], appState: {}, files: { image: { dataURL: 'data:image/png;base64,abc' } } },
              },
            ],
          },
        ],
      },
    })
    await seed('sensei-sdraw-chats', {
      chats: {
        keyPath: 'id',
        rows: [
          {
            id: 'old-draw-chat',
            title: 'Old conversation',
            messages: [{ id: 'm1', role: 'user', content: 'Keep this drawing' }],
            updatedAt: 1,
          },
        ],
      },
    })

    // The app is usable (and the password is known) before the bulk of the data has been copied.
    await getDb()
    expect((await profileRepo.get())?.passwordHash).toBe('abc')
    expect(await exists('sensei-profile')).toBe(false)

    expect(await whenLegacyImported()).toBeGreaterThanOrEqual(5)
    expect(await pagesRepo.get('p1')).toMatchObject({ title: 'Old note' })
    expect((await pagesRepo.get('p2'))?.title).toBe('Has a  in it')
    // The sealed row is there (a locked vault cannot read it, but it exists and did not break the import).
    expect(await chatsStore.keys()).toEqual(['c1'])
    const facts = await semanticStore.list()
    expect(facts.map((fact) => [fact.id, fact.pinned]).sort()).toEqual([
      ['f1', true],
      ['f2', false],
    ])
    expect((await readDrawWorkspace(LEGACY_DRAW_FILE_ID))?.sheets[0].scene.files).toMatchObject({
      image: { dataURL: 'data:image/png;base64,abc' },
    })
    expect((await drawChats.all(LEGACY_DRAW_FILE_ID))[0]).toMatchObject({
      id: 'old-draw-chat',
      fileId: LEGACY_DRAW_FILE_ID,
      messages: [{ content: 'Keep this drawing' }],
    })
    expect(await exists('sensei-s-draw')).toBe(false)
    expect(await exists('sensei-sdraw-chats')).toBe(false)
    expect(await exists('snote')).toBe(false)
    expect(await exists('sensei-memory')).toBe(false)
  }, 90_000)

  it('copies only the ids that are missing and never overwrites newer data', async () => {
    // The new database has edited p1 since; an old database that was left behind still has the old p1 and a p3 that never arrived.
    await pagesRepo.update('p1', { title: 'Edited after the move' })
    await seed('snote', {
      pages: {
        keyPath: 'id',
        rows: [
          { id: 'p1', kind: 'page', title: 'Old note', parentId: null, parentType: 'workspace', order: 1, trashed: false },
          { id: 'p3', kind: 'page', title: 'Never arrived', parentId: null, parentType: 'workspace', order: 3, trashed: false },
        ],
      },
    })
    const { importLegacyData } = await import('./legacy-import')
    const { getClient } = await import('./client')
    expect(await importLegacyData(await getClient(), await getDb())).toBe(1)
    expect((await pagesRepo.get('p1'))?.title).toBe('Edited after the move')
    expect((await pagesRepo.get('p3'))?.title).toBe('Never arrived')
    expect(await exists('snote')).toBe(false)
    // With nothing left to import it does nothing at all.
    expect(await importLegacyData(await getClient(), await getDb())).toBe(0)
  }, 90_000)
})
