import { create } from 'zustand'

import {
  DEFAULT_SESSION,
  type SandboxOp,
  disposeSandbox,
  mountFiles,
  onSandboxEvent,
  runShellCommand,
  setSandboxRestorer,
  writeSandboxFile,
} from '@/ai/sandbox/client'
import { readMedia } from '@/features/note/db/media'

import { chatsRepo } from '../db/chats.repo'
import { type TerminalSession, type TerminalTab, emptySession, terminalDb } from './terminal-db'

/** Output kept per recorded command. The terminal screen shows what was kept; replaying does not need it. */
const OUTPUT_KEEP = 8000
/** Terminals one chat may have open. */
export const MAX_TERMINALS = 6

const OPEN_KEY = 'ask-sensei:terminal-open'
const HEIGHT_KEY = 'ask-sensei:terminal-height'
const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The layout is a convenience; losing it is fine.
  }
}

interface TerminalState {
  open: boolean
  height: number
  sessions: Record<string, TerminalSession>
  active: Record<string, string>
  setOpen(open: boolean): void
  setHeight(height: number): void
  /** Reads a chat's record from the database, once. */
  load(chatId: string): Promise<TerminalSession>
  setActive(chatId: string, terminalId: string): void
  addTerminal(chatId: string): string | null
  closeTerminal(chatId: string, terminalId: string): void
  renameTerminal(chatId: string, terminalId: string, title: string): void
  /** Forgets a chat's terminals and throws its environment away. */
  removeChat(chatId: string): Promise<void>
}

const loading = new Map<string, Promise<TerminalSession>>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useTerminals = create<TerminalState>()((set, get) => {
  /** Saves a chat's record shortly after it last changed, so a burst of commands is one write. */
  const scheduleSave = (chatId: string) => {
    clearTimeout(saveTimers.get(chatId))
    saveTimers.set(
      chatId,
      setTimeout(() => {
        const session = get().sessions[chatId]
        if (session) void terminalDb.put(session)
      }, 400),
    )
  }
  const change = (chatId: string, fn: (session: TerminalSession) => TerminalSession) => {
    set((state) => ({ sessions: { ...state.sessions, [chatId]: fn(state.sessions[chatId] ?? emptySession(chatId)) } }))
    scheduleSave(chatId)
  }

  return {
    open: read(OPEN_KEY, '0') === '1',
    height: Number(read(HEIGHT_KEY, '288')) || 288,
    sessions: {},
    active: {},
    setOpen(open) {
      write(OPEN_KEY, open ? '1' : '0')
      set({ open })
    },
    setHeight(height) {
      write(HEIGHT_KEY, String(height))
      set({ height })
    },
    load(chatId) {
      const known = get().sessions[chatId]
      if (known) return Promise.resolve(known)
      let pending = loading.get(chatId)
      if (!pending) {
        pending = terminalDb.get(chatId).then((session) => {
          // Commands recorded while this was loading are already in memory: keep them.
          const current = get().sessions[chatId]
          const merged = current ? { ...session, ops: [...session.ops, ...current.ops] } : session
          set((state) => ({ sessions: { ...state.sessions, [chatId]: merged } }))
          loading.delete(chatId)
          return merged
        })
        loading.set(chatId, pending)
      }
      return pending
    },
    setActive: (chatId, terminalId) => set((state) => ({ active: { ...state.active, [chatId]: terminalId } })),
    addTerminal(chatId) {
      const session = get().sessions[chatId] ?? emptySession(chatId)
      if (session.terminals.length >= MAX_TERMINALS) return null
      const used = session.terminals.map((t) => Number(/^Terminal (\d+)$/.exec(t.title)?.[1] ?? 0))
      const tab: TerminalTab = { id: crypto.randomUUID(), title: `Terminal ${Math.max(0, ...used) + 1}` }
      change(chatId, (s) => ({ ...s, terminals: [...s.terminals, tab] }))
      set((state) => ({ active: { ...state.active, [chatId]: tab.id } }))
      return tab.id
    },
    closeTerminal(chatId, terminalId) {
      if (terminalId === 'agent') return
      // Its commands stay in the record: the files they made are still part of the environment.
      change(chatId, (s) => ({ ...s, terminals: s.terminals.filter((t) => t.id !== terminalId) }))
      set((state) => (state.active[chatId] === terminalId ? { active: { ...state.active, [chatId]: 'agent' } } : state))
    },
    renameTerminal: (chatId, terminalId, title) =>
      change(chatId, (s) => ({
        ...s,
        terminals: s.terminals.map((t) => (t.id === terminalId ? { ...t, title: title.trim() || t.title } : t)),
      })),
    async removeChat(chatId) {
      clearTimeout(saveTimers.get(chatId))
      disposeSandbox(chatId)
      await terminalDb.remove(chatId)
      set((state) => {
        const { [chatId]: _s, ...sessions } = state.sessions
        const { [chatId]: _a, ...active } = state.active
        return { sessions, active }
      })
    },
  }
})

/* ---------- recording ---------- */

/** Every command and file write of a chat is kept. Ones that never ran (a stopped or reset environment) are not. */
onSandboxEvent(({ phase, op, failed }) => {
  if (phase !== 'end' || failed || op.session === DEFAULT_SESSION) return
  const kept: SandboxOp = op.kind === 'shell' ? { ...op, output: op.output.slice(0, OUTPUT_KEEP) } : op
  void useTerminals
    .getState()
    .load(op.session)
    .then(() => {
      useTerminals.setState((state) => {
        const session = state.sessions[op.session] ?? emptySession(op.session)
        return { sessions: { ...state.sessions, [op.session]: { ...session, ops: [...session.ops, kept] } } }
      })
      clearTimeout(saveTimers.get(op.session))
      saveTimers.set(
        op.session,
        setTimeout(() => {
          const session = useTerminals.getState().sessions[op.session]
          if (session) void terminalDb.put(session)
        }, 400),
      )
    })
})
/* ---------- restoring ---------- */

/**
 * Puts a chat's environment back after a reload: its attached files, then every recorded command and file write, in
 * order. A step that fails is skipped, as it failed the first time too.
 */
setSandboxRestorer(async (session, signal) => {
  if (session === DEFAULT_SESSION) return
  const record = await terminalDb.get(session)
  const live = useTerminals.getState().sessions[session]
  const ops = live?.ops.length ? live.ops : record.ops
  if (!ops.length) return
  const files = (await chatsRepo.messages(session)).flatMap((message) => message.attachments ?? [])
  await mountFiles(
    files.map((file) => ({ key: file.src, name: file.name, load: () => readMedia(file.src) })),
    signal,
    session,
    true,
  ).catch(() => {})
  for (const op of ops) {
    if (signal.aborted) return
    try {
      if (op.kind === 'write') await writeSandboxFile(op.path, op.content, op.append, signal, { session, replay: true })
      else await runShellCommand(op.command, signal, { session, replay: true })
    } catch {
      // The step failed before too, or the environment was reset: go on with the rest.
    }
  }
})
