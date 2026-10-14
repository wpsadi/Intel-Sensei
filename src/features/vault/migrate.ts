import { getMemoryDb } from '@/ai/memory/db'
import { getUsageDb } from '@/ai/usage/db'
import { getDb as getNoteDb } from '@/features/note/db/idb'
import { getDb as getS3dDb } from '@/features/s-3d/db'

import { resealBlobs } from './blob'
import { resealSecrets } from './secrets'

/** Every IndexedDB database the app keeps, so migration and backup cover all of them. */
export const DATABASES = [
  { name: 'snote', open: getNoteDb },
  { name: 's3d', open: getS3dDb },
  { name: 'sensei-memory', open: getMemoryDb },
  { name: 'sensei-usage', open: getUsageDb },
] as const

/** The store names of a database. The databases are typed differently, so this is deliberately loose. */
export async function openDatabase(name: (typeof DATABASES)[number]['name']) {
  const entry = DATABASES.find((db) => db.name === name)!
  return (await entry.open()) as unknown as {
    objectStoreNames: ArrayLike<string> & Iterable<string>
    getAll(store: string): Promise<unknown[]>
    put(store: string, value: unknown): Promise<unknown>
  }
}

/**
 * Rewrites everything in the mode the vault is in now: encrypted when it is encrypting, plain when it is not.
 * Reads accept both forms, so this is safe to run again after an interruption.
 */
export async function resealAll() {
  for (const { name } of DATABASES) {
    const db = await openDatabase(name)
    for (const store of Array.from(db.objectStoreNames)) {
      for (const record of await db.getAll(store)) await db.put(store, record)
    }
  }
  await resealBlobs()
  await resealSecrets()
}
