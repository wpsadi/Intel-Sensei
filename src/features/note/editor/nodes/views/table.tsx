import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeViewContent, type NodeViewProps, NodeViewWrapper, useEditorState } from '@tiptap/react'
import { ArrowDownToLineIcon, ArrowUpToLineIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import type { ReactNode } from 'react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'

/** Narrowest a column can be dragged to. Matches the resize plugin's cellMinWidth. */
const CELL_MIN_WIDTH = 25

/** Document position inside the first paragraph of cell (row, col). `at` is the position of the table node itself. */
function cellText(table: PMNode, at: number, row: number, col: number) {
  let pos = at + 1
  for (let r = 0; r < row; r++) pos += table.child(r).nodeSize
  pos += 1 // into the row
  for (let c = 0; c < col; c++) pos += table.child(row).child(c).nodeSize
  return pos + 2 // into the cell, then into its paragraph
}

/** Column widths from the first row, one per column (null where the column has no width yet). */
function columnWidths(table: PMNode) {
  const widths: (number | null)[] = []
  table.firstChild?.forEach((cell) => {
    for (let j = 0; j < cell.attrs.colspan; j++) widths.push(cell.attrs.colwidth?.[j] || null)
  })
  return widths
}

const controlClass =
  'flex items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground'

interface MenuItem {
  label: string
  icon: typeof PlusIcon
  run: () => void
  disabled?: boolean
  destructive?: boolean
}

/** A small dropdown listing row or column commands, shown above a table while the cursor is inside it. */
function TableMenu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={`${controlClass} h-6 gap-1 px-2 text-xs font-medium`} />}>
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {items.map(({ label: text, icon: Icon, run, disabled, destructive }) => (
          <DropdownMenuItem key={text} disabled={disabled} variant={destructive ? 'destructive' : 'default'} onClick={run}>
            <Icon className="size-4" />
            {text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Tables render here instead of TipTap's default view so the grid sits in a ScrollArea, with "+" buttons
 * at the right and bottom edges and row / column menus while the cursor is in the table.
 */
export function TableView({ node, getPos, editor }: NodeViewProps) {
  const editable = useEditorState({ editor, selector: ({ editor: e }) => e.isEditable })
  // Only the table the cursor is in shows its row and column menus.
  const inside = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const at = getPos()
      const size = at === undefined ? 0 : (e.state.doc.nodeAt(at)?.nodeSize ?? 0)
      const { from, to } = e.state.selection
      return at !== undefined && from > at && to < at + size
    },
  })

  const rows = node.childCount
  const cols = node.firstChild?.childCount ?? 0
  const widths = columnWidths(node)
  const total = widths.reduce<number>((sum, w) => sum + (w ?? CELL_MIN_WIDTH), 0)
  // Tables whose columns all have widths get a fixed width; otherwise they keep their minimum and fill the editor.
  const fixed = widths.every(Boolean)

  const addColumn = () => {
    const at = getPos()
    if (at === undefined) return
    editor
      .chain()
      .focus()
      .setTextSelection(cellText(node, at, 0, cols - 1))
      .addColumnAfter()
      .run()
  }
  const addRow = () => {
    const at = getPos()
    if (at === undefined) return
    editor
      .chain()
      .focus()
      .setTextSelection(cellText(node, at, rows - 1, 0))
      .addRowAfter()
      .run()
  }

  const rowMenu: MenuItem[] = [
    { label: 'Insert row above', icon: ArrowUpToLineIcon, run: () => editor.chain().focus().addRowBefore().run() },
    { label: 'Insert row below', icon: ArrowDownToLineIcon, run: () => editor.chain().focus().addRowAfter().run() },
    {
      label: 'Delete row',
      icon: Trash2Icon,
      run: () => editor.chain().focus().deleteRow().run(),
      disabled: rows < 2,
      destructive: true,
    },
  ]
  const columnMenu: MenuItem[] = [
    { label: 'Insert column left', icon: ArrowUpToLineIcon, run: () => editor.chain().focus().addColumnBefore().run() },
    { label: 'Insert column right', icon: ArrowDownToLineIcon, run: () => editor.chain().focus().addColumnAfter().run() },
    {
      label: 'Delete column',
      icon: Trash2Icon,
      run: () => editor.chain().focus().deleteColumn().run(),
      disabled: cols < 2,
      destructive: true,
    },
  ]

  const controls: ReactNode = editable && inside && (
    <div className="mb-1 flex items-center gap-1" contentEditable={false}>
      <TableMenu label="Row" items={rowMenu} />
      <TableMenu label="Column" items={columnMenu} />
    </div>
  )

  return (
    <NodeViewWrapper className="my-2">
      {controls}
      <div className="flex items-stretch gap-1">
        <ScrollArea className="min-w-0 flex-1">
          <table style={fixed ? { width: `${total}px` } : { minWidth: `${total}px` }}>
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={w ? { width: `${Math.max(w, CELL_MIN_WIDTH)}px` } : { minWidth: `${CELL_MIN_WIDTH}px` }} />
              ))}
            </colgroup>
            <NodeViewContent<'tbody'> as="tbody" />
          </table>
        </ScrollArea>
        {editable && (
          <button
            type="button"
            aria-label="Add column"
            title="Add column"
            contentEditable={false}
            onClick={addColumn}
            className={`${controlClass} w-5 shrink-0`}
          >
            <PlusIcon className="size-3.5" />
          </button>
        )}
      </div>
      {editable && (
        <button
          type="button"
          aria-label="Add row"
          title="Add row"
          contentEditable={false}
          onClick={addRow}
          className={`${controlClass} mt-1 h-5 w-full`}
        >
          <PlusIcon className="size-3.5" />
        </button>
      )}
    </NodeViewWrapper>
  )
}
