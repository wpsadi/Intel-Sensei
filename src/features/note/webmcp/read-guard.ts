import type { JSONContent } from '@tiptap/react'

/*
 * Edits must be based on what the agent last read. Reading a note records the shape of the document it saw;
 * an edit is refused when that shape has changed since (blocks were added, removed or moved), so the agent
 * never writes to a stale block address. Text and attribute changes do not move addresses, so they are
 * ignored: comparing the exact JSON made every edit fail after the user typed, an editor opened and filled
 * in default attributes, or a node view updated itself, and the agent re-read the note in a loop.
 */

const seen = new Map<string, string>()

/** Block types and nesting only, e.g. `heading,paragraph,bulletList(listItem(paragraph))`. */
function shape(node: JSONContent): string {
  const blocks = (node.content ?? []).filter((child) => child.type !== 'text' && child.type !== 'hardBreak' && !child.marks)
  return blocks.map((child) => (child.content?.some((c) => c.type !== 'text') ? `${child.type}(${shape(child)})` : child.type)).join(',')
}

/** The editor keeps an empty paragraph at the end for typing; a saved copy may not have it yet. */
function key(doc: JSONContent) {
  const content = [...(doc.content ?? [])]
  const last = content.at(-1)
  if (last?.type === 'paragraph' && !last.content?.length) content.pop()
  return shape({ ...doc, content })
}

export function markRead(pageId: string, doc: JSONContent) {
  seen.set(pageId, key(doc))
}

/** Forgets what was read, so the next edit needs a fresh read (after structural changes). */
export function forgetRead(pageId: string) {
  seen.delete(pageId)
}

export function assertRead(pageId: string, title: string, current: JSONContent) {
  const last = seen.get(pageId)
  if (last === key(current)) return
  throw new Error(
    last
      ? `"${title}" has changed since you last read it. Call list_blocks (or read_note) again and use the current block addresses. Nothing was changed.`
      : `Read "${title}" first with list_blocks (or read_note) so you edit the right place. Nothing was changed.`,
  )
}
