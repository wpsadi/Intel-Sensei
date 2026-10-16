import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

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

export const grantsStore = recordStore<SessionGrants>(t.sbrowseGrants, { key: 'id' })

export async function loadGrants(): Promise<Record<string, SessionGrants>> {
  const all = await grantsStore.list()
  return Object.fromEntries(all.map((grants) => [grants.id, grants]))
}

export async function saveGrants(grants: SessionGrants) {
  await grantsStore.put(grants)
}

export async function deleteGrants(id: string) {
  await grantsStore.remove(id)
}
