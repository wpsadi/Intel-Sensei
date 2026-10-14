export type { Binding, CommandDef, CommandDefs, CommandScope, DefaultBindings } from './types'
export { createCommandSystem, bindingKey, formatBinding, isEditableTarget, setRecording } from './create-command-system'
export type { CommandSystem } from './create-command-system'
export { useCommandScope, scopeRank, useScopeStack } from './scopes'
export { useBindingRecorder } from './recorder'
export {
  useHeldKeys,
  useHeldKeyCodes,
  useHotkeyRegistrations,
  useHotkeyHint,
  formatForDisplay,
  formatHotkeySequence,
  detectPlatform,
} from '@tanstack/react-hotkeys'
export type { Hotkey, HotkeySequence, HotkeyRecorderOptions, ReactHotkeyRecorder } from '@tanstack/react-hotkeys'
