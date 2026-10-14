import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { type RefObject, createContext, useContext, useEffect } from 'react'

/** The page that hosts the editor. Node views use it to create children and render breadcrumbs. */
export const EditorPageContext = createContext<{ pageId: string }>({ pageId: '' })
export const useEditorPage = () => useContext(EditorPageContext)

/**
 * Calls `onClose` when a press lands outside `ref`. Used instead of a full-screen overlay,
 * which would hide the page underneath and stop blocks from showing their handles on hover.
 */
export function useCloseOnOutsidePress(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as globalThis.Node)) onClose()
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [ref, onClose])
}

/** Defines a leaf block (no editable content) whose attributes are plain JSON values rendered by React. */
export function atomBlock(name: string, defaults: Record<string, unknown>, view: Parameters<typeof ReactNodeViewRenderer>[0]) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { default: value }]))
    },
    parseHTML() {
      return [{ tag: `div[data-type="${name}"]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': name })]
    },
    addNodeView() {
      return ReactNodeViewRenderer(view)
    },
  })
}
