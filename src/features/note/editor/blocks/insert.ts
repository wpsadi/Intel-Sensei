import { openNewMath } from '../math-editor'
import { type Editor, type Range } from '@tiptap/core'
import type { MenuItem } from '../suggestion-menu'
import type { ViewType } from '../../db/types'
import { useNoteStore } from '../../note.store'

/** Host page id is stored on the editor so commands can create children of it. */
export const hostPageId = (editor: Editor) => (editor.storage as unknown as { snote: { pageId: string } }).snote.pageId

/** One insertable block: its menu row (title, icon, keywords, group) and how it is inserted. */
export type BlockDefinition = MenuItem

export const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range)
export const block =
  (type: string, attrs: Record<string, unknown> = {}) =>
  (editor: Editor, range: Range) =>
    chain(editor, range).insertContent({ type, attrs }).run()

/** Replaces the slash text and drops the caret into a fresh blank paragraph after the inserted node. */
export const toggle = (level: number) => (editor: Editor, range: Range) =>
  chain(editor, range)
    .insertContent({
      type: 'details',
      attrs: { level },
      content: [{ type: 'detailsSummary' }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }],
    })
    .run()

export const database = (viewType: ViewType) => async (editor: Editor, range: Range) => {
  const db = await useNoteStore.getState().createDatabase(hostPageId(editor), '', viewType)
  chain(editor, range)
    .insertContent({
      type: 'databaseBlock',
      attrs: { databaseId: db.id, ownerId: db.id },
    })
    .run()
}

/**
 * Inserts an empty equation and opens its LaTeX editor, like Notion.
 * (The extension's insert*Math commands read the pre-chain selection, so plain insertContent is used.)
 */
export const math = (inline: boolean) => (editor: Editor, range: Range) => {
  chain(editor, range)
    .insertContent({ type: inline ? 'inlineMath' : 'blockMath', attrs: { latex: '' } })
    .run()
  openNewMath(editor, range.from, inline)
}
