/// <reference lib="webworker" />
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { worker } from '@electric-sql/pglite/worker'

/**
 * The one PGlite database, kept in this worker so every tab shares it: tabs elect a leader that owns the storage and
 * the others talk to it, so two tabs never open the same database files at once.
 */
void worker({
  async init(options) {
    return new PGlite({ ...options, extensions: { vector } })
  },
})
