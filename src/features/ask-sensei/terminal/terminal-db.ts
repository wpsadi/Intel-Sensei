import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { SandboxOp } from '@/ai/sandbox/client'
import { secureDb } from '@/features/vault/secure-db'

/** One terminal tab of a chat. Terminals of a chat share its environment: the same files, with a screen of their own. */
export interface TerminalTab {
  id: string
  title: string
}

/** Everything a chat's terminals did, in order. Running `ops` again in a fresh environment brings back its files. */
export interface TerminalSession {
  chatId: string
  terminals: TerminalTab[]
  ops: SandboxOp[]
}

interface ITerminalDB extends DBSchema {
  sessions: { key: string; value: TerminalSession }
}

const DB_NAME = 'sensei-terminals'
let dbPromise: Promise<IDBPDatabase<ITerminalDB>> | null = null

const getTerminalDb = () =>
  (dbPromise ??= openDB<ITerminalDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'chatId' })
    },
    blocking() {
      void dbPromise?.then((db) => db.close())
      dbPromise = null
    },
  }).then((db) => secureDb(db, DB_NAME)))

/** The terminal Sensei's own commands run in. It is always there, first. */
export const AGENT_TERMINAL: TerminalTab = { id: 'agent', title: 'Sensei' }

export const emptySession = (chatId: string): TerminalSession => ({ chatId, terminals: [AGENT_TERMINAL], ops: [] })

export const terminalDb = {
  async get(chatId: string): Promise<TerminalSession> {
    const saved = await (await getTerminalDb()).get('sessions', chatId)
    if (!saved) return emptySession(chatId)
    return saved.terminals.some((t) => t.id === AGENT_TERMINAL.id) ? saved : { ...saved, terminals: [AGENT_TERMINAL, ...saved.terminals] }
  },
  async put(session: TerminalSession) {
    await (await getTerminalDb()).put('sessions', session)
  },
  async remove(chatId: string) {
    await (await getTerminalDb()).delete('sessions', chatId)
  },
}
