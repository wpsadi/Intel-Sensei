import type { Editor } from '@tiptap/react'

export const BLOCK_DRAG = 'snote-block'

export interface DraggedBlock {
  start: number
  size: number
}

export interface BlockHover {
  /** Document position where the hovered top-level block starts. */
  start: number
  size: number
  /** Block box relative to the editor wrapper. */
  top: number
  height: number
  /** Left edge of the block relative to the editor wrapper, so the handles sit right beside it, even inside a callout. */
  left: number
}

/** The top-level block whose DOM contains `el`. Works for atom blocks (media, embeds), which text-position lookups miss. */
function topBlockAtDom(editor: Editor, el: Element) {
  let found: { start: number; size: number; dom: HTMLElement } | null = null
  editor.state.doc.forEach((node, offset) => {
    if (found) return
    const dom = editor.view.nodeDOM(offset) as HTMLElement | null
    if (dom && dom.contains(el)) found = { start: offset, size: node.nodeSize, dom }
  })
  return found
}

/** The top-level block at a document position. Leaf blocks sit at depth 0, so the node at the position is used. */
function topBlockAtPos(editor: Editor, pos: number) {
  const { doc } = editor.state
  const $pos = doc.resolve(pos)
  const start = $pos.depth >= 1 ? $pos.before(1) : pos
  const node = doc.nodeAt(start)
  const dom = node ? (editor.view.nodeDOM(start) as HTMLElement | null) : null
  return node && dom ? { start, size: node.nodeSize, dom } : null
}

/** List rows (bullets, numbers, checklist items) get their own handles, like top-level blocks. */
export const LIST_ITEMS = ['listItem', 'taskItem']

/** The innermost list row whose DOM contains `el`. */
function listItemAtDom(editor: Editor, el: Element) {
  const li = el.closest('li')
  if (!li || !editor.view.dom.contains(li)) return null
  let pos: number
  try {
    pos = editor.view.posAtDOM(li, 0)
  } catch {
    return null
  }
  const $pos = editor.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (LIST_ITEMS.includes(node.type.name))
      return {
        start: $pos.before(depth),
        size: node.nodeSize,
        dom: li as HTMLElement,
      }
  }
  return null
}

/** Containers whose child blocks get their own handles, so "+" and the grip stay with each block inside them. */
const CONTAINERS = ['callout']

/** The innermost block sitting directly inside a container (a callout) whose DOM contains `el`. */
function containerChildAtDom(editor: Editor, el: Element) {
  if (!editor.view.dom.contains(el)) return null
  let pos: number
  try {
    pos = editor.view.posAtDOM(el, 0)
  } catch {
    return null
  }
  const $pos = editor.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 1; depth--) {
    if (!CONTAINERS.includes($pos.node(depth - 1).type.name)) continue
    const start = $pos.before(depth)
    const dom = editor.view.nodeDOM(start) as HTMLElement | null
    if (dom) return { start, size: $pos.node(depth).nodeSize, dom }
  }
  return null
}

/** Block under the pointer: a list row first, then a block inside a callout, then the top-level block by DOM, then by text position. */
export function blockUnder(editor: Editor, target: Element, x: number, y: number) {
  const item = listItemAtDom(editor, target)
  if (item) return item
  const nested = containerChildAtDom(editor, target)
  if (nested) return nested
  const byDom = topBlockAtDom(editor, target)
  if (byDom) return byDom
  const hit = editor.view.posAtCoords({ left: x, top: y })
  return hit ? topBlockAtPos(editor, hit.pos) : null
}
