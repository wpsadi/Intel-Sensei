import type { Hotkey, HotkeySequence } from '@tanstack/react-hotkeys'

/** One way to trigger a command: a single chord ('Mod+Z') or a sequence of chords (['Mod+K', 'Mod+S']). */
export type Binding = Hotkey | HotkeySequence

/**
 * Where a command is live. The stack of mounted scopes decides which one wins when two commands share a key:
 * the most recently mounted scope is on top. 'global' is always on the stack, at the bottom.
 * 'dialog' is pushed as modal, which blocks every scope below it.
 */
export type CommandScope = 'global' | 'editor' | 'scene' | 'dialog'

/** What a command does. It holds no keys: bindings live in the defaults map and in user overrides. */
export interface CommandDef {
  label: string
  /** Menu or sheet section, e.g. 'Edit' or 'View'. */
  group?: string
  scope: CommandScope
  /** The keyboard event is passed when a key runs the command. Menus and buttons call it with nothing. */
  run: (event?: KeyboardEvent) => void
  /** Return false to skip the command: the key then falls through to a lower-ranked command, or to the browser. */
  enabled?: () => boolean
  /** Let the command fire while an input, textarea, select or contentEditable has focus. Default: false. */
  allowInInputs?: boolean
  /** Let holding the key repeat the command. Default: false. */
  allowRepeat?: boolean
  /**
   * Set to false when a native event owns the key (e.g. copy and paste use clipboard events).
   * The command then stays in menus and labels, but the dispatcher never claims its keys.
   */
  keyboard?: boolean
}

export type CommandDefs<Id extends string> = Record<Id, CommandDef>
export type DefaultBindings<Id extends string> = Partial<Record<Id, Binding[]>>
