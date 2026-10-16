import type { SandboxOp } from '@/ai/sandbox/client'
import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

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

export const terminalStore = recordStore<TerminalSession>(t.terminalSessions, { key: 'chatId' })

/** The terminal Sensei's own commands run in. It is always there, first. */
export const AGENT_TERMINAL: TerminalTab = { id: 'agent', title: 'Sensei' }

export const emptySession = (chatId: string): TerminalSession => ({ chatId, terminals: [AGENT_TERMINAL], ops: [] })

export const terminalDb = {
  async get(chatId: string): Promise<TerminalSession> {
    const saved = await terminalStore.get(chatId)
    if (!saved) return emptySession(chatId)
    return saved.terminals.some((t) => t.id === AGENT_TERMINAL.id) ? saved : { ...saved, terminals: [AGENT_TERMINAL, ...saved.terminals] }
  },
  async put(session: TerminalSession) {
    await terminalStore.put(session)
  },
  async remove(chatId: string) {
    await terminalStore.remove(chatId)
  },
}
