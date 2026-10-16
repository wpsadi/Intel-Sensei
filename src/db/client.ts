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
let legacy: Promise<number> = Promise.resolve(0)

function start() {
  ready ??= (async () => {
    const t0 = performance.now()
    const opened = open()
    await opened.client.waitReady
    const t1 = performance.now()
    await migrate(opened.client)
    const t2 = performance.now()
    // The password profile of the old database comes in before the app starts (the lock screen needs it); the rest of the
    // old data is copied in the background below, so a slow or broken import can never keep the app from opening.
    const { importLegacyData, importLegacyProfile } = await import('./legacy-import')
    await importLegacyProfile(opened.client, opened.db)
    console.info(
      `[sensei-db] ready in ${Math.round(performance.now() - t0)}ms (PGlite start ${Math.round(t1 - t0)}ms, schema ${Math.round(t2 - t1)}ms)`,
    )
    legacy = importLegacyData(opened.client, opened.db).then((copied) => {
      // The app has already read its data (empty): show what just arrived.
      if (copied && typeof Worker !== 'undefined') {
        console.info('[sensei-db] reloading to show the imported data')
        window.location.reload()
      }
      return copied
    })
    return opened
  })()
  return ready
}

/** Resolves once the old IndexedDB data has been copied in (and with how many records). For tests. */
export async function whenLegacyImported() {
  await start()
  return legacy
}

/** The Drizzle database. Every read and write in the app goes through this. */
export async function getDb() {
  return (await start()).db
}

/** The raw PGlite client, for SQL Drizzle does not express (pgvector search). */
export async function getClient() {
  return (await start()).client
}
