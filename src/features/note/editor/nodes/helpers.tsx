import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { type ReactNode, type RefObject, createContext, useContext, useEffect } from 'react'
import { cn } from '@/lib/utils'

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

/** Standard frame for atom blocks: selection ring + drag support. */
export function BlockFrame({
  selected,
  className,
  children,
}: {
  selected: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <NodeViewWrapper
      className={cn('snote-block my-1 rounded-md', selected && 'ring-2 ring-blue-400/60', className)}
      data-drag-handle=""
      contentEditable={false}
    >
      {children}
    </NodeViewWrapper>
  )
}

/** Empty-state placeholder shown before a block is configured. */
export function BlockPlaceholder({ icon, label, children }: { icon: ReactNode; label: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function UrlForm({ placeholder, onSubmit, button = 'Embed' }: { placeholder: string; onSubmit: (url: string) => void; button?: string }) {
  return (
    <form
      className="flex min-w-60 flex-1 gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const value = new FormData(event.currentTarget).get('url')?.toString().trim()
        if (value) onSubmit(value)
      }}
    >
      <input
        name="url"
        placeholder={placeholder}
        className="h-8 flex-1 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      />
      <button type="submit" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
        {button}
      </button>
    </form>
  )
}
