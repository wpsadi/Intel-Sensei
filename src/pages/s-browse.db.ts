import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { secureDb } from '@/features/vault/secure-db'

/** What the user decided for a site: 'full' lets it use its own cookies and storage, 'restricted' keeps it sandboxed. */
export type Access = 'full' | 'restricted'

/** What one SBrowse session has been allowed. `id` is the session id. */
export interface SessionGrants {
  id: string
  /** The decision for each site (origin) the session has been asked about. */
  access: Record<string, Access>
  /** Permissions-Policy names the session's page may use. */
  permissions: string[]
}

interface ISBrowseDB extends DBSchema {
  grants: { key: string; value: SessionGrants }
}

let dbPromise: Promise<IDBPDatabase<ISBrowseDB>> | null = null

function getDb() {
  dbPromise ??= openDB<ISBrowseDB>('sensei-sbrowse', 1, {
    upgrade(db) {
      db.createObjectStore('grants', { keyPath: 'id' })
    },
  }).then((db) => secureDb(db, 'sensei-sbrowse'))
  return dbPromise
}

export async function loadGrants(): Promise<Record<string, SessionGrants>> {
  const all = await (await getDb()).getAll('grants')
  return Object.fromEntries(all.map((grants) => [grants.id, grants]))
}

export async function saveGrants(grants: SessionGrants) {
  await (await getDb()).put('grants', grants)
}

export async function deleteGrants(id: string) {
  await (await getDb()).delete('grants', id)
}
