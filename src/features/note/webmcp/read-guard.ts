import type { JSONContent } from '@tiptap/react'

/*
 * Edits must be based on what the agent last read. Reading a note records the exact document it saw;
 * an edit is refused when the note has changed since (the user typed, or an earlier edit shifted block
 * addresses), so the agent never writes into a stale picture of the note.
 */

const seen = new Map<string, string>()
const key = (doc: JSONContent) => JSON.stringify(doc)

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
