import type { Editor } from '@tiptap/react'
import {
  ArrowDownToLineIcon,
  ArrowUpToLineIcon,
  CopyIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  MessageSquareIcon,
  QuoteIcon,
  Trash2Icon,
  TypeIcon,
} from 'lucide-react'
import { useRef } from 'react'

import { cn } from '@/lib/utils'

import { useCloseOnOutsidePress } from '../nodes/block-utils'
import { LIST_ITEMS } from './block-dom'

interface BlockActionsProps {
  editor: Editor
  start: number
  size: number
  top: number
  onClose: () => void
  onComment: () => void
}

const row = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted'

/** Block actions opened by the grip: turn a text block into another style, duplicate it, or delete it. */
export function BlockActions({ editor, start, size, top, onClose, onComment }: BlockActionsProps) {
  const ref = useRef<HTMLDivElement>(null)
  useCloseOnOutsidePress(ref, onClose)
  const node = editor.state.doc.nodeAt(start)
  // List rows wrap a paragraph, so their text starts one position deeper.
  const textStart = node?.isTextblock ? start + 1 : start + 2
  const at = () => editor.chain().focus().setTextSelection(textStart)

  // An empty block next to this one: a list row gets a row of the same kind, anything else a text block.
  const insertEmpty = (pos: number) => {
    const type = node?.type.name ?? ''
    const list = LIST_ITEMS.includes(type)
    editor
      .chain()
      .focus()
      .insertContentAt(pos, list ? { type, content: [{ type: 'paragraph' }] } : { type: 'paragraph' })
      .setTextSelection(pos + (list ? 2 : 1))
      .run()
  }

  // Turning only applies to text blocks, so atom blocks such as media skip the list.
  const turnInto = [
    { label: 'Text', icon: TypeIcon, run: () => at().setParagraph().run() },
    {
      label: 'Heading 1',
      icon: Heading1Icon,
      run: () => at().setHeading({ level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      icon: Heading2Icon,
      run: () => at().setHeading({ level: 2 }).run(),
    },
    {
      label: 'Heading 3',
      icon: Heading3Icon,
      run: () => at().setHeading({ level: 3 }).run(),
    },
    { label: 'Quote', icon: QuoteIcon, run: () => at().setBlockquote().run() },
  ]

  return (
    <div
      ref={ref}
      className="absolute left-8 z-50 w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ top }}
      contentEditable={false}
    >
      {node && !node.isAtom && (
        <>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Turn into</div>
          {turnInto.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                onClose()
                run()
              }}
              className={row}
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </button>
          ))}
          <div className="my-1 border-t" />
        </>
      )}
      <button
        type="button"
        onClick={() => {
          onClose()
          insertEmpty(start)
        }}
        className={row}
      >
        <ArrowUpToLineIcon className="size-4 text-muted-foreground" />
        Insert above
      </button>
      <button
        type="button"
        onClick={() => {
          onClose()
          insertEmpty(start + size)
        }}
        className={row}
      >
        <ArrowDownToLineIcon className="size-4 text-muted-foreground" />
        Insert below
      </button>
      <button
        type="button"
        onClick={() => {
          onClose()
          onComment()
        }}
        className={row}
      >
        <MessageSquareIcon className="size-4 text-muted-foreground" />
        Comment
      </button>
      <button
        type="button"
        onClick={() => {
          if (node) editor.view.dispatch(editor.state.tr.insert(start + size, node))
          onClose()
        }}
        className={row}
      >
        <CopyIcon className="size-4 text-muted-foreground" />
        Duplicate
      </button>
      <button
        type="button"
        onClick={() => {
          editor.view.dispatch(editor.state.tr.delete(start, start + size))
          onClose()
        }}
        className={cn(row, 'text-red-500')}
      >
        <Trash2Icon className="size-4" />
        Delete
      </button>
    </div>
  )
}
