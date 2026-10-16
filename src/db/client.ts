import { PGlite, type PGliteInterface } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { drizzle } from 'drizzle-orm/pglite'

import { MIGRATIONS } from './ddl'

export type Db = ReturnType<typeof open>['db']
/** What a query runs on: the database, or a transaction of it. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

const DATA_DIR = 'idb://sensei'

function open() {
  // Tabs share one worker-owned database. Where there are no workers (tests), a private in-memory one does.
  const client: PGliteInterface =
    typeof Worker === 'undefined'
      ? new PGlite({ extensions: { vector } })
      : new PGliteWorker(new Worker(new URL('./pglite.worker.ts', import.meta.url), { type: 'module' }), {
          id: 'sensei-db',
          dataDir: DATA_DIR,
          // No `extensions` here: the worker loads pgvector (see pglite.worker.ts); a client cannot load a bundle.
        })
  return { client, db: drizzle({ client: client as PGlite }) }
}

async function migrate(client: PGliteInterface) {
  await client.exec('CREATE TABLE IF NOT EXISTS _migrations (version integer PRIMARY KEY)')
  const done = await client.query<{ version: number }>('SELECT version FROM _migrations')
  const applied = new Set(done.rows.map((row) => row.version))
  for (const [index, sql] of MIGRATIONS.entries()) {
    if (applied.has(index)) continue
    await client.exec(sql)
    await client.query('INSERT INTO _migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [index])
  }
}

let ready: Promise<{ client: PGliteInterface; db: Db }> | null = null

function start() {
  ready ??= (async () => {
    const opened = open()
    await opened.client.waitReady
    await migrate(opened.client)
    // The old IndexedDB databases are copied in once, the first time the new one is empty.
    const { importLegacyData } = await import('./legacy-import')
    await importLegacyData(opened.db)
    return opened
  })()
  return ready
}

/** The Drizzle database. Every read and write in the app goes through this. */
export async function getDb() {
  return (await start()).db
}

/** The raw PGlite client, for SQL Drizzle does not express (pgvector search). */
export async function getClient() {
  return (await start()).client
}
