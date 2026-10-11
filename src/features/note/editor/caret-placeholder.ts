import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/** Hint for an empty text block. Code blocks show none, since they have their own language picker. */
function hintFor(block: PMNode, nested: boolean) {
  if (block.type.name === 'heading') return `Heading ${block.attrs.level}`
  if (block.type.name === 'detailsSummary') return 'Toggle'
  if (block.type.name === 'codeBlock') return ''
  return nested ? 'Type something…' : "Write, press '/' for commands, '@' to mention…"
}

/**
 * Marks only the empty text block the caret is in. Computed from the selection on every
 * transaction, so the hint moves with the caret and never stays on a line the caret has left
 * (Tiptap's Placeholder keeps stale marks after a caret-only move).
 */
export function caretPlaceholder(nested: boolean) {
  return Extension.create({
    name: 'caretPlaceholder',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('caretPlaceholder'),
          props: {
            decorations(state) {
              const { selection, doc } = state
              if (!selection.empty) return null
              const { $from } = selection
              const block = $from.parent
              if (!block.isTextblock || block.content.size > 0) return null
              const hint = hintFor(block, nested)
              return DecorationSet.create(doc, [Decoration.node($from.before(), $from.after(), { class: 'is-empty', 'data-placeholder': hint })])
            },
          },
        }),
      ]
    },
  })
}
