/* Markdown → editor document. Pulls in the editor's extensions, so import it lazily outside /s-note. */
import { type JSONContent, generateJSON } from '@tiptap/react'
import { marked } from 'marked'
import { buildExtensions } from '../editor/extensions'
import { EMPTY_DOC } from '../db/repo'

const parseDoc = (content: string): JSONContent => {
  try {
    return JSON.parse(content || EMPTY_DOC)
  } catch {
    return JSON.parse(EMPTY_DOC)
  }
}

/** Markdown written by an agent, as a serialized Tiptap document the editor can load. */
export function markdownToDoc(markdown: string, pageId: string): JSONContent {
  const html = marked.parse(markdown, { gfm: true, async: false })
  return generateJSON(html, buildExtensions({ pageId, nested: false }))
}

/** Combines new Markdown with a page's existing document. */
export function writeContent(current: string, markdown: string, mode: 'replace' | 'append' | 'prepend', pageId: string) {
  const added = markdownToDoc(markdown, pageId).content ?? []
  if (mode === 'replace') return JSON.stringify({ type: 'doc', content: added.length ? added : [{ type: 'paragraph' }] })
  const existing = (parseDoc(current).content ?? []).filter((node) => node.type !== 'paragraph' || node.content?.length)
  return JSON.stringify({ type: 'doc', content: mode === 'append' ? [...existing, ...added] : [...added, ...existing] })
}
