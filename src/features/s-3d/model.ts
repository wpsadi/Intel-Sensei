import { uid } from './db'
import type { Doc, Fill, NodeType, Page, SNode, Stroke } from './types'

export const CONTAINER_TYPES: NodeType[] = ['frame', 'section', 'group', 'boolean']
export const isContainer = (n: SNode) => CONTAINER_TYPES.includes(n.type)

export const solid = (color: string, opacity = 1): Fill => ({ id: uid(), kind: 'solid', color, opacity, visible: true })
export const stroke = (color = '#000000', width = 1): Stroke => ({
  id: uid(),
  color,
  opacity: 1,
  width,
  align: 'inside',
  dash: 0,
  visible: true,
})

const DEFAULT_NAMES: Record<NodeType, string> = {
  frame: 'Frame',
  section: 'Section',
  group: 'Group',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
  vector: 'Vector',
  text: 'Text',
  image: 'Image',
  video: 'Video',
  shape3d: '3D Shape',
  model3d: '3D Model',
  boolean: 'Boolean',
  comment: 'Comment',
}

export function createNode(type: NodeType, parentId: string, patch: Partial<SNode> = {}): SNode {
  const fills: Fill[] =
    type === 'frame'
      ? [solid('#ffffff')]
      : type === 'section'
        ? [solid('#e5e5e5', 0.5)]
        : type === 'text'
          ? [solid('#111111')]
          : ['group', 'image', 'video', 'model3d', 'shape3d', 'comment', 'boolean'].includes(type)
            ? []
            : [solid('#d9d9d9')]
  return {
    id: uid(),
    type,
    name: DEFAULT_NAMES[type],
    parentId,
    children: [],
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    opacity: 1,
    blend: 'normal',
    visible: true,
    locked: false,
    expanded: true,
    clip: type === 'frame',
    mask: false,
    aspectLocked: type === 'image' || type === 'video',
    radius: [0, 0, 0, 0],
    fills,
    strokes: type === 'vector' ? [stroke('#111111', 2)] : [],
    effects: [],
    autoLayout: null,
    sizing: { h: 'fixed', v: 'fixed' },
    constraints: { h: 'left', v: 'top' },
    sides: type === 'star' ? 5 : 3,
    innerRatio: 0.4,
    path: '',
    text:
      type === 'text'
        ? {
            content: 'Text',
            fontFamily: 'Inter Variable',
            fontSize: 24,
            fontWeight: 400,
            italic: false,
            underline: false,
            strike: false,
            lineHeight: 1.2,
            letterSpacing: 0,
            align: 'left',
            verticalAlign: 'top',
            transform: 'none',
            autoSize: 'width',
          }
        : null,
    src: '',
    shape3d: 'cube',
    modelColor: '#6366f1',
    booleanOp: 'union',
    states: [],
    interactions: [],
    exports: [],
    rev: 0,
    editedBy: '',
    ...patch,
  }
}

export function createPage(name = 'Page 1'): Page {
  return { id: uid(), name, children: [], background: '#f5f5f5' }
}

const UNTITLED = 'Untitled'

/** True for the placeholder names a new file gets: "Untitled", "Untitled (1)"… */
export const isPlaceholderName = (name: string) => /^Untitled( \(\d+\))?$/.test(name.trim())

/** `base` if no other file has it, else "base (1)", "base (2)"… the first free number. */
export function uniqueName(base: string, taken: string[]) {
  const names = new Set(taken.map((n) => n.trim().toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  for (let i = 1; ; i++) if (!names.has(`${base} (${i})`.toLowerCase())) return `${base} (${i})`
}

export function createDoc(name = UNTITLED): Doc {
  return { id: uid(), name, pages: [createPage()], nodes: {}, createdAt: Date.now(), updatedAt: Date.now() }
}

/* ---------- tree helpers ---------- */

export function pageOf(doc: Doc, nodeId: string): Page | undefined {
  let id = nodeId
  for (let i = 0; i < 100; i++) {
    const node = doc.nodes[id]
    if (!node) return doc.pages.find((p) => p.id === id)
    id = node.parentId
  }
}

export function childrenOf(doc: Doc, parentId: string) {
  return doc.nodes[parentId]?.children ?? doc.pages.find((p) => p.id === parentId)?.children ?? []
}

export function setChildren(doc: Doc, parentId: string, ids: string[]) {
  const node = doc.nodes[parentId]
  if (node) node.children = ids
  else {
    const page = doc.pages.find((p) => p.id === parentId)
    if (page) page.children = ids
  }
}

export function descendants(doc: Doc, id: string): string[] {
  const out: string[] = []
  const walk = (nid: string) => {
    for (const c of doc.nodes[nid]?.children ?? []) {
      out.push(c)
      walk(c)
    }
  }
  walk(id)
  return out
}

export function ancestors(doc: Doc, id: string): string[] {
  const out: string[] = []
  let cur = doc.nodes[id]?.parentId
  while (cur && doc.nodes[cur]) {
    out.push(cur)
    cur = doc.nodes[cur].parentId
  }
  return out
}

/** Absolute (page-space) top-left of a node. Parent rotation is ignored for hit testing. */
export function absPos(doc: Doc, id: string) {
  let x = 0
  let y = 0
  let node: SNode | undefined = doc.nodes[id]
  while (node) {
    x += node.x
    y += node.y
    node = doc.nodes[node.parentId]
  }
  return { x, y }
}

export function absRect(doc: Doc, id: string) {
  const n = doc.nodes[id]
  const p = absPos(doc, id)
  return { x: p.x, y: p.y, w: n.w, h: n.h }
}

export type Rect = { x: number; y: number; w: number; h: number }

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  const x1 = Math.min(...rects.map((r) => r.x))
  const y1 = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.w))
  const y2 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/* ---------- geometry ---------- */

export function polygonPoints(w: number, h: number, sides: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
    pts.push([w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2])
  }
  return pts
}

export function starPoints(w: number, h: number, points: number, inner: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1
    const a = -Math.PI / 2 + (i * Math.PI) / points
    pts.push([w / 2 + (Math.cos(a) * w * r) / 2, h / 2 + (Math.sin(a) * h * r) / 2])
  }
  return pts
}

const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`

function roundedRectPath(w: number, h: number, [tl, tr, br, bl]: number[]) {
  const c = (r: number) => Math.max(0, Math.min(r, w / 2, h / 2))
  const [a, b, d, e] = [c(tl), c(tr), c(br), c(bl)]
  return `M${a},0H${w - b}A${b},${b} 0 0 1 ${w},${b}V${h - d}A${d},${d} 0 0 1 ${w - d},${h}H${e}A${e},${e} 0 0 1 0,${h - e}V${a}A${a},${a} 0 0 1 ${a},0Z`
}

/** SVG path of a shape node in its local box. */
export function shapePath(n: Pick<SNode, 'type' | 'w' | 'h' | 'radius' | 'sides' | 'innerRatio' | 'path'>): string {
  switch (n.type) {
    case 'ellipse':
      return `M${n.w / 2},0A${n.w / 2},${n.h / 2} 0 1 1 ${n.w / 2},${n.h}A${n.w / 2},${n.h / 2} 0 1 1 ${n.w / 2},0Z`
    case 'polygon':
      return poly(polygonPoints(n.w, n.h, Math.max(3, n.sides)))
    case 'star':
      return poly(starPoints(n.w, n.h, Math.max(3, n.sides), n.innerRatio))
    case 'vector':
      return n.path
    default:
      return roundedRectPath(n.w, n.h, n.radius)
  }
}

/** Translates every coordinate of an absolute-coordinate path (M/L/C/Q/Z only, as produced by the pen tool). */
export function translatePath(path: string, dx: number, dy: number, sx = 1, sy = 1) {
  return path.replace(
    /(-?\d*\.?\d+),(-?\d*\.?\d+)/g,
    (_, x, y) => `${((Number(x) + dx) * sx).toFixed(2)},${((Number(y) + dy) * sy).toFixed(2)}`,
  )
}

export function pathBounds(path: string): Rect {
  const nums = [...path.matchAll(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])])
  if (!nums.length) return { x: 0, y: 0, w: 1, h: 1 }
  const xs = nums.map((p) => p[0])
  const ys = nums.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) }
}

/* ---------- auto layout ---------- */

/** Positions children of auto-layout frames and resizes hugging frames. Runs bottom-up after every change. */
export function applyAutoLayout(doc: Doc) {
  const visit = (id: string) => {
    const node = doc.nodes[id]
    if (!node) return
    node.children.forEach(visit)
    const layout = node.autoLayout
    if (!layout) return
    const kids = node.children.map((c) => doc.nodes[c]).filter((k) => k && k.visible)
    const horiz = layout.direction === 'horizontal'
    const [pt, pr, pb, pl] = layout.padding
    const innerW = node.w - pl - pr
    const innerH = node.h - pt - pb
    const main = (k: SNode) => (horiz ? k.w : k.h)
    const fillKids = kids.filter((k) => (horiz ? k.sizing.h : k.sizing.v) === 'fill')
    const fixedMain = kids.filter((k) => !fillKids.includes(k)).reduce((s, k) => s + main(k), 0)
    const gaps = layout.gap * Math.max(0, kids.length - 1)
    const free = (horiz ? innerW : innerH) - fixedMain - gaps
    for (const k of fillKids) {
      if (horiz) k.w = Math.max(1, free / fillKids.length)
      else k.h = Math.max(1, free / fillKids.length)
    }
    for (const k of kids) {
      if ((horiz ? k.sizing.v : k.sizing.h) === 'fill') {
        if (horiz) k.h = innerH
        else k.w = innerW
      }
    }
    const total = kids.reduce((s, k) => s + main(k), 0)
    let gap = layout.gap
    let cursor = 0
    const span = horiz ? innerW : innerH
    if (layout.justify === 'center') cursor = (span - total - gaps) / 2
    else if (layout.justify === 'end') cursor = span - total - gaps
    else if (layout.justify === 'space-between' && kids.length > 1) gap = (span - total) / (kids.length - 1)
    let maxCross = 0
    for (const k of kids) {
      const cross = horiz ? innerH - k.h : innerW - k.w
      const off = layout.align === 'center' ? cross / 2 : layout.align === 'end' ? cross : 0
      if (horiz) {
        k.x = pl + cursor
        k.y = pt + off
      } else {
        k.y = pt + cursor
        k.x = pl + off
      }
      cursor += main(k) + gap
      maxCross = Math.max(maxCross, horiz ? k.h : k.w)
    }
    const used = total + layout.gap * Math.max(0, kids.length - 1)
    if (node.sizing.h === 'hug') node.w = horiz ? used + pl + pr : maxCross + pl + pr
    if (node.sizing.v === 'hug') node.h = horiz ? maxCross + pt + pb : used + pt + pb
  }
  for (const page of doc.pages) page.children.forEach(visit)
}

/** Applies a parent's resize to its children according to their constraints. */
export function applyConstraints(doc: Doc, parent: SNode, oldW: number, oldH: number) {
  if (parent.autoLayout || parent.type === 'group' || parent.type === 'boolean') return
  const dw = parent.w - oldW
  const dh = parent.h - oldH
  for (const cid of parent.children) {
    const c = doc.nodes[cid]
    if (!c) continue
    switch (c.constraints.h) {
      case 'right':
        c.x += dw
        break
      case 'left-right':
        c.w = Math.max(1, c.w + dw)
        break
      case 'center':
        c.x += dw / 2
        break
      case 'scale':
        c.x *= parent.w / oldW
        c.w *= parent.w / oldW
        break
    }
    switch (c.constraints.v) {
      case 'bottom':
        c.y += dh
        break
      case 'top-bottom':
        c.h = Math.max(1, c.h + dh)
        break
      case 'center':
        c.y += dh / 2
        break
      case 'scale':
        c.y *= parent.h / oldH
        c.h *= parent.h / oldH
        break
    }
  }
}

/** Deep-copies nodes (and their subtrees) with fresh ids. Returns the new root ids and all new nodes. */
export function cloneSubtrees(nodes: Record<string, SNode>, rootIds: string[], parentId?: string) {
  const out: Record<string, SNode> = {}
  const copy = (id: string, parent: string): string => {
    const src = nodes[id]
    const n: SNode = { ...structuredClone(src), id: uid(), parentId: parent }
    n.children = src.children.filter((c) => nodes[c]).map((c) => copy(c, n.id))
    out[n.id] = n
    return n.id
  }
  const roots = rootIds.filter((id) => nodes[id]).map((id) => copy(id, parentId ?? nodes[id].parentId))
  return { roots, nodes: out }
}

export const FRAME_PRESETS: { group: string; items: { name: string; w: number; h: number }[] }[] = [
  {
    group: 'Phone',
    items: [
      { name: 'iPhone 16', w: 393, h: 852 },
      { name: 'iPhone 16 Pro Max', w: 440, h: 956 },
      { name: 'Android Large', w: 360, h: 800 },
    ],
  },
  {
    group: 'Tablet',
    items: [
      { name: 'iPad Mini', w: 744, h: 1133 },
      { name: 'iPad Pro 11"', w: 834, h: 1194 },
    ],
  },
  {
    group: 'Desktop',
    items: [
      { name: 'Desktop', w: 1440, h: 1024 },
      { name: 'MacBook Air', w: 1280, h: 832 },
      { name: 'HD', w: 1920, h: 1080 },
    ],
  },
  {
    group: 'Social',
    items: [
      { name: 'Instagram Post', w: 1080, h: 1080 },
      { name: 'Instagram Story', w: 1080, h: 1920 },
      { name: 'X Post', w: 1200, h: 675 },
    ],
  },
  {
    group: 'Paper',
    items: [
      { name: 'A4', w: 595, h: 842 },
      { name: 'Letter', w: 612, h: 792 },
    ],
  },
]
