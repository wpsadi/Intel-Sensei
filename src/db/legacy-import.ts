/**
 * THE ONLY FILE THAT TOUCHES IndexedDB DIRECTLY.
 *
 * Before PGlite, each app kept its data in its own IndexedDB database. Each start does a cheap check first: are any of
 * those databases still there? If not, nothing else happens. If so, their ids are compared with what PGlite already has,
 * only the missing records are copied, and a database is deleted only once every one of its ids is in PGlite.
 *
 * It never holds the app up: the password profile (tiny, and needed by the lock screen) is synced first, and everything
 * else in the background in batches. A bad record is skipped, never fatal, and keeps its database for the next start.
 */
import type { PGliteInterface } from '@electric-sql/pglite'

import { LEGACY_DRAW_FILE_ID } from '@/features/s-draw/s-draw.types'
import { type Collection, collectionOf } from '@/features/vault/migrate'

import type { Db } from './client'

const PROFILE_DB = 'sensei-profile'
const LEGACY_DATABASES = [
  PROFILE_DB,
  'snote',
  's3d',
  'sensei-memory',
  'sensei-usage',
  'sensei-skills',
  'sensei-terminals',
  'sensei-sbrowse',
  'sensei-s-draw',
  'sensei-sdraw-chats',
]

const BATCH = 100
const READ_TIMEOUT = 8000

const log = (...args: unknown[]) => console.info('[sensei-db] legacy import:', ...args)

const within = <T>(promise: Promise<T>, ms: number, what: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s`)), ms)
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    )
  })

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

/** The old databases that exist, by name only: nothing is opened. Null when the browser cannot list them. */
async function existingDatabases(): Promise<Set<string> | null> {
  if (typeof indexedDB === 'undefined') return new Set()
  if (!indexedDB.databases) return null
  return new Set((await indexedDB.databases()).map((info) => info.name ?? ''))
}

interface OldStore {
  /** The field that holds each record's id. */
  keyPath: string
  records: unknown[]
}
type OldStores = Record<string, OldStore>

/** Every store of an old database, or null when it has none. */
async function readAll(name: string): Promise<OldStores | null> {
  const db = await within(request(indexedDB.open(name)), READ_TIMEOUT, `Opening ${name}`)
  try {
    const names = Array.from(db.objectStoreNames)
    if (!names.length) return null
    const out: OldStores = {}
    for (const store of names) {
      const objects = db.transaction(store).objectStore(store)
      out[store] = { keyPath: typeof objects.keyPath === 'string' ? objects.keyPath : 'id', records: await request(objects.getAll()) }
    }
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
function unwrap(record: unknown): { record: unknown; cipher?: Uint8Array } {
  if (record && typeof record === 'object' && '__enc' in record) {
    const { __enc, ...plain } = record as { __enc: Uint8Array }
    return { record: plain, cipher: __enc }
  }
  return { record }
}

/**
 * Old databases the app has outgrown. Version 1 of the memory database kept `core`, `notes` and `conversations`; they
 * became pinned facts, facts and episodes, and its embeddings were renamed to match.
 */
function upgradeStores(name: string, stores: OldStores): OldStores {
  if (name === 'sensei-s-draw' && stores.workspace) {
    return {
      workspace: {
        keyPath: 'id',
        records: stores.workspace.records.map((record) => ({ ...(record as object), id: LEGACY_DRAW_FILE_ID, updatedAt: 0 })),
      },
    }
  }
  if (name === 'sensei-sdraw-chats' && stores.chats) {
    return {
      chats: { keyPath: 'id', records: stores.chats.records.map((record) => ({ ...(record as object), fileId: LEGACY_DRAW_FILE_ID })) },
    }
  }
  if (name !== 'sensei-memory' || !('core' in stores || 'notes' in stores || 'conversations' in stores)) return stores
  const get = (store: string) => (stores[store]?.records ?? []) as Record<string, unknown>[]
  const old = new Set(['core', 'notes', 'conversations', 'vectors'])
  const rest = Object.fromEntries(Object.entries(stores).filter(([store]) => !old.has(store)))
  return {
    ...rest,
    semantic: {
      keyPath: 'id',
      records: [
        ...get('semantic'),
        ...get('core').map((fact) => ({ ...fact, pinned: true })),
        ...get('notes').map((note) => ({ ...note, pinned: false, updatedAt: note.createdAt })),
      ],
    },
    episodes: { keyPath: 'id', records: [...get('episodes'), ...get('conversations')] },
    vectors: {
      keyPath: 'key',
      records: get('vectors').map((record) => {
        const kind = record.kind === 'archival' ? 'semantic' : 'episodic'
        return { ...record, kind, key: `${kind}:${record.refId}` }
      }),
    },
  }
}

/** The password profile was a plain store in its own database; the profile table is never encrypted. */
const PROFILE: Pick<Collection, 'addMany' | 'keys'> = {
  async keys(ex) {
    const { profileStore } = await import('@/features/profile/profile.db')
    return profileStore.keys(undefined, ex)
  },
  async addMany(items, ex) {
    const { profileStore } = await import('@/features/profile/profile.db')
    await profileStore.addMany(
      items.map(({ record }) => ({ value: record as never })),
      ex,
    )
  },
}

/**
 * Brings one old database in sync with PGlite. Returns how many records were copied, and whether every id of the old
 * database is now in PGlite (so it can be deleted).
 */
async function syncDatabase(name: string, db: Db): Promise<{ copied: number; synced: boolean }> {
  const started = performance.now()
  let stores: OldStores | null
  try {
    stores = await within(readAll(name), READ_TIMEOUT, `Reading ${name}`)
  } catch (error) {
    console.error(`[sensei-db] legacy import: could not read ${name}; keeping it for the next start`, error)
    return { copied: 0, synced: false }
  }
  if (!stores) {
    log(`${name}: empty, nothing to import`)
    return { copied: 0, synced: true }
  }

  if (name === 'sensei-sdraw-chats' && stores.chats?.records.length) {
    const { sdrawFilesStore } = await import('@/features/s-draw/s-draw.db')
    const existing = await existingDatabases()
    if (existing && !existing.has('sensei-s-draw'))
      await sdrawFilesStore.addMany([{ value: { id: LEGACY_DRAW_FILE_ID, updatedAt: 0, sheets: [], activeId: '', libraryItems: [] } }], db)
  }
  let copied = 0
  let synced = true
  for (const [store, { keyPath, records }] of Object.entries(upgradeStores(name, stores))) {
    const collection = name === PROFILE_DB ? PROFILE : collectionOf(name, store)
    if (!collection) {
      log(`${name}/${store}: not kept by this version, skipped (${records.length} records)`)
      continue
    }
    // An encrypted embedding cannot be searched, and cannot be opened until the vault is unlocked: it is re-made on edit.
    const items = records.map(unwrap).filter((item) => !(item.cipher && store === 'vectors'))
    const idOf = (item: { record: unknown }) => String((item.record as Record<string, unknown>)[keyPath])

    const have = new Set(await collection.keys(db))
    const missing = items.filter((item) => !have.has(idOf(item)))
    log(`${name}/${store}: ${items.length} old, ${items.length - missing.length} already in PGlite, ${missing.length} to copy`)

    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH)
      try {
        await collection.addMany(batch as never, db)
        copied += batch.length
      } catch {
        // One bad record must not lose the other ninety-nine: retry them singly.
        for (const item of batch) {
          try {
            await collection.addMany([item] as never, db)
            copied++
          } catch (error) {
            console.error(`[sensei-db] legacy import: skipped a record of ${name}/${store} (id ${idOf(item)})`, error)
          }
        }
      }
    }

    // The sync check: every old id must now be in PGlite.
    if (missing.length) {
      const now = new Set(await collection.keys(db))
      const stillMissing = items.filter((item) => !now.has(idOf(item))).length
      if (stillMissing) {
        synced = false
        console.warn(`[sensei-db] legacy import: ${name}/${store} is missing ${stillMissing} of ${items.length} ids after copying`)
      } else log(`${name}/${store}: all ${items.length} ids are in PGlite`)
    }
  }
  log(`${name}: ${synced ? 'synced' : 'NOT fully synced'}, ${copied} copied in ${Math.round(performance.now() - started)}ms`)
  return { copied, synced }
}

/** The old databases to look at: the ones that exist, or all of them when the browser cannot say. */
async function pending(only: (name: string) => boolean) {
  const existing = await existingDatabases()
  const names = LEGACY_DATABASES.filter(only)
  return existing ? names.filter((name) => existing.has(name)) : names
}

/**
 * Stage 1, before the app starts: the password profile, so the lock screen knows about an existing password from the
 * first paint. Never throws: if anything goes wrong the app starts anyway and the profile is tried again next start.
 */
export async function importLegacyProfile(_client: PGliteInterface, db: Db) {
  try {
    const names = await pending((name) => name === PROFILE_DB)
    if (!names.length) return log('no old profile database, nothing to do')
    const { synced } = await syncDatabase(PROFILE_DB, db)
    if (synced) await drop(PROFILE_DB)
  } catch (error) {
    console.error('[sensei-db] legacy import: the old profile failed; the app starts without it for now', error)
  }
}

/**
 * Stage 2, in the background once the app is running: everything else. Resolves with how many records were copied, so
 * the caller can reload the page's data when something arrived. Never throws.
 */
export async function importLegacyData(_client: PGliteInterface, db: Db): Promise<number> {
  let copied = 0
  try {
    const names = await pending((name) => name !== PROFILE_DB)
    if (!names.length) {
      log('no old databases left, nothing to do')
      return 0
    }
    log(`old databases found: ${names.join(', ')}`)
    for (const name of names) {
      const result = await syncDatabase(name, db)
      copied += result.copied
      // Deleted only when every id made it; a database with a skipped record stays, so nothing is lost.
      if (result.synced) {
        await drop(name)
        log(`${name}: old database deleted`)
      }
    }
  } catch (error) {
    console.error('[sensei-db] legacy import failed; the old databases are kept for the next start', error)
  }
  log(`done, ${copied} records copied`)
  return copied
}
