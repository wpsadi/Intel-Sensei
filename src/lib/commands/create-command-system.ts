import {
  type HotkeyCallback,
  detectPlatform,
  formatForDisplay,
  getHotkeyManager,
  getSequenceManager,
  normalizeHotkey,
} from '@tanstack/react-hotkeys'
import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { scopeRank } from './scopes'
import type { Binding, CommandDef, CommandDefs, CommandScope, DefaultBindings } from './types'

/** Set while a recorder is capturing keys, so the dispatcher stays quiet. Counted, so overlapping recorders nest. */
let recordingCount = 0
export function setRecording(on: boolean) {
  recordingCount = Math.max(0, recordingCount + (on ? 1 : -1))
}

export function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

/** Canonical string for a binding, so equal bindings compare equal across platforms ('Mod+Z' is 'Meta+Z' on Mac). */
export function bindingKey(binding: Binding, platform = detectPlatform()): string {
  return Array.isArray(binding) ? binding.map((h) => normalizeHotkey(h, platform)).join(' ') : normalizeHotkey(binding, platform)
}

/** Platform-aware display: ⌘⇧Z on Mac, Ctrl+Shift+Z elsewhere. Each step of a sequence is formatted for the platform, joined by a space. */
export function formatBinding(binding: Binding, platform = detectPlatform()): string {
  return Array.isArray(binding)
    ? binding.map((step) => formatForDisplay(step, { platform })).join(' ')
    : formatForDisplay(binding, { platform })
}

interface Entry<Id extends string> {
  id: Id
  binding: Binding
}

interface OverrideState {
  /** Per-command user bindings. An empty array means the user unbound the command. */
  overrides: Partial<Record<string, Binding[]>>
}

export interface CommandSystem<Id extends string> {
  commands: CommandDefs<Id>
  defaults: DefaultBindings<Id>
  ids: Id[]
  /** Effective bindings: the user's override when there is one, otherwise the default. */
  bindingsOf: (id: Id) => Binding[]
  /** Display label of the first binding, or undefined when the command has none. */
  labelOf: (id: Id) => string | undefined
  /** True when the command is enabled. Does not check its scope, since menus only show live commands. */
  isEnabled: (id: Id) => boolean
  /** Runs a command directly, for menus and buttons. Skips it when `enabled()` is false. */
  run: (id: Id) => void
  /** Replaces the user's bindings for a command. Pass [] to unbind it. */
  setBindings: (id: Id, bindings: Binding[]) => void
  resetBindings: (id: Id) => void
  resetAll: () => void
  /** Other commands with the same binding in the same scope. Those are real clashes; different scopes shadow by rank. */
  findConflicts: (id: Id, binding: Binding) => Array<{ id: Id; scope: CommandScope }>
  /** React hook: the command's effective bindings. Re-renders when the user changes them. */
  useBindings: (id: Id) => Binding[]
  /** React hook: the command's display label. Re-renders when the user changes its bindings. */
  useLabel: (id: Id) => string | undefined
  /**
   * Supplies the implementation of a command while the calling component is mounted, for actions that need component state.
   * The newest mounted handler wins. `run` and `enabled` here replace the ones in the command definition.
   */
  useCommandHandler: (id: Id, handler: Partial<Pick<CommandDef, 'run' | 'enabled'>> | null) => void
  /**
   * Mounts the dispatcher that turns key presses into commands. Call it once, near the app root.
   * Mounting it twice makes every key fire twice.
   */
  useDispatcher: () => void
}

/**
 * Builds a typed command system: commands in one map, default bindings in another, and user overrides on top.
 * `storageKey` names the localStorage entry that holds the user's overrides.
 */
export function createCommandSystem<Id extends string>(options: {
  storageKey: string
  commands: CommandDefs<Id>
  defaults: DefaultBindings<Id>
}): CommandSystem<Id> {
  const { commands, defaults } = options
  const ids = Object.keys(commands) as Id[]

  const useOverrides = create<
    OverrideState & {
      set: (id: Id, bindings: Binding[]) => void
      reset: (id: Id) => void
      resetAll: () => void
    }
  >()(
    persist(
      (set) => ({
        overrides: {},
        set: (id, bindings) => set((s) => ({ overrides: { ...s.overrides, [id]: bindings } })),
        reset: (id) =>
          set((s) => {
            const { [id]: _removed, ...rest } = s.overrides
            return { overrides: rest }
          }),
        resetAll: () => set({ overrides: {} }),
      }),
      {
        name: options.storageKey,
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({ overrides: s.overrides }),
      },
    ),
  )

  // Handlers from mounted components, oldest first. The last one is the live implementation.
  const handlers = new Map<Id, Array<Partial<Pick<CommandDef, 'run' | 'enabled'>>>>()
  const resolve = (id: Id): CommandDef => {
    const top = handlers.get(id)?.at(-1)
    return top ? { ...commands[id], ...top } : commands[id]
  }

  const bindingsOf = (id: Id): Binding[] => useOverrides.getState().overrides[id] ?? defaults[id] ?? []

  const labelOf = (id: Id) => {
    const [first] = bindingsOf(id)
    return first === undefined ? undefined : formatBinding(first)
  }

  const isEnabled = (id: Id) => {
    const def = resolve(id)
    return !def.enabled || def.enabled()
  }

  const run = (id: Id) => {
    if (isEnabled(id)) resolve(id).run()
  }

  const findConflicts = (id: Id, binding: Binding) => {
    const key = bindingKey(binding)
    const scope = commands[id].scope
    return ids.flatMap((other) => {
      if (other === id || commands[other].scope !== scope) return []
      return bindingsOf(other).some((b) => bindingKey(b) === key) ? [{ id: other, scope }] : []
    })
  }

  /** Dispatches one key press. The highest-ranked live command that passes its guards wins. */
  const dispatch = (entries: Array<Entry<Id>>, event: KeyboardEvent) => {
    if (recordingCount > 0) return
    const inInput = isEditableTarget(event.target)
    let best: { entry: Entry<Id>; rank: number } | null = null
    for (const entry of entries) {
      const def = resolve(entry.id)
      const rank = scopeRank(def.scope)
      if (rank < 0) continue
      if (inInput && !def.allowInInputs) continue
      if (def.enabled && !def.enabled()) continue
      if (!best || rank > best.rank) best = { entry, rank }
    }
    if (!best) return
    const def = resolve(best.entry.id)
    event.preventDefault()
    if (event.repeat && !def.allowRepeat) return
    def.run(event)
  }

  const useDispatcher = () => {
    const overrides = useOverrides((s) => s.overrides)
    useEffect(() => {
      // Group by canonical binding so each key or sequence is registered once and every candidate sees the same press.
      const index = new Map<string, Array<Entry<Id>>>()
      for (const id of ids) {
        if (commands[id].keyboard === false) continue
        for (const binding of bindingsOf(id)) {
          const key = bindingKey(binding)
          const list = index.get(key) ?? []
          list.push({ id, binding })
          index.set(key, list)
        }
      }
      // conflictBehavior 'allow' because several commands may share a key across scopes. Our dispatcher resolves them.
      // ignoreInputs stays off: the dispatcher filters inputs per command through `allowInInputs`.
      const registerOptions = { conflictBehavior: 'allow' as const, ignoreInputs: false, preventDefault: false, stopPropagation: false }
      const handles = [...index.values()].map((entries) => {
        const cb: HotkeyCallback = (event) => dispatch(entries, event)
        const [first] = entries
        return Array.isArray(first.binding)
          ? getSequenceManager().register(first.binding, cb, registerOptions)
          : getHotkeyManager().register(first.binding, cb, registerOptions)
      })
      return () => handles.forEach((h) => h.unregister())
      // `overrides` changes whenever a user binding changes, which is when the index must be rebuilt.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overrides])
  }

  return {
    commands,
    defaults,
    ids,
    bindingsOf,
    labelOf,
    isEnabled,
    run,
    setBindings: (id, bindings) => useOverrides.getState().set(id, bindings),
    resetBindings: (id) => useOverrides.getState().reset(id),
    resetAll: () => useOverrides.getState().resetAll(),
    findConflicts,
    useBindings: (id) => {
      useOverrides((s) => s.overrides[id])
      return bindingsOf(id)
    },
    useLabel: (id) => {
      useOverrides((s) => s.overrides[id])
      return labelOf(id)
    },
    useCommandHandler: (id, handler) => {
      useEffect(() => {
        if (!handler) return
        const list = handlers.get(id) ?? []
        handlers.set(id, [...list, handler])
        return () => {
          handlers.set(
            id,
            (handlers.get(id) ?? []).filter((h) => h !== handler),
          )
        }
      }, [id, handler])
    },
    useDispatcher,
  }
}
