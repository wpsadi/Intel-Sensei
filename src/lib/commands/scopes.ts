import { useEffect } from 'react'
import { create } from 'zustand'

import type { CommandScope } from './types'

interface ScopeEntry {
  token: symbol
  scope: CommandScope
  modal: boolean
}

interface ScopeStackState {
  stack: ScopeEntry[]
  push: (entry: ScopeEntry) => void
  remove: (token: symbol) => void
}

/** The base entry keeps 'global' on the stack even when nothing has pushed it. */
const BASE: ScopeEntry = { token: Symbol('global'), scope: 'global', modal: false }

export const useScopeStack = create<ScopeStackState>()((set) => ({
  stack: [BASE],
  push: (entry) => set((s) => ({ stack: [...s.stack, entry] })),
  remove: (token) => set((s) => ({ stack: s.stack.filter((e) => e.token !== token) })),
}))

/**
 * Returns the stack index that a command in `scope` ranks at, or -1 when it is not live.
 * A scope is not live when it is missing from the stack, or when a modal entry sits above it.
 */
export function scopeRank(scope: CommandScope, stack: ScopeEntry[] = useScopeStack.getState().stack): number {
  let idx = -1
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].scope === scope) {
      idx = i
      break
    }
  }
  if (idx < 0) return -1
  if (stack.slice(idx + 1).some((e) => e.modal)) return -1
  return idx
}

/**
 * Keeps `scope` on the stack while the calling component is mounted.
 * Pass `enabled: false` to drop it without unmounting, e.g. while an editor is hidden.
 */
export function useCommandScope(scope: CommandScope, options: { modal?: boolean; enabled?: boolean } = {}) {
  const { modal = false, enabled = true } = options
  useEffect(() => {
    if (!enabled) return
    const token = Symbol(scope)
    useScopeStack.getState().push({ token, scope, modal })
    return () => useScopeStack.getState().remove(token)
  }, [scope, modal, enabled])
}
