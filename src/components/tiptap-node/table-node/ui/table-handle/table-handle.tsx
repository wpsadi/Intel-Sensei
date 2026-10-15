import type { Editor } from '@tiptap/react'
import { GripHorizontalIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { clearTableHover } from '@/components/tiptap-node/table-node/extensions/table-handle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/tiptap-ui-primitive/dropdown-menu'
import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import {
  type Box,
  type Orientation,
  TABLE_UI_ATTR,
  type TableContext,
  getColumnBox,
  getRowBox,
  getTableBox,
  lineIndexFromPoint,
  moveLine,
  selectLine,
} from '@/lib/tiptap-table-utils'

import { TableAddRowColumnButton } from '../table-add-row-column-button'
import { TableAlignMenu } from '../table-alignment-menu'
import { TableClearRowColumnContentButton } from '../table-clear-row-column-content-button'
import { TableDeleteRowColumnButton } from '../table-delete-row-column-button'
import { TableDuplicateRowColumnButton } from '../table-duplicate-row-column-button'
import { TableHeaderRowColumnButton } from '../table-header-row-column-button'
import { TableMoveRowColumnButton } from '../table-move-row-column-button'
import { TableSortRowColumnButton } from '../table-sort-row-column-button'
import { useActiveTable, useGeometryTick } from '../use-table-ui'

const DRAG_THRESHOLD = 4
const GRIP = 14

const uiProps = { [TABLE_UI_ATTR]: '' }

interface GripProps {
  editor: Editor
  ctx: TableContext
  orientation: Orientation
  index: number
  box: Box
  tableBox: Box
}

/** The pill on a table edge: click selects the line and opens its menu, drag reorders it. */
function Grip({ editor, ctx, orientation, index, box, tableBox }: GripProps) {
  const [open, setOpen] = useState(false)
  const [drag, setDrag] = useState<{ target: number; box: Box | null } | null>(null)
  const press = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const isRow = orientation === 'row'

  const dropBox = useCallback(
    (target: number) => (isRow ? getRowBox(editor, ctx, target) : getColumnBox(editor, ctx, target)),
    [editor, ctx, isRow],
  )

  const style: React.CSSProperties = isRow
    ? {
        left: tableBox.left - GRIP / 2,
        top: box.top + box.height / 2 - Math.min(box.height, 28) / 2,
        width: GRIP,
        height: Math.min(box.height, 28),
      }
    : {
        left: box.left + box.width / 2 - Math.min(box.width, 28) / 2,
        top: tableBox.top - GRIP / 2,
        width: Math.min(box.width, 28),
        height: GRIP,
      }

  const Icon = isRow ? GripVerticalIcon : GripHorizontalIcon
  const noun = isRow ? 'row' : 'column'

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            {...uiProps}
            aria-label={`${noun} ${index + 1} handle`}
            title={`Click for ${noun} options, drag to move`}
            className="tiptap-table-grip"
            data-orientation={orientation}
            data-active={open || !!drag}
            style={style}
            onPointerDown={(event) => {
              // Radix would toggle the menu on pointer down; we decide on pointer up instead.
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
              press.current = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }
            }}
            onPointerMove={(event) => {
              const p = press.current
              if (!p) return
              if (!p.moved && Math.hypot(event.clientX - p.x, event.clientY - p.y) > DRAG_THRESHOLD) {
                p.moved = true
                setOpen(false)
              }
              if (p.moved) {
                const target = lineIndexFromPoint(editor, ctx, orientation, event.clientX, event.clientY)
                setDrag({ target, box: dropBox(target) })
              }
            }}
            onPointerUp={(event) => {
              const p = press.current
              press.current = null
              event.currentTarget.releasePointerCapture?.(event.pointerId)
              if (!p) return
              if (p.moved) {
                const target = lineIndexFromPoint(editor, ctx, orientation, event.clientX, event.clientY)
                setDrag(null)
                if (target !== index) moveLine(editor, { tablePos: ctx.pos, orientation, from: index, to: target })
                else selectLine(editor, ctx.pos, orientation, index)
              } else {
                selectLine(editor, ctx.pos, orientation, index)
                setOpen((o) => !o)
              }
            }}
            onPointerCancel={() => {
              press.current = null
              setDrag(null)
            }}
          >
            <Icon className="tiptap-table-grip-icon" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent {...uiProps} className="tiptap-table-handle-menu" align="start" onMouseDown={(e) => e.preventDefault()}>
          <LineMenu editor={editor} ctx={ctx} orientation={orientation} index={index} close={() => setOpen(false)} />
        </DropdownMenuContent>
      </DropdownMenu>

      {drag?.box &&
        createPortal(
          <div
            className="tiptap-table-drop-indicator"
            data-orientation={orientation}
            style={{ left: drag.box.left, top: drag.box.top, width: drag.box.width, height: drag.box.height }}
          />,
          document.body,
        )}
    </>
  )
}

function LineMenu({
  editor,
  ctx,
  orientation,
  index,
  close,
}: {
  editor: Editor
  ctx: TableContext
  orientation: Orientation
  index: number
  close: () => void
}) {
  const isRow = orientation === 'row'
  const target = { editor, tablePos: ctx.pos, index, orientation }
  const item = (node: React.ReactNode) => <DropdownMenuItem asChild>{node}</DropdownMenuItem>

  return (
    <>
      {item(<TableAddRowColumnButton {...target} direction="before" text={isRow ? 'Insert above' : 'Insert left'} />)}
      {item(<TableAddRowColumnButton {...target} direction="after" text={isRow ? 'Insert below' : 'Insert right'} />)}
      <DropdownMenuSeparator />
      {item(<TableMoveRowColumnButton {...target} direction={isRow ? 'up' : 'left'} text={isRow ? 'Move up' : 'Move left'} />)}
      {item(<TableMoveRowColumnButton {...target} direction={isRow ? 'down' : 'right'} text={isRow ? 'Move down' : 'Move right'} />)}
      {item(<TableDuplicateRowColumnButton {...target} text="Duplicate" />)}
      <DropdownMenuSeparator />
      {item(<TableSortRowColumnButton {...target} direction="asc" text="Sort A → Z" />)}
      {item(<TableSortRowColumnButton {...target} direction="desc" text="Sort Z → A" />)}
      {index === 0 && item(<TableHeaderRowColumnButton {...target} hideWhenUnavailable text={isRow ? 'Header row' : 'Header column'} />)}
      {item(<TableClearRowColumnContentButton {...target} text="Clear contents" />)}
      <DropdownMenuSeparator />
      <TableAlignMenu editor={editor} />
      <DropdownMenuSeparator />
      {item(<TableDeleteRowColumnButton {...target} text={isRow ? 'Delete row' : 'Delete column'} onDeleted={close} />)}
      <DropdownMenuItem
        asChild
        onSelect={() => {
          editor.chain().focus().deleteTable().run()
          close()
        }}
      >
        <button type="button" className="tiptap-button" data-style="ghost">
          <Trash2Icon className="tiptap-button-icon" />
          <span className="tiptap-button-text">Delete table</span>
        </button>
      </DropdownMenuItem>
    </>
  )
}

export interface TableHandleProps {
  editor?: Editor | null
}

/**
 * Row and column handles on the edges of the hovered table. Place it outside `EditorContent`.
 * Needs `TableHandleExtension` on the editor.
 */
export function TableHandle({ editor: providedEditor }: TableHandleProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const active = useActiveTable(editor)
  useGeometryTick(editor)

  if (!editor || !active) return null
  const { ctx, row, col } = active
  const tableBox = getTableBox(editor, ctx)
  if (!tableBox) return null

  const rowBox = row !== null ? getRowBox(editor, ctx, row) : null
  const colBox = col !== null ? getColumnBox(editor, ctx, col) : null
  // Hide handles for tables scrolled out of view
  if (tableBox.top > window.innerHeight || tableBox.top + tableBox.height < 0) return null

  return createPortal(
    <div
      {...uiProps}
      className="tiptap-table-handles"
      onMouseLeave={(e) => {
        if (!editor.view.dom.contains(e.relatedTarget as Node | null)) clearTableHover(editor)
      }}
    >
      {rowBox && row !== null && (
        <Grip key={`r${row}`} editor={editor} ctx={ctx} orientation="row" index={row} box={rowBox} tableBox={tableBox} />
      )}
      {colBox && col !== null && (
        <Grip key={`c${col}`} editor={editor} ctx={ctx} orientation="column" index={col} box={colBox} tableBox={tableBox} />
      )}
    </div>,
    document.body,
  )
}
