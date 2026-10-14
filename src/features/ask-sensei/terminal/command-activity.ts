import { create } from 'zustand'

import { onSandboxEvent } from '@/ai/sandbox/client'

/** Commands running now, by chat and terminal: counted from the moment one starts to the moment it ends. */
const useCommandActivity = create<{ running: Record<string, Record<string, number>> }>()(() => ({ running: {} }))

onSandboxEvent(({ phase, op }) => {
  // A file write is over in an instant: only commands are worth a spinner.
  if (op.kind !== 'shell') return
  useCommandActivity.setState(({ running }) => {
    const terminals = running[op.session] ?? {}
    const count = Math.max(0, (terminals[op.terminalId] ?? 0) + (phase === 'start' ? 1 : -1))
    return { running: { ...running, [op.session]: { ...terminals, [op.terminalId]: count } } }
  })
})

/** Whether a command is running in any terminal of the chat. */
export const useCommandRunning = (chatId: string | null | undefined) =>
  useCommandActivity((state) => (chatId ? Object.values(state.running[chatId] ?? {}).some((count) => count > 0) : false))

/** Whether a command is running in one terminal of the chat. */
export const useTerminalRunning = (chatId: string, terminalId: string) =>
  useCommandActivity((state) => (state.running[chatId]?.[terminalId] ?? 0) > 0)
