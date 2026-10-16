import { type SQL, eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'

import { toBase64 } from '@/features/vault/bytes'

import { type Executor, getDb } from './client'
import { open, seal } from './seal'

type Columns = Record<string, unknown>

interface StoreOptions<T> {
  /** The primary key column's property name on the table (`id`, `key`, `name`, `chatId`). */
  key: string
  /** The value of every plain column (parents, sort fields) for a record: the ones queries filter and sort on. */
  columns?: (value: T) => Columns
  /** Records of a table that is never encrypted (the password record that unlocks everything else). */
  plain?: boolean
}

/** A table of records. Rows hold what queries need as columns and the whole record in `data`, sealed by the vault. */
export function recordStore<T extends object>(table: PgTable, options: StoreOptions<T>) {
  const cols = table as unknown as Record<string, AnyPgColumn>
  const keyColumn = cols[options.key]
  const rowOf = async (value: T): Promise<Columns> => ({
    [options.key]: (value as Record<string, unknown>)[options.key],
    ...options.columns?.(value),
    data: options.plain ? JSON.parse(JSON.stringify(value)) : await seal(value),
  })
  /** The row for a record that arrived already encrypted (copied from the old database while the vault was locked). */
  const sealedRowOf = (value: T, ciphertext: Uint8Array): Columns => {
    const { [options.key]: key, ...columns } = {
      [options.key]: (value as Record<string, unknown>)[options.key],
      ...options.columns?.(value),
    }
    // Fields the old database never indexed are not readable beside the ciphertext: a number column gets 0 until the
    // vault is unlocked and `reseal` rewrites the row with the real values.
    for (const [name, field] of Object.entries(columns)) {
      if (field === undefined || (typeof field === 'number' && !Number.isFinite(field)))
        columns[name] = cols[name]?.dataType.startsWith('number') ? 0 : null
    }
    return { [options.key]: key, ...columns, data: { __enc: toBase64(ciphertext) } }
  }
  const read = async (rows: { data: unknown }[]) => Promise.all(rows.map((row) => (options.plain ? (row.data as T) : open<T>(row.data))))
  const run = async (ex?: Executor) => ex ?? (await getDb())

  return {
    table,
    column: (name: string) => cols[name],

    async get(key: string, ex?: Executor): Promise<T | undefined> {
      const rows = await (await run(ex)).select().from(table).where(eq(keyColumn, key)).limit(1)
      return (await read(rows as { data: unknown }[]))[0]
    },

    /** Records matching a condition, ordered as asked; every record when there is no condition. */
    async list(query: { where?: SQL; orderBy?: (SQL | AnyPgColumn)[]; limit?: number } = {}, ex?: Executor): Promise<T[]> {
      let select = (await run(ex)).select().from(table).$dynamic()
      if (query.where) select = select.where(query.where)
      if (query.orderBy?.length) select = select.orderBy(...query.orderBy)
      if (query.limit !== undefined) select = select.limit(query.limit)
      return read((await select) as { data: unknown }[])
    },

    async keys(where?: SQL, ex?: Executor): Promise<string[]> {
      let select = (await run(ex)).select({ key: keyColumn }).from(table).$dynamic()
      if (where) select = select.where(where)
      return (await select).map((row) => row.key as string)
    },

    /** Inserts or replaces a record. */
    async put(value: T, ex?: Executor) {
      const row = await rowOf(value)
      const { [options.key]: _key, ...changes } = row
      await (await run(ex)).insert(table).values(row).onConflictDoUpdate({ target: keyColumn, set: changes })
    },

    /**
     * Saves a record whose body is already encrypted (copied from the old IndexedDB while the vault is locked). `value` is
     * only what stayed readable beside the ciphertext: the key and the plain columns.
     */
    async putSealed(value: T, ciphertext: Uint8Array, ex?: Executor) {
      const row = sealedRowOf(value, ciphertext)
      const { [options.key]: _key, ...changes } = row
      await (await run(ex)).insert(table).values(row).onConflictDoUpdate({ target: keyColumn, set: changes })
    },

    /**
     * Adds many records in one statement, keeping any record that is already there: this is how the old IndexedDB data
     * comes in, and it must never overwrite what the new database has since saved. `cipher` marks an already-encrypted body.
     */
    async addMany(items: { value: T; cipher?: Uint8Array }[], ex?: Executor) {
      if (!items.length) return
      const rows = await Promise.all(items.map(({ value, cipher }) => (cipher ? sealedRowOf(value, cipher) : rowOf(value))))
      await (await run(ex)).insert(table).values(rows).onConflictDoNothing({ target: keyColumn })
    },

    async remove(key: string, ex?: Executor) {
      await (await run(ex)).delete(table).where(eq(keyColumn, key))
    },

    async removeWhere(where: SQL, ex?: Executor) {
      await (await run(ex)).delete(table).where(where)
    },

    async clear(ex?: Executor) {
      await (await run(ex)).delete(table)
    },

    /** Raw rows, for rewriting every record in the vault's current mode. */
    async reseal(ex?: Executor) {
      for (const record of await this.list({}, ex)) await this.put(record, ex)
    },
  }
}

export type RecordStore<T extends object> = ReturnType<typeof recordStore<T>>
