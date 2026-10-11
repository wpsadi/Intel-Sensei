import { Extension } from '@tiptap/core'

export interface BlockComment {
  id: string
  text: string
  createdAt: number
}

/** Blocks that can carry comments. Comments live on the block, so they save and move with it. */
const COMMENTABLE = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'bulletList',
  'orderedList',
  'taskList',
  'details',
  'callout',
  'columns',
  'tabs',
  'table',
  'horizontalRule',
  'blockMath',
  'media',
  'embed',
  'pageBlock',
  'buttonBlock',
  'aiBlock',
  'databaseBlock',
  'syncedBlock',
  'tableOfContents',
  'breadcrumb',
]

export const BlockComments = Extension.create({
  name: 'blockComments',
  addGlobalAttributes() {
    return [
      {
        types: COMMENTABLE,
        attributes: {
          comments: {
            default: [],
            // Kept in the JSON document only; the DOM just marks that a block has comments.
            parseHTML: () => [],
            renderHTML: (attrs) => (attrs.comments?.length ? { 'data-comments': attrs.comments.length } : {}),
          },
        },
      },
    ]
  },
})

export const commentsOf = (attrs: Record<string, unknown> | undefined) => (attrs?.comments as BlockComment[] | undefined) ?? []
