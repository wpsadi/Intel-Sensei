// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCommandSystem, setRecording } from './create-command-system'
import { useCommandScope } from './scopes'
import type { CommandDef, CommandDefs, DefaultBindings } from './types'

type Id = 'save' | 'open' | 'pen' | 'nested' | 'native'
let n = 0

function build(defs: Partial<Record<Id, Partial<CommandDef>>>, defaults: DefaultBindings<Id>) {
  const commands = {
    save: { label: 'Save', scope: 'editor', run: vi.fn(), ...defs.save },
    open: { label: 'Open', scope: 'editor', run: vi.fn(), ...defs.open },
    pen: { label: 'Pen', scope: 'editor', run: vi.fn(), ...defs.pen },
    nested: { label: 'Nested', scope: 'global', run: vi.fn(), ...defs.nested },
    native: { label: 'Native', scope: 'editor', keyboard: false, run: vi.fn(), ...defs.native },
  } as CommandDefs<Id>
  const system = createCommandSystem<Id>({ storageKey: `test-dispatch-${n++}`, commands, defaults })
  return { system, commands }
}

const press = (init: KeyboardEventInit, target: EventTarget = document) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

// jsdom has no platform, so Mod resolves to Control here.
const MOD = { ctrlKey: true }

describe('dispatch', () => {
  // The canvas mounts the editor scope in the app. Commands in that scope only fire while it is on the stack.
  let editor: ReturnType<typeof renderHook>
  beforeEach(() => {
    localStorage.clear()
    editor = renderHook(() => useCommandScope('editor'))
  })
  afterEach(() => {
    editor.unmount()
    setRecording(false)
  })

  it('runs the command for its binding and prevents the default action', () => {
    const { system, commands } = build({}, { save: ['Mod+S'] })
    renderHook(() => system.useDispatcher())
    const ev = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true, cancelable: true, ...MOD })
    document.dispatchEvent(ev)
    expect(commands.save.run).toHaveBeenCalledTimes(1)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('skips commands inside inputs unless allowInInputs is set', () => {
    const { system, commands } = build({ open: { allowInInputs: true } }, { save: ['Mod+S'], open: ['Mod+O'] })
    renderHook(() => system.useDispatcher())
    const input = document.createElement('input')
    document.body.appendChild(input)
    press({ key: 's', code: 'KeyS', ...MOD }, input)
    press({ key: 'o', code: 'KeyO', ...MOD }, input)
    expect(commands.save.run).not.toHaveBeenCalled()
    expect(commands.open.run).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('falls through to a lower-ranked command when enabled() is false', () => {
    const { system, commands } = build({ save: { enabled: () => false } }, { save: ['Mod+S'], nested: ['Mod+S'] })
    renderHook(() => system.useDispatcher())
    press({ key: 's', code: 'KeyS', ...MOD })
    expect(commands.save.run).not.toHaveBeenCalled()
    expect(commands.nested.run).toHaveBeenCalledTimes(1)
  })

  it('lets the higher-ranked scope win for a shared key, and a modal scope block lower ones', () => {
    const { system, commands } = build({}, { save: ['Mod+S'], nested: ['Mod+S'] })
    renderHook(() => system.useDispatcher())
    press({ key: 's', code: 'KeyS', ...MOD })
    expect(commands.save.run).toHaveBeenCalledTimes(1)
    expect(commands.nested.run).not.toHaveBeenCalled()
    const modal = renderHook(() => useCommandScope('global', { modal: true }))
    press({ key: 's', code: 'KeyS', ...MOD })
    expect(commands.save.run).toHaveBeenCalledTimes(1)
    modal.unmount()
  })

  it('ignores held repeats unless allowRepeat is set', () => {
    const { system, commands } = build({}, { save: ['Mod+S'] })
    renderHook(() => system.useDispatcher())
    press({ key: 's', code: 'KeyS', repeat: true, ...MOD })
    expect(commands.save.run).not.toHaveBeenCalled()
  })

  it('never runs keyboard:false commands from the dispatcher', () => {
    const { system, commands } = build({}, { native: ['Mod+V'] })
    renderHook(() => system.useDispatcher())
    press({ key: 'v', code: 'KeyV', ...MOD })
    expect(commands.native.run).not.toHaveBeenCalled()
  })

  it('pauses dispatch while a recorder is recording', () => {
    const { system, commands } = build({}, { save: ['Mod+S'] })
    renderHook(() => system.useDispatcher())
    setRecording(true)
    press({ key: 's', code: 'KeyS', ...MOD })
    expect(commands.save.run).not.toHaveBeenCalled()
    setRecording(false)
    press({ key: 's', code: 'KeyS', ...MOD })
    expect(commands.save.run).toHaveBeenCalledTimes(1)
  })

  it('uses a rebound key after setBindings and drops the old one', () => {
    const { system, commands } = build({}, { save: ['Mod+S'] })
    const { rerender } = renderHook(() => system.useDispatcher())
    act(() => system.setBindings('save', ['Mod+Shift+K']))
    rerender()
    press({ key: 's', code: 'KeyS', ...MOD })
    expect(commands.save.run).not.toHaveBeenCalled()
    press({ key: 'k', code: 'KeyK', ...MOD, shiftKey: true })
    expect(commands.save.run).toHaveBeenCalledTimes(1)
  })
})
