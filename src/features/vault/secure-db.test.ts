import { beforeEach, describe, expect, it } from 'vitest'

import { secureDb } from './secure-db'
import { deserialize, serialize } from './serialize'
import { vault } from './vault'

/** The few `idb` methods the wrapper uses, over a Map, so no browser is needed. */
function fakeDb() {
  const rows = new Map<string, unknown>()
  const store = { keyPath: 'id', indexNames: ['byChat'], index: () => ({ keyPath: 'chatId' }) }
  const db = {
    rows,
    transaction: () => ({ store }),
    get: async (_s: string, key: string) => rows.get(key),
    getAll: async () => [...rows.values()],
    put: async (_s: string, value: { id: string }) => void rows.set(value.id, value),
    delete: async (_s: string, key: string) => void rows.delete(key),
  }
  return db
}

const newKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

describe('serialize', () => {
  it('round-trips typed arrays, dates and non-finite numbers', () => {
    const value = { v: new Float32Array([1.5, -2, 3]), d: new Date(1000), n: Infinity, nested: { b: new Uint8Array([1, 2, 3]) } }
    const back = deserialize<typeof value>(serialize(value))
    expect(Array.from(back.v)).toEqual([1.5, -2, 3])
    expect(back.d.getTime()).toBe(1000)
    expect(back.n).toBe(Infinity)
    expect(Array.from(back.nested.b)).toEqual([1, 2, 3])
  })
})

describe('secureDb', () => {
  beforeEach(() => vault.set({ key: null, encrypting: false }))

  it('stores plain records when not encrypting', async () => {
    const raw = fakeDb()
    const db = secureDb(raw as never, 'plain')
    await db.put('chats' as never, { id: 'a', chatId: 'c', text: 'hello' } as never)
    expect(raw.rows.get('a')).toEqual({ id: 'a', chatId: 'c', text: 'hello' })
  })

  it('encrypts the body, keeps key and index fields, and reads it back', async () => {
    vault.set({ key: await newKey(), encrypting: true })
    const raw = fakeDb()
    const db = secureDb(raw as never, 'enc')
    const record = { id: 'a', chatId: 'c', text: 'secret text', vector: new Float32Array([1, 2]) }
    await db.put('chats' as never, record as never)

    const stored = raw.rows.get('a') as Record<string, unknown>
    expect(stored.id).toBe('a')
    expect(stored.chatId).toBe('c')
    expect(stored.text).toBeUndefined()
    expect(JSON.stringify(Array.from(stored.__enc as Uint8Array))).not.toContain('secret')

    const back = (await db.get('chats' as never, 'a' as never)) as typeof record
    expect(back.text).toBe('secret text')
    expect(Array.from(back.vector)).toEqual([1, 2])
    expect(((await db.getAll('chats' as never)) as unknown[]).length).toBe(1)
  })

  it('reads records written before encryption was on', async () => {
    const raw = fakeDb()
    raw.rows.set('old', { id: 'old', text: 'plain' })
    vault.set({ key: await newKey(), encrypting: true })
    const db = secureDb(raw as never, 'mixed')
    expect(await db.get('chats' as never, 'old' as never)).toEqual({ id: 'old', text: 'plain' })
  })

  it('refuses to read encrypted data with the wrong key', async () => {
    vault.set({ key: await newKey(), encrypting: true })
    const raw = fakeDb()
    await secureDb(raw as never, 'k').put('chats' as never, { id: 'a', text: 'x' } as never)
    vault.set({ key: await newKey(), encrypting: true })
    await expect(secureDb(raw as never, 'k').get('chats' as never, 'a' as never)).rejects.toThrow()
  })

  it('lets read-modify-write "transactions" work across awaits', async () => {
    vault.set({ key: await newKey(), encrypting: true })
    const raw = fakeDb()
    const db = secureDb(raw as never, 'tx')
    await db.put('chats' as never, { id: 'a', text: 'one' } as never)
    const tx = (
      db as never as {
        transaction(
          n: string,
          m: string,
        ): { store: { get(k: string): Promise<{ text: string }>; put(v: unknown): Promise<unknown> }; done: Promise<void> }
      }
    ).transaction('chats', 'readwrite')
    const current = await tx.store.get('a')
    await tx.store.put({ id: 'a', text: `${current.text} two` })
    await tx.done
    expect(((await db.get('chats' as never, 'a' as never)) as { text: string }).text).toBe('one two')
  })
})
