import type { PGliteInterface } from '@electric-sql/pglite'
/**
 * THE ONLY FILE THAT TOUCHES IndexedDB DIRECTLY.
 *
 * Before PGlite, each app kept its data in its own IndexedDB database. This copies whatever is there into PGlite once,
 * then deletes the old databases. It runs on the first start with the new database and never again.
 */
import { sql } from 'drizzle-orm'

import { type Collection, collectionOf } from '@/features/vault/migrate'

import type { Db, Executor } from './client'

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

/** Every record of every store of an old database, or null when it does not exist (or is empty). */
async function readAll(name: string): Promise<Record<string, unknown[]> | null> {
  // `databases()` is missing in some browsers; opening a database that does not exist creates an empty one, which is dropped below.
  const known = indexedDB.databases ? (await indexedDB.databases()).some((info) => info.name === name) : true
  if (!known) return null
  const db = await request(indexedDB.open(name))
  try {
    const stores = Array.from(db.objectStoreNames)
    if (!stores.length) return null
    const out: Record<string, unknown[]> = {}
    for (const store of stores) out[store] = await request(db.transaction(store).objectStore(store).getAll())
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

export async function importLegacyData(client: PGliteInterface, db: Db) {
  if (typeof indexedDB === 'undefined') return
  const done = await client.query('SELECT 1 FROM _migrations WHERE version = $1', [DONE])
  if (done.rows.length) return

  // Read first, outside the database: nothing is written (or deleted) unless everything can be read.
  const found: [string, Record<string, unknown[]>][] = []
  for (const name of LEGACY_DATABASES) {
    const stores = await readAll(name)
    if (stores) found.push([name, stores])
  }

  try {
    // One transaction: either all the old data arrives, or none of it does and the next start tries again.
    // Writes go through `tx`, never through `getDb()`, which is still waiting for this import to finish.
    await db.transaction(async (tx) => {
      for (const [name, stores] of found) {
        for (const [store, records] of Object.entries(stores)) {
          // The password record was a plain `profiles` store in its own database.
          const collection = name === 'sensei-profile' ? PROFILE : collectionOf(name, store)
          if (!collection) continue
          for (const record of records) {
            const { plain, cipher } = unwrap(record)
            if (cipher && collection.putSealed) await collection.putSealed(plain as never, cipher, tx)
            // An encrypted embedding cannot be searched, and cannot be opened until the vault is unlocked: it is re-made on edit.
            else if (!cipher) await collection.put(plain as never, tx)
          }
        }
      }
      await tx.execute(sql`INSERT INTO _migrations (version) VALUES (${DONE}) ON CONFLICT DO NOTHING`)
    })
  } catch (error) {
    // Leave the old databases alone and try again next start rather than lose anything.
    console.error('Importing the old IndexedDB data failed', error)
    return
  }
  // Every database that was opened is dropped, including the empty ones a browser without `databases()` just created.
  await Promise.all(LEGACY_DATABASES.map(drop))
}

/** The profile store lives in `profile.db.ts`, which imports the vault, so it is reached lazily. */
const PROFILE: Pick<Collection, 'database' | 'name' | 'put'> & { putSealed?: undefined } = {
  database: 'sensei-profile',
  name: 'profiles',
  async put(record: never, ex?: Executor) {
    const { profileStore } = await import('@/features/profile/profile.db')
    await profileStore.put(record, ex)
  },
}
