import { type Hotkey, detectPlatform, normalizeHotkey, validateHotkey } from '@tanstack/react-hotkeys'
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { type Binding, type DefaultBindings, bindingKey, formatBinding } from '@/lib/commands'

import { COMMAND_DEFS, type CommandId, DEFAULT_BINDINGS, labelOf } from './commands'

const PLATFORMS = ['mac', 'windows'] as const

/** Every chord and sequence step of a binding, flattened. */
const chords = (b: Binding) => (Array.isArray(b) ? b : [b])

/**
 * Keys from the old `COMMANDS` map (git HEAD), in its matcher form. Each one must still trigger the same
 * command, unless it is listed in INTENTIONAL_CHANGES below.
 */
const OLD_KEYS: Record<string, string[]> = {
  undo: ['mod+z'],
  redo: ['mod+shift+z', 'mod+y'],
  copy: ['mod+c'],
  cut: ['mod+x'],
  paste: ['mod+v'],
  duplicate: ['mod+d'],
  delete: ['delete', 'backspace'],
  'select-all': ['mod+a'],
  group: ['mod+g'],
  'frame-selection': ['mod+alt+g'],
  ungroup: ['mod+shift+g'],
  mask: ['mod+alt+m'],
  union: ['mod+alt+u'],
  subtract: ['mod+alt+s'],
  intersect: ['mod+alt+i'],
  exclude: ['mod+alt+e'],
  'bring-front': ['mod+]'],
  'bring-forward': [']'],
  'send-backward': ['['],
  'send-back': ['mod+['],
  'flip-h': ['shift+h'],
  'flip-v': ['shift+v'],
  'toggle-visible': ['mod+shift+h'],
  'toggle-lock': ['mod+shift+l'],
  'add-auto-layout': ['shift+a'],
  'zoom-fit': ['shift+1', 'shift+!'],
  'zoom-selection': ['shift+2', 'shift+@'],
  'zoom-100': ['shift+0', 'shift+)'],
  'zoom-in': ['mod+=', 'mod++', '=', '+'],
  'zoom-out': ['mod+-', '-'],
  'toggle-rulers': ['shift+r'],
  'toggle-grid': ["mod+'"],
  'toggle-snap': ["mod+shift+'", 'mod+shift+"'],
  save: ['mod+s'],
  import: ['mod+shift+k'],
  play: ['mod+alt+enter'],
  'tool-select': ['v'],
  'tool-hand': ['h'],
  'tool-frame': ['f', 'a'],
  'tool-section': ['shift+s'],
  'tool-rect': ['r'],
  'tool-ellipse': ['o'],
  'tool-polygon': ['y'],
  'tool-star': ['shift+x'],
  'tool-pen': ['p'],
  'tool-text': ['t'],
  'tool-comment': ['c'],
  'tool-3d': ['k'],
  'tool-brush': ['b'],
  'tool-eraser': ['e'],
  'tool-clone': ['s'],
  'tool-heal': ['j'],
  'tool-marquee': ['m'],
  'tool-lasso': ['l'],
  'tool-wand': ['w'],
  'tool-quick': ['q'],
  'tool-crop': ['shift+c'],
  'tool-eyedropper': ['i'],
  'tool-zoom': ['z'],
  'swap-colors': ['x'],
}

/** Old matcher form ('mod+shift+z') to library form ('Mod+Shift+z'). Keys are left for normalizeHotkey to case. */
const toLib = (k: string) =>
  k
    .split('+')
    .map((p) => ({ mod: 'Mod', shift: 'Shift', alt: 'Alt' })[p] ?? p)
    .join('+')

/** Commands that had no keys before and have none now. */
const UNBOUND = ['tool-marquee-ellipse', 'toggle-clip']

/** Shared keys that are allowed across scopes. The scene scope shadows the editor while it is mounted. */
const INTENDED_OVERLAPS: Record<string, string[]> = {
  'Mod+Z': ['scene-undo', 'undo'],
  'Mod+Shift+Z': ['redo', 'scene-redo'],
  'Mod+Y': ['redo', 'scene-redo'],
  'Mod+D': ['duplicate', 'scene-duplicate'],
  Delete: ['delete', 'scene-delete'],
  Backspace: ['delete', 'scene-delete'],
  Escape: ['escape', 'scene-deselect'],
  F: ['scene-frame', 'tool-frame'],
  R: ['scene-scale', 'tool-rect'],
  S: ['scene-scale', 'tool-clone'],
  E: ['scene-rotate', 'tool-eraser'],
  W: ['scene-translate', 'tool-wand'],
}

describe('command map', () => {
  it('gives every command a binding, except the exact set that is unbound', () => {
    const unbound = (Object.keys(COMMAND_DEFS) as CommandId[]).filter((id) => !(id in DEFAULT_BINDINGS))
    expect(unbound.sort()).toEqual([...UNBOUND].sort())
  })

  it('has no default bindings for unknown commands', () => {
    expect(Object.keys(DEFAULT_BINDINGS).filter((id) => !(id in COMMAND_DEFS))).toEqual([])
  })

  it('has valid, non-empty bindings for every command', () => {
    for (const [id, bindings] of Object.entries(DEFAULT_BINDINGS)) {
      expect(bindings.length, `${id} has no bindings`).toBeGreaterThan(0)
      for (const b of bindings) {
        expect(Array.isArray(b) && b.length === 0, `${id} has an empty sequence`).toBe(false)
        for (const h of chords(b)) {
          const result = validateHotkey(h)
          expect(result.errors, `${id}: ${JSON.stringify(h)}`).toEqual([])
          expect(result.warnings, `${id}: ${JSON.stringify(h)}`).toEqual([])
          expect(result.valid, `${id}: ${JSON.stringify(h)}`).toBe(true)
        }
      }
    }
  })

  it('has no two commands in one scope sharing a canonical binding', () => {
    for (const platform of PLATFORMS) {
      const seen = new Map<string, CommandId[]>()
      for (const [id, bindings] of Object.entries(DEFAULT_BINDINGS) as [CommandId, Binding[]][]) {
        for (const b of bindings) {
          const key = bindingKey(b, platform)
          seen.set(key, [...(seen.get(key) ?? []), id])
        }
      }
      for (const [key, ids] of seen) {
        const scopes = ids.map((id) => COMMAND_DEFS[id].scope)
        const sameScope = scopes.filter((s, i) => scopes.indexOf(s) !== i)
        expect(sameScope, `${platform} ${key}: ${ids.join(', ')}`).toEqual([])
      }
    }
  })

  it('shares keys across scopes only where intended', () => {
    for (const platform of PLATFORMS) {
      const seen = new Map<string, CommandId[]>()
      for (const [id, bindings] of Object.entries(DEFAULT_BINDINGS) as [CommandId, Binding[]][]) {
        for (const b of bindings) {
          const key = bindingKey(b, platform)
          seen.set(key, [...(seen.get(key) ?? []), id])
        }
      }
      const overlaps = Object.fromEntries([...seen].filter(([, ids]) => ids.length > 1).map(([k, ids]) => [k, [...ids].sort()]))
      // Mac and Windows only differ in Mod, so the same overlap set holds on both.
      const expected = Object.fromEntries(Object.entries(INTENDED_OVERLAPS).map(([k, ids]) => [k, [...ids].sort()]))
      const normalized = Object.fromEntries(Object.keys(expected).map((k) => [bindingKey(k as Hotkey, platform), expected[k]]))
      expect(overlaps, platform).toEqual(normalized)
    }
  })

  it('keeps every old key bound to the same command', () => {
    const defaults: DefaultBindings<CommandId> = DEFAULT_BINDINGS
    for (const [id, keys] of Object.entries(OLD_KEYS)) {
      const bindings = defaults[id as CommandId] ?? []
      for (const platform of PLATFORMS) {
        const newKeys = bindings.flatMap(chords).map((h) => normalizeHotkey(h, platform))
        for (const key of keys) {
          expect(newKeys, `${id} lost ${key} on ${platform}`).toContain(normalizeHotkey(toLib(key), platform))
        }
      }
    }
  })

  it('formats the undo label per platform', () => {
    const [undo] = DEFAULT_BINDINGS.undo
    expect(formatBinding(undo, 'mac')).toBe('⌘ Z')
    expect(formatBinding(undo, 'windows')).toBe('Ctrl+Z')
    // labelOf has no platform argument, so it follows the current platform.
    expect(labelOf('undo')).toBe(formatBinding(undo, detectPlatform()))
  })
})
