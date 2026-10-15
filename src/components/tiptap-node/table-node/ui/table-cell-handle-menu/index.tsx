import type { Editor } from '@tiptap/react'
import { ChevronDownIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/tiptap-ui-primitive/dropdown-menu'
import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { TABLE_UI_ATTR } from '@/lib/tiptap-table-utils'

import { TableAlignMenu } from '../table-alignment-menu'
import { TableClearRowColumnContentButton } from '../table-clear-row-column-content-button'
import { TableMergeSplitCellButton } from '../table-merge-split-cell-button'

const DRAG_THRESHOLD = 3

/** Tints that read on both light and dark backgrounds. */
const CELL_COLORS = [
  { name: 'Gray', value: 'rgba(120, 119, 116, 0.22)' },
  { name: 'Brown', value: 'rgba(159, 107, 83, 0.25)' },
  { name: 'Orange', value: 'rgba(217, 115, 13, 0.22)' },
  { name: 'Yellow', value: 'rgba(203, 145, 47, 0.25)' },
  { name: 'Green', value: 'rgba(68, 131, 97, 0.25)' },
  { name: 'Blue', value: 'rgba(51, 126, 169, 0.25)' },
  { name: 'Purple', value: 'rgba(144, 101, 176, 0.25)' },
  { name: 'Pink', value: 'rgba(193, 76, 138, 0.25)' },
  { name: 'Red', value: 'rgba(212, 76, 71, 0.25)' },
]

export interface TableCellHandleMenuProps {
  editor?: Editor | null
  /** Called on mouse down on the handle. The selection overlay uses it to start drag-selecting. */
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

/**
 * The button on a selection's bottom-right corner. A click opens the cell menu (merge / split,
 * alignment, background, clear); a drag extends the selection through `onMouseDown`.
 */
export function TableCellHandleMenu({ editor: providedEditor, onMouseDown }: TableCellHandleMenuProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const [open, setOpen] = useState(false)
  const moved = useRef(false)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  if (!editor) return null

  const item = (node: React.ReactNode) => <DropdownMenuItem asChild>{node}</DropdownMenuItem>

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          {...{ [TABLE_UI_ATTR]: '' }}
          className="tiptap-table-cell-handle"
          aria-label="Cell options"
          data-active={open}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            e.preventDefault()
            moved.current = false
            const startX = e.clientX
            const startY = e.clientY
            const move = (ev: MouseEvent) => {
              if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) moved.current = true
            }
            const up = () => {
              window.removeEventListener('mousemove', move)
              window.removeEventListener('mouseup', up)
              cleanup.current = null
            }
            window.addEventListener('mousemove', move)
            window.addEventListener('mouseup', up)
            cleanup.current = up
            onMouseDown?.(e)
          }}
          onClick={() => {
            if (!moved.current) setOpen((o) => !o)
          }}
        >
          <ChevronDownIcon className="tiptap-table-cell-handle-icon" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        {...{ [TABLE_UI_ATTR]: '' }}
        className="tiptap-table-handle-menu"
        align="start"
        side="bottom"
        onMouseDown={(e) => e.preventDefault()}
      >
        {item(<TableMergeSplitCellButton editor={editor} action="merge" text="Merge cells" />)}
        {item(<TableMergeSplitCellButton editor={editor} action="split" text="Split cell" />)}
        <DropdownMenuSeparator />
        <TableAlignMenu editor={editor} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Background</DropdownMenuLabel>
        <div className="tiptap-table-swatches">
          <button
            type="button"
            className="tiptap-table-swatch is-none"
            aria-label="No background"
            title="No background"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetNodeBackgroundColor().run()}
          />
          {CELL_COLORS.map(({ name, value }) => (
            <button
              key={name}
              type="button"
              className="tiptap-table-swatch"
              aria-label={name}
              title={name}
              style={{ background: value }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setNodeBackgroundColor(value).run()}
            />
          ))}
        </div>
        <DropdownMenuSeparator />
        {item(<TableClearRowColumnContentButton editor={editor} text="Clear contents" resetAttrs />)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
