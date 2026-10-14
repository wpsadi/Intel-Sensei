import type { DBSchema, IDBPDatabase } from 'idb'

import { fromUtf8, utf8 } from './bytes'
import { deserialize, serialize } from './serialize'
import { vault } from './vault'

/**
 * Wraps an `idb` database so records are encrypted on the way in and decrypted on the way out.
 *
 * A record is stored as its key and index fields in the clear (IndexedDB needs those to look things up) plus an
 * `__enc` field holding the whole record, encrypted. Reads accept both forms, so a half-finished migration, or a
 * database that was never encrypted, keeps working.
 */
const ENC = '__enc'

interface StoreInfo {
  keyPath: string | string[] | null
  indexNames: ArrayLike<string>
  index(name: string): { keyPath: string | string[] }
}

// oxlint-disable-next-line typescript/no-explicit-any -- records are arbitrary app objects
type Rec = any

const fieldCache = new Map<string, string[]>()

function plainFields(cacheKey: string, store: StoreInfo): string[] {
  let fields = fieldCache.get(cacheKey)
  if (!fields) {
    const paths = [store.keyPath, ...Array.from(store.indexNames, (name) => store.index(name).keyPath)]
    fields = [...new Set(paths.flat().filter((path): path is string => typeof path === 'string'))]
    fieldCache.set(cacheKey, fields)
  }
  return fields
}

async function seal(fields: string[], value: Rec): Promise<Rec> {
  if (!vault.encrypting || !value || typeof value !== 'object') return value
  const out: Rec = {}
  for (const field of fields) if (field in value) out[field] = value[field]
  out[ENC] = await vault.encrypt(utf8(serialize(value)))
  return out
}

async function open(value: Rec): Promise<Rec> {
  if (!value || typeof value !== 'object' || !(ENC in value)) return value
  return deserialize(fromUtf8(await vault.decrypt(value[ENC])))
}

const openAll = (values: Rec[]) => Promise.all(values.map(open))

export function secureDb<T extends DBSchema>(typedDb: IDBPDatabase<T>, dbName: string): IDBPDatabase<T> {
  const db = typedDb as unknown as IDBPDatabase<never>
  const fieldsOf = (storeName: string) =>
    plainFields(`${dbName}/${storeName}`, db.transaction(storeName as never).store as unknown as StoreInfo)
  const raw = db as unknown as Record<string, (...args: unknown[]) => Promise<Rec>>

  const ops: Record<string, (...args: Rec[]) => unknown> = {
    get: async (store, key) => open(await raw.get(store, key)),
    getAll: async (store, ...rest) => openAll(await raw.getAll(store, ...rest)),
    getFromIndex: async (store, index, key) => open(await raw.getFromIndex(store, index, key)),
    getAllFromIndex: async (store, index, ...rest) => openAll(await raw.getAllFromIndex(store, index, ...rest)),
    put: async (store, value, key) => raw.put(store, await seal(fieldsOf(store), value), key),
    add: async (store, value, key) => raw.add(store, await seal(fieldsOf(store), value), key),
    transaction: (...args) => (vault.key ? virtualTransaction(args[0]) : (db.transaction as Rec)(...args)),
  }

  /**
   * An encrypted store cannot use one real IndexedDB transaction across `await`s, because the browser closes a
   * transaction as soon as it has nothing pending and decrypting is asynchronous. So with a key loaded, a
   * "transaction" is a set of separate operations. Each one is still atomic; the group is not.
   */
  function virtualTransaction(names: string | string[]) {
    const pending: Promise<unknown>[] = []
    const track = <R>(promise: Promise<R>) => {
      pending.push(promise.catch(() => undefined))
      return promise
    }
    const storeFor = (name: string) => ({
      get: (key: unknown) => track(ops.get(name, key) as Promise<Rec>),
      getAll: (...rest: unknown[]) => track(ops.getAll(name, ...rest) as Promise<Rec>),
      put: (value: Rec, key?: unknown) => track(ops.put(name, value, key) as Promise<Rec>),
      add: (value: Rec, key?: unknown) => track(ops.add(name, value, key) as Promise<Rec>),
      delete: (key: unknown) => track(raw.delete(name, key)),
      getAllKeys: (...rest: unknown[]) => track(raw.getAllKeys(name, ...rest)),
      count: (...rest: unknown[]) => track(raw.count(name, ...rest)),
      clear: () => track(raw.clear(name)),
      index: (index: string) => ({
        get: (key: unknown) => track(ops.getFromIndex(name, index, key) as Promise<Rec>),
        getAll: (...rest: unknown[]) => track(ops.getAllFromIndex(name, index, ...rest) as Promise<Rec>),
        getAllKeys: (...rest: unknown[]) => track(raw.getAllKeysFromIndex(name, index, ...rest)),
        count: (...rest: unknown[]) => track(raw.countFromIndex(name, index, ...rest)),
      }),
    })
    const first = typeof names === 'string' ? names : names[0]
    return {
      store: storeFor(first),
      objectStore: storeFor,
      // Resolves once everything started so far has settled; callers await it after their own awaits.
      get done() {
        return Promise.all(pending).then(() => undefined)
      },
      abort: () => undefined,
      commit: () => undefined,
    }
  }

  return new Proxy(typedDb, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in ops) return ops[prop]
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : (Reflect.get(target, prop, receiver) as unknown)
    },
  })
}
