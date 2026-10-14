import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { TextSelection } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { lowlight } from './lowlight'
import { CodeBlockView } from './views/code'

export const CodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      view: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-view'),
        renderHTML: (attrs) => (attrs.view ? { 'data-view': attrs.view } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) => Number(el.getAttribute('data-width')) || null,
        renderHTML: (attrs) => (attrs.width ? { 'data-width': attrs.width } : {}),
      },
    }
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      // Inside a code block, select all takes just its code; pressed again, the whole note.
      'Mod-a': ({ editor }) => {
        const { $from, $to, from, to } = editor.state.selection
        if ($from.parent.type.name !== this.name || !$from.sameParent($to)) return false
        const start = $from.start()
        const end = $from.end()
        if (from === start && to === end) return false
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start, end)))
        return true
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight, defaultLanguage: null, enableTabIndentation: true, tabSize: 2 })
