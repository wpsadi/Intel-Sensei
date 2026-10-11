import { AiBlock, ButtonBlock } from './nodes/actions'
import { BlockComments } from './blocks/comments'
import { Breadcrumb, PageBlock, TableOfContents } from './nodes/pages'
import { Callout, Column, Columns, TabPanel, Tabs } from './nodes/layout'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { DatabaseBlock } from './blocks/catalog/database/DatabaseBlock'
import { SyncedBlock } from './nodes/data'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { type Editor, Extension, type Extensions } from '@tiptap/core'
import { EmojiNode, MentionNode } from './nodes/inline'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { CodeBlock } from './nodes/code'
import { Embed } from './nodes/embed'
import { Highlight } from '@tiptap/extension-highlight'
import { Mathematics } from '@tiptap/extension-mathematics'
import { Media } from './nodes/media'
import { openMathEditor } from './math-editor'
import { caretPlaceholder } from './caret-placeholder'
import { SlashCommands } from './slash-commands'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'

/** Toggle list (level 0) and toggle headings 1–3 share one node; the level styles the summary. */
const ToggleBlock = Details.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      level: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute('data-level') ?? 0),
        renderHTML: (attrs) => ({ 'data-level': attrs.level }),
      },
    }
  },
}).configure({ persist: true, HTMLAttributes: { class: 'snote-toggle' } })

/** Holds the id of the page the editor belongs to, for commands that create child pages. */
const SNoteStorage = Extension.create<{ pageId: string }, { pageId: string }>({
  name: 'snote',
  addOptions() {
    return { pageId: '' }
  },
  addStorage() {
    return { pageId: this.options.pageId }
  },
})


export function buildExtensions({ pageId, nested }: { pageId: string; nested: boolean }): Extensions {
  // Math click handlers only receive (node, pos), so capture the owning editor here.
  let owner: Editor | null = null
  const MathOwner = Extension.create({
    name: 'mathOwner',
    onCreate() {
      owner = this.editor
    },
  })

  return [
    MathOwner,
    SNoteStorage.configure({ pageId }),
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false,
      link: { openOnClick: false, autolink: true, HTMLAttributes: { class: 'snote-link' } },
      dropcursor: { color: '#60a5fa', width: 3 },
    }),
    caretPlaceholder(nested),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true } }),
    ToggleBlock,
    DetailsSummary,
    DetailsContent,
    Mathematics.configure({
      katexOptions: { throwOnError: false },
      inlineOptions: {
        onClick: (_node, pos) => owner?.isEditable && openMathEditor(owner, pos, true),
      },
      blockOptions: {
        onClick: (_node, pos) => owner?.isEditable && openMathEditor(owner, pos, false),
      },
    }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    CodeBlock,
    Callout,
    Column,
    Columns,
    Tabs,
    TabPanel,
    Media,
    Embed,
    PageBlock,
    Breadcrumb,
    TableOfContents,
    ButtonBlock,
    AiBlock,
    DatabaseBlock,
    // A synced block cannot contain another synced block.
    ...(nested ? [] : [SyncedBlock]),
    MentionNode,
    EmojiNode,
    SlashCommands,
    BlockComments,
  ]
}
