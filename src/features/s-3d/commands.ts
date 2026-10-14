import { importFiles } from './io'
import { useS3D } from './store'
import type { Tool } from './types'

const s = () => useS3D.getState()
const hasSel = () => s().selection.length > 0
const selNodes = () =>
  s()
    .selection.map((id) => s().doc.nodes[id])
    .filter(Boolean)

export interface Command {
  id: string
  label: string
  /** Display form, e.g. "⌘D". */
  shortcut?: string
  /** Matcher form: mod+shift+alt+key (lowercase key). */
  keys?: string[]
  run: () => void
  enabled?: () => boolean
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const M = isMac ? '⌘' : 'Ctrl+'
const SH = isMac ? '⇧' : 'Shift+'
const ALT = isMac ? '⌥' : 'Alt+'

const tool = (t: Tool) => () => s().set({ tool: t, selection: t === 'select' ? s().selection : [] })
/** Pixel tools keep the selection: they act on the image under the pointer or the selected one. */
const raster = (t: Tool) => () => s().set({ tool: t })

export const COMMANDS: Command[] = [
  { id: 'undo', label: 'Undo', shortcut: `${M}Z`, keys: ['mod+z'], run: () => s().undo(), enabled: () => s().past.length > 0 },
  {
    id: 'redo',
    label: 'Redo',
    shortcut: `${SH}${M}Z`,
    keys: ['mod+shift+z', 'mod+y'],
    run: () => s().redo(),
    enabled: () => s().future.length > 0,
  },
  { id: 'copy', label: 'Copy', shortcut: `${M}C`, keys: ['mod+c'], run: () => s().copy(), enabled: hasSel },
  { id: 'cut', label: 'Cut', shortcut: `${M}X`, keys: ['mod+x'], run: () => s().cut(), enabled: hasSel },
  { id: 'paste', label: 'Paste', shortcut: `${M}V`, keys: ['mod+v'], run: () => s().paste(), enabled: () => !!s().clipboard },
  { id: 'duplicate', label: 'Duplicate', shortcut: `${M}D`, keys: ['mod+d'], run: () => s().duplicate(), enabled: hasSel },
  {
    id: 'delete',
    label: 'Delete',
    shortcut: '⌫',
    keys: ['delete', 'backspace'],
    run: () => s().deleteNodes(s().selection),
    enabled: hasSel,
  },
  { id: 'select-all', label: 'Select all', shortcut: `${M}A`, keys: ['mod+a'], run: () => s().selectAll() },
  { id: 'group', label: 'Group selection', shortcut: `${M}G`, keys: ['mod+g'], run: () => s().group(), enabled: hasSel },
  {
    id: 'frame-selection',
    label: 'Frame selection',
    shortcut: `${ALT}${M}G`,
    keys: ['mod+alt+g'],
    run: () => s().group(undefined, 'frame'),
    enabled: hasSel,
  },
  { id: 'ungroup', label: 'Ungroup', shortcut: `${SH}${M}G`, keys: ['mod+shift+g'], run: () => s().ungroup(), enabled: hasSel },
  {
    id: 'mask',
    label: 'Use as mask',
    shortcut: `${ALT}${M}M`,
    keys: ['mod+alt+m'],
    run: () => {
      s().group()
      s().updateNodes(s().selection, { mask: true, name: 'Mask group' })
    },
    enabled: () => s().selection.length > 1,
  },
  {
    id: 'union',
    label: 'Union selection',
    keys: ['mod+alt+u'],
    run: () => s().group(undefined, 'boolean', 'union'),
    enabled: () => s().selection.length > 1,
  },
  {
    id: 'subtract',
    label: 'Subtract selection',
    keys: ['mod+alt+s'],
    run: () => s().group(undefined, 'boolean', 'subtract'),
    enabled: () => s().selection.length > 1,
  },
  {
    id: 'intersect',
    label: 'Intersect selection',
    keys: ['mod+alt+i'],
    run: () => s().group(undefined, 'boolean', 'intersect'),
    enabled: () => s().selection.length > 1,
  },
  {
    id: 'exclude',
    label: 'Exclude selection',
    keys: ['mod+alt+e'],
    run: () => s().group(undefined, 'boolean', 'exclude'),
    enabled: () => s().selection.length > 1,
  },
  { id: 'bring-front', label: 'Bring to front', shortcut: `${M}]`, keys: ['mod+]'], run: () => s().arrange('front'), enabled: hasSel },
  { id: 'bring-forward', label: 'Bring forward', shortcut: ']', keys: [']'], run: () => s().arrange('forward'), enabled: hasSel },
  { id: 'send-backward', label: 'Send backward', shortcut: '[', keys: ['['], run: () => s().arrange('backward'), enabled: hasSel },
  { id: 'send-back', label: 'Send to back', shortcut: `${M}[`, keys: ['mod+['], run: () => s().arrange('back'), enabled: hasSel },
  { id: 'flip-h', label: 'Flip horizontal', shortcut: `${SH}H`, keys: ['shift+h'], run: () => s().flip('h'), enabled: hasSel },
  { id: 'flip-v', label: 'Flip vertical', shortcut: `${SH}V`, keys: ['shift+v'], run: () => s().flip('v'), enabled: hasSel },
  {
    id: 'toggle-visible',
    label: 'Show/Hide',
    shortcut: `${SH}${M}H`,
    keys: ['mod+shift+h'],
    run: () => {
      const all = selNodes().every((n) => n.visible)
      s().updateNodes(s().selection, { visible: !all })
    },
    enabled: hasSel,
  },
  {
    id: 'toggle-lock',
    label: 'Lock/Unlock',
    shortcut: `${SH}${M}L`,
    keys: ['mod+shift+l'],
    run: () => {
      const all = selNodes().every((n) => n.locked)
      s().updateNodes(s().selection, { locked: !all })
    },
    enabled: hasSel,
  },
  {
    id: 'toggle-clip',
    label: 'Clip content',
    run: () => {
      const all = selNodes().every((n) => n.clip)
      s().updateNodes(s().selection, { clip: !all })
    },
    enabled: () => selNodes().some((n) => n.type === 'frame' || n.type === 'section'),
  },
  { id: 'add-auto-layout', label: 'Add auto layout', shortcut: `${SH}A`, keys: ['shift+a'], run: () => addAutoLayout(), enabled: hasSel },
  { id: 'zoom-fit', label: 'Zoom to fit', shortcut: `${SH}1`, keys: ['shift+1', 'shift+!'], run: () => s().zoomToFit() },
  {
    id: 'zoom-selection',
    label: 'Zoom to selection',
    shortcut: `${SH}2`,
    keys: ['shift+2', 'shift+@'],
    run: () => s().zoomToFit(s().selection),
    enabled: hasSel,
  },
  { id: 'zoom-100', label: 'Zoom to 100%', shortcut: `${SH}0`, keys: ['shift+0', 'shift+)'], run: () => s().zoomTo(1) },
  { id: 'zoom-in', label: 'Zoom in', shortcut: `${M}+`, keys: ['mod+=', 'mod++', '=', '+'], run: () => s().zoomTo(s().camera.zoom * 1.25) },
  { id: 'zoom-out', label: 'Zoom out', shortcut: `${M}-`, keys: ['mod+-', '-'], run: () => s().zoomTo(s().camera.zoom / 1.25) },
  { id: 'toggle-rulers', label: 'Rulers', shortcut: `${SH}R`, keys: ['shift+r'], run: () => s().set({ showRulers: !s().showRulers }) },
  { id: 'toggle-grid', label: 'Pixel grid', shortcut: `${M}'`, keys: ["mod+'"], run: () => s().set({ showGrid: !s().showGrid }) },
  {
    id: 'toggle-snap',
    label: 'Snap to grid',
    shortcut: `${SH}${M}'`,
    keys: ["mod+shift+'", 'mod+shift+"'],
    run: () => s().set({ snapToGrid: !s().snapToGrid }),
  },
  { id: 'save', label: 'Save version', shortcut: `${M}S`, keys: ['mod+s'], run: () => void s().saveNow('Manual save') },
  { id: 'import', label: 'Import…', shortcut: `${SH}${M}K`, keys: ['mod+shift+k'], run: () => void importFiles() },
  {
    id: 'play',
    label: 'Preview / Play',
    shortcut: `${ALT}${M}↵`,
    keys: ['mod+alt+enter'],
    run: () => s().set({ mode: s().mode === 'play' ? 'edit' : 'play' }),
  },
  { id: 'tool-select', label: 'Move', shortcut: 'V', keys: ['v'], run: tool('select') },
  { id: 'tool-hand', label: 'Hand', shortcut: 'H', keys: ['h'], run: tool('hand') },
  { id: 'tool-frame', label: 'Frame', shortcut: 'F', keys: ['f', 'a'], run: tool('frame') },
  { id: 'tool-section', label: 'Section', shortcut: `${SH}S`, keys: ['shift+s'], run: tool('section') },
  { id: 'tool-rect', label: 'Rectangle', shortcut: 'R', keys: ['r'], run: tool('rect') },
  { id: 'tool-ellipse', label: 'Ellipse', shortcut: 'O', keys: ['o'], run: tool('ellipse') },
  { id: 'tool-polygon', label: 'Polygon', shortcut: 'Y', keys: ['y'], run: tool('polygon') },
  { id: 'tool-star', label: 'Star', shortcut: `${SH}X`, keys: ['shift+x'], run: tool('star') },
  { id: 'tool-pen', label: 'Pen', shortcut: 'P', keys: ['p'], run: tool('pen') },
  { id: 'tool-text', label: 'Text', shortcut: 'T', keys: ['t'], run: tool('text') },
  { id: 'tool-comment', label: 'Comment', shortcut: 'C', keys: ['c'], run: tool('comment') },
  { id: 'tool-3d', label: '3D shape', shortcut: 'K', keys: ['k'], run: tool('shape3d') },
  { id: 'tool-brush', label: 'Brush', shortcut: 'B', keys: ['b'], run: raster('brush') },
  { id: 'tool-eraser', label: 'Eraser', shortcut: 'E', keys: ['e'], run: raster('eraser') },
  { id: 'tool-clone', label: 'Clone stamp', shortcut: 'S', keys: ['s'], run: raster('clone') },
  { id: 'tool-heal', label: 'Spot healing', shortcut: 'J', keys: ['j'], run: raster('heal') },
  { id: 'tool-marquee', label: 'Marquee', shortcut: 'M', keys: ['m'], run: () => s().set({ tool: 'marquee', marqueeShape: 'rect' }) },
  { id: 'tool-marquee-ellipse', label: 'Elliptical marquee', run: () => s().set({ tool: 'marquee', marqueeShape: 'ellipse' }) },
  { id: 'tool-lasso', label: 'Lasso', shortcut: 'L', keys: ['l'], run: raster('lasso') },
  { id: 'tool-wand', label: 'Magic wand', shortcut: 'W', keys: ['w'], run: raster('wand') },
  { id: 'tool-quick', label: 'Quick selection', shortcut: 'Q', keys: ['q'], run: raster('quick') },
  { id: 'tool-crop', label: 'Crop', shortcut: `${SH}C`, keys: ['shift+c'], run: raster('crop') },
  { id: 'tool-eyedropper', label: 'Eyedropper', shortcut: 'I', keys: ['i'], run: raster('eyedropper') },
  { id: 'tool-zoom', label: 'Zoom', shortcut: 'Z', keys: ['z'], run: raster('zoom') },
  {
    id: 'swap-colors',
    label: 'Swap colours',
    shortcut: 'X',
    keys: ['x'],
    run: () => s().set({ foregroundColor: s().backgroundColor, backgroundColor: s().foregroundColor }),
  },
]

export const cmd = (id: string) => COMMANDS.find((c) => c.id === id)!
export const runCmd = (id: string) => {
  const c = cmd(id)
  if (!c.enabled || c.enabled()) c.run()
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

/** Normalises a keyboard event to the matcher form used in `keys`. */
export function eventKey(e: KeyboardEvent) {
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('mod')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  const key = e.code.startsWith('Digit') && e.shiftKey ? e.code.slice(5) : e.key.toLowerCase()
  parts.push(key === ' ' ? 'space' : key)
  return parts.join('+')
}
