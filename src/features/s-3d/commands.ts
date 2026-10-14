import { detectPlatform } from '@tanstack/react-hotkeys'

import { type CommandDefs, type DefaultBindings, createCommandSystem } from '@/lib/commands'

import { useS3DDialog } from './dialogs/dialog-store'
import { importFiles } from './io'
import { useS3D } from './store'
import type { Tool } from './types'

const s = () => useS3D.getState()
const hasSel = () => s().selection.length > 0
const selNodes = () =>
  s()
    .selection.map((id) => s().doc.nodes[id])
    .filter(Boolean)

export const isMac = detectPlatform() === 'mac'

const tool = (t: Tool) => () => s().set({ tool: t, selection: t === 'select' ? s().selection : [] })
/** Pixel tools keep the selection: they act on the image under the pointer or the selected one. */
const raster = (t: Tool) => () => s().set({ tool: t })
/** Copy, cut and paste keep their keys on the native clipboard events, so the dispatcher does not claim them. */
/** Scene-editor commands. Their implementation is supplied by the mounted SceneEditor through useCommandHandler. */
const sceneOnly = () => {}

/**
 * What each command does. Commands hold no keys: see DEFAULT_BINDINGS, and user overrides on top of it.
 * Scope: 'editor' for the canvas, 'scene' for the 3D scene editor, 'global' for app-wide help.
 */
export const COMMAND_DEFS = {
  undo: { label: 'Undo', group: 'Edit', scope: 'editor', run: () => s().undo(), enabled: () => s().past.length > 0 },
  redo: { label: 'Redo', group: 'Edit', scope: 'editor', run: () => s().redo(), enabled: () => s().future.length > 0 },
  copy: { label: 'Copy', group: 'Edit', scope: 'editor', keyboard: false, run: () => s().copy(), enabled: hasSel },
  cut: { label: 'Cut', group: 'Edit', scope: 'editor', keyboard: false, run: () => s().cut(), enabled: hasSel },
  paste: { label: 'Paste', group: 'Edit', scope: 'editor', keyboard: false, run: () => s().paste(), enabled: () => !!s().clipboard },
  duplicate: { label: 'Duplicate', group: 'Edit', scope: 'editor', run: () => s().duplicate(), enabled: hasSel },
  delete: { label: 'Delete', group: 'Edit', scope: 'editor', run: () => s().deleteNodes(s().selection), enabled: hasSel },
  'select-all': { label: 'Select all', group: 'Edit', scope: 'editor', run: () => s().selectAll() },
  group: { label: 'Group selection', group: 'Object', scope: 'editor', run: () => s().group(), enabled: hasSel },
  'frame-selection': {
    label: 'Frame selection',
    group: 'Object',
    scope: 'editor',
    run: () => s().group(undefined, 'frame'),
    enabled: hasSel,
  },
  ungroup: { label: 'Ungroup', group: 'Object', scope: 'editor', run: () => s().ungroup(), enabled: hasSel },
  mask: {
    label: 'Use as mask',
    group: 'Object',
    scope: 'editor',
    run: () => {
      s().group()
      s().updateNodes(s().selection, { mask: true, name: 'Mask group' })
    },
    enabled: () => s().selection.length > 1,
  },
  union: {
    label: 'Union selection',
    group: 'Object',
    scope: 'editor',
    run: () => s().group(undefined, 'boolean', 'union'),
    enabled: () => s().selection.length > 1,
  },
  subtract: {
    label: 'Subtract selection',
    group: 'Object',
    scope: 'editor',
    run: () => s().group(undefined, 'boolean', 'subtract'),
    enabled: () => s().selection.length > 1,
  },
  intersect: {
    label: 'Intersect selection',
    group: 'Object',
    scope: 'editor',
    run: () => s().group(undefined, 'boolean', 'intersect'),
    enabled: () => s().selection.length > 1,
  },
  exclude: {
    label: 'Exclude selection',
    group: 'Object',
    scope: 'editor',
    run: () => s().group(undefined, 'boolean', 'exclude'),
    enabled: () => s().selection.length > 1,
  },
  'bring-front': { label: 'Bring to front', group: 'Arrange', scope: 'editor', run: () => s().arrange('front'), enabled: hasSel },
  'bring-forward': { label: 'Bring forward', group: 'Arrange', scope: 'editor', run: () => s().arrange('forward'), enabled: hasSel },
  'send-backward': { label: 'Send backward', group: 'Arrange', scope: 'editor', run: () => s().arrange('backward'), enabled: hasSel },
  'send-back': { label: 'Send to back', group: 'Arrange', scope: 'editor', run: () => s().arrange('back'), enabled: hasSel },
  'flip-h': { label: 'Flip horizontal', group: 'Arrange', scope: 'editor', run: () => s().flip('h'), enabled: hasSel },
  'flip-v': { label: 'Flip vertical', group: 'Arrange', scope: 'editor', run: () => s().flip('v'), enabled: hasSel },
  'toggle-visible': {
    label: 'Show/Hide',
    group: 'Object',
    scope: 'editor',
    run: () => {
      const all = selNodes().every((n) => n.visible)
      s().updateNodes(s().selection, { visible: !all })
    },
    enabled: hasSel,
  },
  'toggle-lock': {
    label: 'Lock/Unlock',
    group: 'Object',
    scope: 'editor',
    run: () => {
      const all = selNodes().every((n) => n.locked)
      s().updateNodes(s().selection, { locked: !all })
    },
    enabled: hasSel,
  },
  'toggle-clip': {
    label: 'Clip content',
    group: 'Object',
    scope: 'editor',
    run: () => {
      const all = selNodes().every((n) => n.clip)
      s().updateNodes(s().selection, { clip: !all })
    },
    enabled: () => selNodes().some((n) => n.type === 'frame' || n.type === 'section'),
  },
  'add-auto-layout': { label: 'Add auto layout', group: 'Object', scope: 'editor', run: () => addAutoLayout(), enabled: hasSel },
  'zoom-fit': { label: 'Zoom to fit', group: 'View', scope: 'editor', run: () => s().zoomToFit() },
  'zoom-selection': {
    label: 'Zoom to selection',
    group: 'View',
    scope: 'editor',
    run: () => s().zoomToFit(s().selection),
    enabled: hasSel,
  },
  'zoom-100': { label: 'Zoom to 100%', group: 'View', scope: 'editor', run: () => s().zoomTo(1) },
  'zoom-in': { label: 'Zoom in', group: 'View', scope: 'editor', run: () => s().zoomTo(s().camera.zoom * 1.25) },
  'zoom-out': { label: 'Zoom out', group: 'View', scope: 'editor', run: () => s().zoomTo(s().camera.zoom / 1.25) },
  'toggle-rulers': { label: 'Rulers', group: 'View', scope: 'editor', run: () => s().set({ showRulers: !s().showRulers }) },
  'toggle-grid': { label: 'Pixel grid', group: 'View', scope: 'editor', run: () => s().set({ showGrid: !s().showGrid }) },
  'toggle-snap': {
    label: 'Snap to grid',
    group: 'View',
    scope: 'editor',
    run: () => s().set({ snapToGrid: !s().snapToGrid }),
  },
  save: { label: 'Save version', group: 'File', scope: 'editor', run: () => void s().saveNow('Manual save') },
  import: { label: 'Import…', group: 'File', scope: 'editor', run: () => void importFiles() },
  export: { label: 'Export…', group: 'File', scope: 'editor', run: () => useS3DDialog.getState().setOpen('export') },
  open: { label: 'Open…', group: 'File', scope: 'editor', run: () => useS3DDialog.getState().setOpen('open') },
  play: {
    label: 'Preview / Play',
    group: 'View',
    scope: 'editor',
    run: () => s().set({ mode: s().mode === 'play' ? 'edit' : 'play' }),
  },
  'shortcuts-help': {
    label: 'Keyboard shortcuts',
    group: 'Help',
    scope: 'global',
    run: () => useS3DDialog.getState().setOpen('shortcuts'),
  },
  'tool-select': { label: 'Move', group: 'Tools', scope: 'editor', run: tool('select') },
  'tool-hand': { label: 'Hand', group: 'Tools', scope: 'editor', run: tool('hand') },
  'tool-frame': { label: 'Frame', group: 'Tools', scope: 'editor', run: tool('frame') },
  'tool-section': { label: 'Section', group: 'Tools', scope: 'editor', run: tool('section') },
  'tool-rect': { label: 'Rectangle', group: 'Tools', scope: 'editor', run: tool('rect') },
  'tool-ellipse': { label: 'Ellipse', group: 'Tools', scope: 'editor', run: tool('ellipse') },
  'tool-polygon': { label: 'Polygon', group: 'Tools', scope: 'editor', run: tool('polygon') },
  'tool-star': { label: 'Star', group: 'Tools', scope: 'editor', run: tool('star') },
  'tool-pen': { label: 'Pen', group: 'Tools', scope: 'editor', run: tool('pen') },
  'tool-text': { label: 'Text', group: 'Tools', scope: 'editor', run: tool('text') },
  'tool-comment': { label: 'Comment', group: 'Tools', scope: 'editor', run: tool('comment') },
  'tool-3d': { label: '3D shape', group: 'Tools', scope: 'editor', run: tool('shape3d') },
  'tool-brush': { label: 'Brush', group: 'Tools', scope: 'editor', run: raster('brush') },
  'tool-eraser': { label: 'Eraser', group: 'Tools', scope: 'editor', run: raster('eraser') },
  'tool-clone': { label: 'Clone stamp', group: 'Tools', scope: 'editor', run: raster('clone') },
  'tool-heal': { label: 'Spot healing', group: 'Tools', scope: 'editor', run: raster('heal') },
  'tool-marquee': { label: 'Marquee', group: 'Tools', scope: 'editor', run: () => s().set({ tool: 'marquee', marqueeShape: 'rect' }) },
  'tool-marquee-ellipse': {
    label: 'Elliptical marquee',
    group: 'Tools',
    scope: 'editor',
    run: () => s().set({ tool: 'marquee', marqueeShape: 'ellipse' }),
  },
  'tool-lasso': { label: 'Lasso', group: 'Tools', scope: 'editor', run: raster('lasso') },
  'tool-wand': { label: 'Magic wand', group: 'Tools', scope: 'editor', run: raster('wand') },
  'tool-quick': { label: 'Quick selection', group: 'Tools', scope: 'editor', run: raster('quick') },
  'tool-crop': { label: 'Crop', group: 'Tools', scope: 'editor', run: raster('crop') },
  'tool-eyedropper': { label: 'Eyedropper', group: 'Tools', scope: 'editor', run: raster('eyedropper') },
  'tool-zoom': { label: 'Zoom', group: 'Tools', scope: 'editor', run: raster('zoom') },
  'swap-colors': {
    label: 'Swap colours',
    group: 'Tools',
    scope: 'editor',
    run: () => s().set({ foregroundColor: s().backgroundColor, backgroundColor: s().foregroundColor }),
  },
  // Canvas keys that used to be read straight off the window. The canvas supplies the pen-aware versions of these.
  escape: { label: 'Cancel / deselect', group: 'Selection', scope: 'editor', run: sceneOnly },
  enter: { label: 'Edit text / select children', group: 'Selection', scope: 'editor', run: sceneOnly },
  'select-next': { label: 'Select next sibling', group: 'Selection', scope: 'editor', run: sceneOnly },
  'select-previous': { label: 'Select previous sibling', group: 'Selection', scope: 'editor', run: sceneOnly },
  'nudge-left': { label: 'Nudge left', group: 'Arrange', scope: 'editor', run: (e) => nudge(-1, 0, e), enabled: hasSel },
  'nudge-right': { label: 'Nudge right', group: 'Arrange', scope: 'editor', run: (e) => nudge(1, 0, e), enabled: hasSel },
  'nudge-up': { label: 'Nudge up', group: 'Arrange', scope: 'editor', run: (e) => nudge(0, -1, e), enabled: hasSel },
  'nudge-down': { label: 'Nudge down', group: 'Arrange', scope: 'editor', run: (e) => nudge(0, 1, e), enabled: hasSel },
  // Scene editor. The mounted SceneEditor supplies the real implementation.
  'scene-translate': { label: 'Move gizmo', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-rotate': { label: 'Rotate gizmo', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-scale': { label: 'Scale gizmo', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-frame': { label: 'Frame object', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-delete': { label: 'Delete object', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-duplicate': { label: 'Duplicate object', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-undo': { label: 'Undo', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-redo': { label: 'Redo', group: 'Scene', scope: 'scene', run: sceneOnly },
  'scene-deselect': { label: 'Deselect, then close', group: 'Scene', scope: 'scene', run: sceneOnly },
} satisfies CommandDefs<string>

export type CommandId = keyof typeof COMMAND_DEFS

/**
 * Default bindings, kept apart from the commands above. Each entry lists every way to trigger the command.
 * The first entry is the one shown first in menus.
 */
export const DEFAULT_BINDINGS = {
  undo: ['Mod+Z'],
  redo: ['Mod+Shift+Z', 'Mod+Y'],
  copy: ['Mod+C'],
  cut: ['Mod+X'],
  paste: ['Mod+V'],
  duplicate: ['Mod+D'],
  delete: ['Delete', 'Backspace'],
  'select-all': ['Mod+A'],
  group: ['Mod+G'],
  'frame-selection': ['Mod+Alt+G'],
  ungroup: ['Mod+Shift+G'],
  mask: ['Mod+Alt+M'],
  union: ['Mod+Alt+U'],
  subtract: ['Mod+Alt+S'],
  intersect: ['Mod+Alt+I'],
  exclude: ['Mod+Alt+E'],
  'bring-front': ['Mod+]'],
  'bring-forward': [']'],
  'send-backward': ['['],
  'send-back': ['Mod+['],
  'flip-h': ['Shift+H'],
  'flip-v': ['Shift+V'],
  'toggle-visible': ['Mod+Shift+H'],
  'toggle-lock': ['Mod+Shift+L'],
  'add-auto-layout': ['Shift+A'],
  'zoom-fit': ['Shift+1', 'Shift+!'],
  'zoom-selection': ['Shift+2', 'Shift+@'],
  'zoom-100': ['Shift+0', 'Shift+)'],
  'zoom-in': ['Mod+=', 'Mod++', '=', '+'],
  'zoom-out': ['Mod+-', '-'],
  'toggle-rulers': ['Shift+R'],
  'toggle-grid': ["Mod+'"],
  'toggle-snap': ["Mod+Shift+'", 'Mod+Shift+"'],
  save: ['Mod+S'],
  import: ['Mod+Shift+K'],
  export: ['Mod+E'],
  open: ['Mod+O'],
  play: ['Mod+Alt+Enter'],
  'shortcuts-help': ['Mod+/', 'Shift+?'],
  'tool-select': ['V'],
  'tool-hand': ['H'],
  'tool-frame': ['F', 'A'],
  'tool-section': ['Shift+S'],
  'tool-rect': ['R'],
  'tool-ellipse': ['O'],
  'tool-polygon': ['Y'],
  'tool-star': ['Shift+X'],
  'tool-pen': ['P'],
  'tool-text': ['T'],
  'tool-comment': ['C'],
  'tool-3d': ['K'],
  'tool-brush': ['B'],
  'tool-eraser': ['E'],
  'tool-clone': ['S'],
  'tool-heal': ['J'],
  'tool-marquee': ['M'],
  'tool-lasso': ['L'],
  'tool-wand': ['W'],
  'tool-quick': ['Q'],
  'tool-crop': ['Shift+C'],
  'tool-eyedropper': ['I'],
  'tool-zoom': ['Z'],
  'swap-colors': ['X'],
  escape: ['Escape'],
  enter: ['Enter'],
  'select-next': ['Tab'],
  'select-previous': ['Shift+Tab'],
  'nudge-left': ['ArrowLeft', 'Shift+ArrowLeft'],
  'nudge-right': ['ArrowRight', 'Shift+ArrowRight'],
  'nudge-up': ['ArrowUp', 'Shift+ArrowUp'],
  'nudge-down': ['ArrowDown', 'Shift+ArrowDown'],
  'scene-translate': ['W', 'G'],
  'scene-rotate': ['E'],
  'scene-scale': ['R', 'S'],
  'scene-frame': ['F'],
  'scene-delete': ['Delete', 'Backspace'],
  'scene-duplicate': ['Mod+D'],
  'scene-undo': ['Mod+Z'],
  'scene-redo': ['Mod+Shift+Z', 'Mod+Y'],
  'scene-deselect': ['Escape'],
} satisfies DefaultBindings<CommandId>

export const commandSystem = createCommandSystem<CommandId>({
  storageKey: 'intel-sensei:shortcuts',
  commands: COMMAND_DEFS,
  defaults: DEFAULT_BINDINGS,
})

export const {
  ids: COMMAND_IDS,
  labelOf,
  run,
  isEnabled,
  bindingsOf,
  useBindings,
  useLabel,
  useDispatcher,
  useCommandHandler,
} = commandSystem

/** Runs a command by id, for menus and buttons. Skips it when its `enabled()` says no. */
export const runCmd = run

function nudge(dx: number, dy: number, e?: KeyboardEvent) {
  const d = e?.shiftKey ? 10 : 1
  s().updateNodes(
    s().selection.filter((id) => !s().doc.nodes[id]?.locked),
    (n) => {
      n.x += dx * d
      n.y += dy * d
    },
  )
}

function addAutoLayout() {
  const { doc, selection } = s()
  const one = selection.length === 1 ? doc.nodes[selection[0]] : null
  if (one && (one.type === 'frame' || one.type === 'section')) {
    s().updateNodes([one.id], {
      autoLayout: one.autoLayout
        ? null
        : { direction: 'horizontal', gap: 10, padding: [10, 10, 10, 10], align: 'start', justify: 'start', wrap: false },
      sizing: { h: 'hug', v: 'hug' },
    })
    return
  }
  s().group(undefined, 'frame')
  const id = s().selection[0]
  s().updateNodes([id], {
    autoLayout: { direction: 'horizontal', gap: 10, padding: [10, 10, 10, 10], align: 'start', justify: 'start', wrap: false },
    sizing: { h: 'hug', v: 'hug' },
    name: 'Auto layout',
  })
}
