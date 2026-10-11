---
name: idb
description: Conventions for using IndexedDB through the `idb` package in this project, including openDB schema upgrades, typed stores with DBSchema, transaction lifetime rules, cursors and async iterators, and wrapping or unwrapping raw IDB objects. Use when creating or editing IndexedDB code, opening or upgrading a client database, or reading and writing large client-side data with `idb`.
---

# idb (IndexedDB) Conventions

`idb` is a small (~1.2 kB brotli) wrapper that mirrors the IndexedDB API but turns every request into a promise and adds shortcuts. Use it instead of raw `IDBRequest` callbacks. It is installed as the `idb` dependency (`^8.0.4`).

Import from the package root only:

```ts
import { openDB, deleteDB, wrap, unwrap } from "idb";
import type { DBSchema, IDBPDatabase, IDBPTransaction, IDBPObjectStore } from "idb";
```

Keep database code in a feature folder, following the layout in `react-ts-project-structure`. Put the open call and the schema in one module (for example `features/<feature>/<feature>.db.ts`, or `lib/db.ts` for an app-wide database) and export typed helpers from it. Components should not call `openDB` directly.

## Define a Typed Schema

Always type the database. Without a schema, keys and values are `any`, and store names are not checked.

```ts
interface IIntelDB extends DBSchema {
  "favourite-number": {
    key: string;
    value: number;
  };
  products: {
    key: string;
    value: { name: string; price: number; productCode: string };
    indexes: { "by-price": number };
  };
}
```

Conventions:
- Interfaces are prefixed with `I`, matching the project's style (`IIntelDB`).
- `key` is the type of the primary key. `value` is the stored value type. `indexes` maps each index name to the type of its key.
- Store names are the object store names. Keep them stable: renaming a store needs a migration (see below).

## Open the Database

```ts
export const dbPromise = openDB<IIntelDB>("intel-sensei", 1, {
  upgrade(db, oldVersion, newVersion, transaction) {
    if (oldVersion < 1) {
      db.createObjectStore("favourite-number");

      const products = db.createObjectStore("products", { keyPath: "productCode" });
      products.createIndex("by-price", "price");
    }
  },
  blocked(currentVersion, blockedVersion, event) {
    // Another tab holds an older connection open. Tell the user to close it.
  },
  blocking(currentVersion, blockedVersion, event) {
    // This connection blocks a newer version from opening. Close it.
    (event.target as IDBDatabase).close();
  },
  terminated() {
    // The browser closed the connection abnormally. Reopen on next use.
  },
});
```

Conventions:
- Open once and reuse the promise (`dbPromise`). Do not call `openDB` per operation.
- Migrations are version-gated. Use `if (oldVersion < N)` blocks so each step runs once and in order, and so a user jumping from version 1 to 3 gets every step.
- Never edit an old `if (oldVersion < N)` block after release. Add a new block with a higher version number.
- In `upgrade`, `transaction` is available for data migrations. Read and rewrite existing records there, and do not await unrelated work.

### Schema migration example

Renaming or dropping a store touches a name the current schema no longer lists. Keep the old shape in its own interface and cast only inside the migration block:

```ts
interface IIntelDBV1 extends DBSchema {
  "favourite-number": { key: string; value: number };
}

upgrade(db, oldVersion, _newVersion, transaction) {
  if (oldVersion < 2) {
    // Rename in place during versionchange. Store.name is writable only in this phase.
    const v1Tx = transaction as unknown as IDBPTransaction<IIntelDBV1, ["favourite-number"], "versionchange">;
    v1Tx.objectStore("favourite-number").name = "fave-nums";
  }
}
```

To drop a store instead, call `(db as unknown as IDBPDatabase<IIntelDBV1>).deleteObjectStore("favourite-number")`. The cast only affects compile-time checks. Keep it inside the migration block, not in app code. Confirm the rename in a test before relying on it, because the typed schema will not check it.

## Shortcuts on the Database

For one-off operations, use the database methods. Each opens and closes its own transaction.

```ts
const db = await dbPromise;

await db.put("favourite-number", 7, "Jen");   // value first, then key
const n = await db.get("favourite-number", "Jen");
await db.delete("favourite-number", "Jen");
const all = await db.getAll("products");
const cheap = await db.getAllFromIndex("products", "by-price", IDBKeyRange.upperBound(10));
```

Available shortcuts: `get`, `getKey`, `getAll`, `getAllKeys`, `count`, `put`, `add`, `delete`, `clear`. Index versions: `getFromIndex`, `getKeyFromIndex`, `getAllFromIndex`, `getAllKeysFromIndex`, `countFromIndex`.

Argument order matches the raw IDB methods: `put(storeName, value, key?)`. Mixing up value and key is the most common mistake, and TypeScript catches it through the schema.

## Transactions

Use an explicit transaction when several operations must succeed or fail together, or when you read and then write.

```ts
const db = await dbPromise;
const tx = db.transaction("products", "readwrite");
const store = tx.store; // only set when the transaction covers one store

await Promise.all([
  store.put({ productCode: "A1", name: "Widget", price: 5 }),
  store.put({ productCode: "B2", name: "Gadget", price: 12 }),
  tx.done,
]);
```

Rules:
- **Transactions auto-close.** A transaction closes as soon as no requests are pending and microtasks have run. Do not `await fetch(...)`, timers, or other non-IDB work between the start and end of a transaction. Read the data you need first, do the async work outside, then open a new transaction to write.
- Use `tx.store` only for single-store transactions. For several stores, call `tx.objectStore("name")`.
- Await `tx.done` to know the commit succeeded. It rejects with the transaction error. Await individual operations too when you need the specific failing request's error.
- Use `"readonly"` for reads. Do not open a `"readwrite"` transaction just to read.

Read-then-write (correct):

```ts
const db = await dbPromise;
const tx = db.transaction("favourite-number", "readwrite");
const current = (await tx.store.get("counter")) ?? 0;
await tx.store.put(current + 1, "counter");
await tx.done;
```

Read, fetch, then write (correct, because the fetch happens outside the transaction):

```ts
const db = await dbPromise;
const current = (await db.get("favourite-number", "counter")) ?? 0;
const next = await fetch(`/increment?val=${current}`).then((r) => r.json());
await db.put("favourite-number", next, "counter");
```

The second form is not atomic. If two tabs run it at once, one update can overwrite the other. When that matters, put a version or compare-and-set field in the value and check it inside a single `readwrite` transaction after the fetch, or serialize writes in one place.

## Cursors and Iteration

Cursor advance methods return a promise for the next cursor, or `null` when done:

```ts
const tx = db.transaction("products");
let cursor = await tx.store.openCursor();
while (cursor) {
  console.log(cursor.key, cursor.value);
  cursor = await cursor.continue();
}
await tx.done;
```

Prefer async iteration. It is shorter, and `continue()` is called for you when you do not advance manually:

```ts
const tx = db.transaction("products");
for await (const cursor of tx.store) {
  console.log(cursor.value);
}
await tx.done;
```

Inside an async iterator, `cursor.advance(n)` and `cursor.continue()` return `void`. Call them to skip records. Do not `await` them.

Iterate an index with a key or range:

```ts
const tx = db.transaction("products");
for await (const cursor of tx.store.index("by-price").iterate(IDBKeyRange.upperBound(10))) {
  console.log(cursor.value.name);
}
await tx.done;
```

Update records during iteration with `cursor.update(newValue)`. Finish with `await tx.done`.

## Wrap and Unwrap

- `wrap(rawObject)` adds `idb` behavior to a raw `IDBDatabase`, transaction, or request. Use it when third-party code hands you a raw object.
- `unwrap(wrapped)` returns the plain IndexedDB object. Use it to drop back to raw IDB for something `idb` does not support. Promises are converted back to `IDBRequest`.

Do not use either in normal app code. Reach for them only at boundaries with code you do not control.

## Deleting a Database

```ts
await deleteDB("intel-sensei", {
  blocked(currentVersion, blockedVersion, event) {
    // Open connections in other tabs did not close after versionchange.
  },
});
```

Close your own connection first (`(await dbPromise).close()`) and clear `dbPromise` if the module keeps one, or the delete will be blocked by this tab.

## Rules

- Do not store server data here by default. Server data belongs in TanStack Query. Use IndexedDB for large or offline client data, or for data that must survive reloads and is too large for `localStorage`. For small persisted UI preferences, use the `zustand-store` persist pattern.
- Keep the schema and the store names in one place. Components read through typed helper functions, not raw store names.
- Use `IDBKeyRange` for range queries. Do not filter a full `getAll` in JavaScript when a range or index works.
- Store only structured-cloneable values: plain objects, arrays, `Date`, `Blob`, `ArrayBuffer`. Do not store functions, DOM nodes, or class instances that lose their prototype.
- Wrap every database call in error handling at the boundary where the UI reacts to it. Quota errors and blocked upgrades are real in browsers.
- Do not leave a database connection open forever in a module that will be replaced at runtime. Close it on `versionchange` (the `blocking` callback) so new versions can open.
