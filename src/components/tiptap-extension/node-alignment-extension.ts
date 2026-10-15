import type { NodeWithPos } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'

import { getSelectedNodesOfType, updateNodesAttr } from '@/lib/tiptap-utils'

export type TextAlignment = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlignment = 'top' | 'middle' | 'bottom'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    nodeAlignment: {
      setNodeTextAlign: (alignment: TextAlignment) => ReturnType
      unsetNodeTextAlign: () => ReturnType
      setNodeVerticalAlign: (alignment: VerticalAlignment) => ReturnType
      unsetNodeVerticalAlign: () => ReturnType
    }
  }
}

export interface NodeAlignmentOptions {
  /**
   * Node types that carry alignment attributes.
   * @default ["tableCell", "tableHeader"]
   */
  types: string[]
}

/**
 * Adds `textAlign` and `verticalAlign` attributes to container nodes such as table cells,
 * with commands that act on every selected cell.
 */
export const NodeAlignment = Extension.create<NodeAlignmentOptions>({
  name: 'nodeAlignment',

  addOptions() {
    return { types: ['tableCell', 'tableHeader'] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.style.textAlign || el.getAttribute('data-text-align') || null,
            renderHTML: (attrs) => (attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {}),
          },
          verticalAlign: {
            default: null as string | null,
            parseHTML: (el: HTMLElement) => el.style.verticalAlign || el.getAttribute('data-vertical-align') || null,
            renderHTML: (attrs) => (attrs.verticalAlign ? { style: `vertical-align: ${attrs.verticalAlign}` } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    const apply =
      (attr: 'textAlign' | 'verticalAlign', value: string | null) =>
      () =>
      ({ state, tr }: { state: EditorState; tr: Transaction }) => {
        const targets: NodeWithPos[] = getSelectedNodesOfType(state.selection, this.options.types)
        if (targets.length === 0) return false
        return updateNodesAttr(tr, targets, attr, value)
      }

    return {
      setNodeTextAlign: (alignment) => apply('textAlign', alignment)(),
      unsetNodeTextAlign: () => apply('textAlign', null)(),
      setNodeVerticalAlign: (alignment) => apply('verticalAlign', alignment)(),
      unsetNodeVerticalAlign: () => apply('verticalAlign', null)(),
    }
  },
})
