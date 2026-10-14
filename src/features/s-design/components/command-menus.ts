/** An entry is a command id, '-' for a separator, or a submenu. */
export type MenuEntry = string | '-' | { label: string; items: MenuEntry[] }

export const NODE_MENU: MenuEntry[] = [
  'copy',
  'cut',
  'paste',
  'duplicate',
  'delete',
  '-',
  'group',
  'frame-selection',
  'ungroup',
  'add-auto-layout',
  '-',
  { label: 'Arrange', items: ['bring-front', 'bring-forward', 'send-backward', 'send-back'] },
  { label: 'Boolean', items: ['union', 'subtract', 'intersect', 'exclude', '-', 'mask'] },
  { label: 'Flip', items: ['flip-h', 'flip-v'] },
  '-',
  'toggle-visible',
  'toggle-lock',
  'toggle-clip',
  '-',
  'zoom-selection',
]
export const CANVAS_MENU: MenuEntry[] = [
  'paste',
  'select-all',
  '-',
  'import',
  '-',
  'zoom-fit',
  'zoom-100',
  '-',
  'toggle-rulers',
  'toggle-grid',
  'toggle-snap',
]
