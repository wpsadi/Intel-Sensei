/**
 * THE ONLY FILE THAT TOUCHES IndexedDB DIRECTLY.
 *
 * Before PGlite, each app kept its data in its own IndexedDB database. This copies whatever is there into PGlite once,
 * then deletes the old databases. It runs on the first start with the new database and never again.
 */
import { sql } from 'drizzle-orm'

import { type Collection, collectionOf } from '@/features/vault/migrate'

import type { Db } from './client'

const LEGACY_DATABASES = [
  'sensei-profile',
  'snote',
  's3d',
  'sensei-memory',
  'sensei-usage',
  'sensei-skills',
  'sensei-terminals',
  'sensei-sbrowse',
] as const

/** `_migrations` row that says the old data was handled. Kept apart from the schema steps. */
const DONE = 1000

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

/** Every record of every store of an old database, or null when it does not exist. */
async function readAll(name: string): Promise<Record<string, unknown[]> | null> {
  const exists = (await indexedDB.databases?.())?.some((info) => info.name === name)
  if (!exists) return null
  const opening = indexedDB.open(name)
  const db = await request(opening)
  try {
    const out: Record<string, unknown[]> = {}
    for (const store of Array.from(db.objectStoreNames)) out[store] = await request(db.transaction(store).objectStore(store).getAll())
    return out
  } finally {
    db.close()
  }
}

const drop = (name: string) =>
  new Promise<void>((resolve) => {
    const deleting = indexedDB.deleteDatabase(name)
    // Another tab may still hold it open; the next start tries again.
    deleting.onsuccess = deleting.onerror = deleting.onblocked = () => resolve()
  })

/** Splits an old record into the part that stayed readable and its ciphertext, when it was encrypted. */
function unwrap(record: unknown): { plain: unknown; cipher: Uint8Array | null } {
  if (record && typeof record === 'object' && '__enc' in record) {
    const { __enc, ...plain } = record as { __enc: Uint8Array }
    return { plain, cipher: __enc }
  }
  return { plain: record, cipher: null }
}

export async function importLegacyData(db: Db) {
  if (typeof indexedDB === 'undefined') return
  const done = await db.execute(sql`SELECT 1 FROM _migrations WHERE version = ${DONE}`)
  if (done.rows.length) return

  const imported: string[] = []
  try {
    for (const name of LEGACY_DATABASES) {
      const stores = await readAll(name)
      if (!stores) continue
      for (const [store, records] of Object.entries(stores)) {
        // The password record was a plain `profiles` store in its own database.
        const collection = name === 'sensei-profile' ? PROFILE : collectionOf(name, store)
        if (!collection) continue
        for (const record of records) {
          const { plain, cipher } = unwrap(record)
          if (cipher && collection.putSealed) await collection.putSealed(plain as never, cipher)
          // An encrypted embedding cannot be searched, and cannot be opened until the vault is unlocked: it is re-made on edit.
          else if (!cipher) await collection.put(plain as never)
        }
      }
      imported.push(name)
    }
    await db.execute(sql`INSERT INTO _migrations (version) VALUES (${DONE}) ON CONFLICT DO NOTHING`)
  } catch (error) {
    // Leave the old databases alone and try again next start rather than lose anything.
    console.error('Importing the old IndexedDB data failed', error)
    return
  }
  await Promise.all(imported.map(drop))
}

/** The profile store lives in `profile.db.ts`, which imports the vault, so it is reached lazily. */
const PROFILE: Pick<Collection, 'database' | 'name' | 'put'> & { putSealed?: undefined } = {
  database: 'sensei-profile',
  name: 'profiles',
  async put(record: never) {
    const { profileStore } = await import('@/features/profile/profile.db')
    await profileStore.put(record)
  },
}
