// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bindingKey, createCommandSystem, formatBinding } from './create-command-system'
import { scopeRank, useCommandScope, useScopeStack } from './scopes'

let seq = 0
const nextKey = () => `test-commands-${++seq}`

const noop = () => {}

function makeSystem(storageKey = nextKey()) {
  return createCommandSystem({
    storageKey,
    commands: {
      undo: { label: 'Undo', scope: 'global', run: noop },
      redo: { label: 'Redo', scope: 'global', run: noop },
      close: { label: 'Close', scope: 'dialog', run: noop },
      zoom: { label: 'Zoom', scope: 'editor', run: noop },
      cut: { label: 'Cut', scope: 'editor', run: noop },
    },
    defaults: {
      undo: ['Mod+Z'],
      redo: ['Mod+Shift+Z', 'Mod+Y'],
      close: ['Escape'],
      zoom: ['Mod+J'],
      cut: ['Mod+J'],
    },
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  useScopeStack.setState({ stack: useScopeStack.getState().stack.slice(0, 1) })
})

describe('bindingKey', () => {
  // The library canonicalizes to 'Mod' when the platform allows it, so Mod and the explicit modifier compare equal.
  it('gives Mod+Z on mac, equal to Meta+Z', () => {
    expect(bindingKey('Mod+Z', 'mac')).toBe('Mod+Z')
    expect(bindingKey('Mod+Z', 'mac')).toBe(bindingKey('Meta+Z', 'mac'))
  })

  it('gives Mod+Z on windows, equal to Control+Z', () => {
    expect(bindingKey('Mod+Z', 'windows')).toBe('Mod+Z')
    expect(bindingKey('Mod+Z', 'windows')).toBe(bindingKey('Control+Z', 'windows'))
  })

  it('keeps Meta+Z distinct from Mod+Z on windows', () => {
    expect(bindingKey('Meta+Z', 'windows')).not.toBe(bindingKey('Mod+Z', 'windows'))
  })

  it('joins sequence steps with a space', () => {
    expect(bindingKey(['Mod+K', 'Mod+S'], 'windows')).toBe('Mod+K Mod+S')
    expect(bindingKey(['G', 'G'], 'mac')).toBe('G G')
  })
})

describe('formatBinding', () => {
  it('shows Mac symbols for Mod+Shift+Z on mac', () => {
    const out = formatBinding('Mod+Shift+Z', 'mac')
    expect(out).toContain('⌘')
    expect(out).toContain('⇧')
    expect(out).not.toContain('Ctrl')
  })

  it('shows Ctrl and Shift for Mod+Shift+Z on windows', () => {
    expect(formatBinding('Mod+Shift+Z', 'windows')).toBe('Ctrl+Shift+Z')
  })

  it('joins plain sequence steps with a space', () => {
    expect(formatBinding(['G', 'G'], 'windows')).toBe('G G')
  })

  // Each sequence step is formatted for the platform, so Mod resolves per step.
  it('formats Mod steps in a sequence with the platform label', () => {
    expect(formatBinding(['Mod+K', 'Mod+S'], 'windows')).toBe('Ctrl+K Ctrl+S')
  })
})

describe('createCommandSystem', () => {
  it('labelOf returns the label of the first binding', () => {
    const system = makeSystem()
    expect(system.labelOf('redo')).toBe(formatBinding('Mod+Shift+Z'))
  })

  it('labelOf returns undefined for a command with no bindings', () => {
    const system = createCommandSystem({
      storageKey: nextKey(),
      commands: { solo: { label: 'Solo', scope: 'global', run: noop } },
      defaults: {},
    })
    expect(system.labelOf('solo')).toBeUndefined()
  })

  it('setBindings overrides the default and labelOf follows', () => {
    const system = makeSystem()
    system.setBindings('undo', ['Mod+U'])
    expect(system.bindingsOf('undo')).toEqual(['Mod+U'])
    expect(system.labelOf('undo')).toBe(formatBinding('Mod+U'))
  })

  it('resetBindings restores the default for one command only', () => {
    const system = makeSystem()
    system.setBindings('undo', ['Mod+U'])
    system.setBindings('redo', [])
    system.resetBindings('undo')
    expect(system.bindingsOf('undo')).toEqual(['Mod+Z'])
    expect(system.bindingsOf('redo')).toEqual([])
  })

  it('resetAll clears every override', () => {
    const storageKey = nextKey()
    const system = makeSystem(storageKey)
    system.setBindings('undo', ['Mod+U'])
    system.setBindings('zoom', [])
    system.resetAll()
    expect(system.bindingsOf('undo')).toEqual(['Mod+Z'])
    expect(system.bindingsOf('zoom')).toEqual(['Mod+J'])
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null').state.overrides).toEqual({})
  })

  it('setBindings with an empty array unbinds the command', () => {
    const system = makeSystem()
    system.setBindings('undo', [])
    expect(system.bindingsOf('undo')).toEqual([])
    expect(system.labelOf('undo')).toBeUndefined()
  })

  it('persists overrides to localStorage under storageKey', () => {
    const storageKey = nextKey()
    const system = makeSystem(storageKey)
    system.setBindings('undo', ['Mod+U'])
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    expect(saved.state.overrides).toEqual({ undo: ['Mod+U'] })
  })

  it('restores overrides from localStorage when a system is built again with the same key', () => {
    const storageKey = nextKey()
    makeSystem(storageKey).setBindings('undo', ['Mod+U'])
    expect(makeSystem(storageKey).bindingsOf('undo')).toEqual(['Mod+U'])
  })

  it('findConflicts returns same-scope commands with the same binding', () => {
    const system = makeSystem()
    // zoom and cut are both editor commands on Mod+J.
    expect(system.findConflicts('zoom', 'Mod+J')).toEqual([{ id: 'cut', scope: 'editor' }])
  })

  it('findConflicts matches on canonical key, so Control+J clashes with Mod+J on windows and linux', () => {
    const system = makeSystem()
    expect(system.findConflicts('zoom', 'Control+J')).toEqual([{ id: 'cut', scope: 'editor' }])
  })

  it('findConflicts ignores commands in a different scope', () => {
    const system = makeSystem()
    // close is a dialog command bound to Escape. Escape in another scope is not a clash.
    expect(system.findConflicts('zoom', 'Escape')).toEqual([])
    // undo is global and redo is global with Mod+Shift+Z, so this is a real clash.
    expect(system.findConflicts('undo', 'Mod+Shift+Z')).toEqual([{ id: 'redo', scope: 'global' }])
  })

  it('findConflicts sees the user override, not the default', () => {
    const system = makeSystem()
    system.setBindings('cut', ['Mod+X'])
    expect(system.findConflicts('zoom', 'Mod+J')).toEqual([])
  })

  it('findConflicts never reports the command itself', () => {
    const system = makeSystem()
    expect(system.findConflicts('zoom', 'Mod+J').map((c) => c.id)).not.toContain('zoom')
  })
})

describe('scopes', () => {
  type Scope = 'global' | 'editor' | 'scene' | 'dialog'
  const stack = (...scopes: Array<{ scope: Scope; modal?: boolean }>) => [
    { token: Symbol('base'), scope: 'global' as const, modal: false },
    ...scopes.map((s) => ({ token: Symbol(s.scope), scope: s.scope, modal: s.modal ?? false })),
  ]

  it('scopeRank returns -1 for a scope that is not on the stack', () => {
    expect(scopeRank('editor', stack())).toBe(-1)
  })

  it('global ranks 0 when nothing else is mounted', () => {
    expect(scopeRank('global', stack())).toBe(0)
  })

  it('the most recently mounted scope ranks higher than an older one', () => {
    const s = stack({ scope: 'editor' }, { scope: 'scene' })
    expect(scopeRank('scene', s)).toBeGreaterThan(scopeRank('editor', s))
    expect(scopeRank('editor', s)).toBeGreaterThan(scopeRank('global', s))
  })

  it('a modal entry above a scope makes that scope non-live', () => {
    const s = stack({ scope: 'editor' }, { scope: 'dialog', modal: true })
    expect(scopeRank('editor', s)).toBe(-1)
    expect(scopeRank('global', s)).toBe(-1)
    // The modal itself stays live.
    expect(scopeRank('dialog', s)).toBe(2)
  })

  it('a scope above the modal is unaffected by it', () => {
    const s = stack({ scope: 'dialog', modal: true }, { scope: 'scene' })
    expect(scopeRank('scene', s)).toBe(2)
    expect(scopeRank('global', s)).toBe(-1)
  })

  it('useCommandScope pushes its scope while mounted and removes it on unmount', () => {
    const { unmount } = renderHook(() => useCommandScope('editor'))
    expect(useScopeStack.getState().stack.map((e) => e.scope)).toContain('editor')
    expect(scopeRank('editor')).toBeGreaterThan(0)

    unmount()
    expect(useScopeStack.getState().stack.map((e) => e.scope)).not.toContain('editor')
    expect(scopeRank('editor')).toBe(-1)
  })

  it('useCommandScope with enabled false does not push the scope', () => {
    renderHook(() => useCommandScope('scene', { enabled: false }))
    expect(scopeRank('scene')).toBe(-1)
  })

  it('a modal useCommandScope blocks the global scope while it is mounted', () => {
    renderHook(() => useCommandScope('dialog', { modal: true }))
    expect(scopeRank('global')).toBe(-1)
    expect(scopeRank('dialog')).toBeGreaterThan(0)
  })
})
