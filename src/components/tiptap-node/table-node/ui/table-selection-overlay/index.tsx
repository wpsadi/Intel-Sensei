import { CellSelection } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/react'
import { type ComponentType, type ReactNode, useCallback } from 'react'
import { createPortal } from 'react-dom'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { TABLE_UI_ATTR, cellPosAt, cellPosFromPoint, getCellRangeBox, getTableContext, selectCellRange } from '@/lib/tiptap-table-utils'

import { useGeometryTick } from '../use-table-ui'

export type ResizeCorner = 'tl' | 'br'

export interface TableCellMenuProps {
  editor: Editor
  /** `onMouseDown={(e) => props.onResizeStart?.("br")(e)}` makes a control drag the selection's corner. */
  onResizeStart?: (corner: ResizeCorner) => (event: React.MouseEvent<HTMLElement>) => void
}

export interface TableSelectionOverlayProps {
  editor?: Editor | null
  /** Corner handles that drag-extend the selected range. */
  showResizeHandles?: boolean
  /**
   * Rendered on the bottom-right corner. Pass a component with a stable identity (module scope or
   * `useMemo`); an inline arrow remounts the menu on every render.
   */
  cellMenu?: ComponentType<TableCellMenuProps>
}

/** The cell range under selection (or the single cell holding the cursor), in table coordinates. */
function selectedRange(editor: Editor) {
  const ctx = getTableContext(editor)
  if (!ctx) return null
  const { selection } = editor.state
  try {
    if (selection instanceof CellSelection) {
      const rect = ctx.map.rectBetween(selection.$anchorCell.pos - ctx.start, selection.$headCell.pos - ctx.start)
      return { ctx, ...rect }
    }
    const $cell = editor.state.doc.resolve(selection.from)
    for (let depth = $cell.depth; depth > 0; depth--) {
      const role = $cell.node(depth).type.spec.tableRole
      if (role === 'cell' || role === 'header_cell') {
        return { ctx, ...ctx.map.findCell($cell.before(depth) - ctx.start) }
      }
    }
  } catch {
    /* positions can lag a transaction behind */
  }
  return null
}

/**
 * Outlines the selected cells and offers corner handles: drag to grow or shrink the selection, and
 * the bottom-right handle can host a cell menu. Place it outside `EditorContent`.
 */
export function TableSelectionOverlay({
  editor: providedEditor,
  showResizeHandles = true,
  cellMenu: CellMenu,
}: TableSelectionOverlayProps) {
  const { editor } = useTiptapEditor(providedEditor)
  useGeometryTick(editor)

  const onResizeStart = useCallback(
    (corner: ResizeCorner) => (event: React.MouseEvent<HTMLElement>) => {
      if (!editor) return
      const range = selectedRange(editor)
      if (!range) return
      event.preventDefault()
      const { ctx, top, left, bottom, right } = range
      // The corner opposite the dragged one stays anchored.
      const anchor = corner === 'br' ? cellPosAt(ctx, top, left) : cellPosAt(ctx, bottom - 1, right - 1)

      const move = (ev: MouseEvent) => {
        const pos = cellPosFromPoint(editor, ev.clientX, ev.clientY)
        if (pos !== null) selectCellRange(editor, anchor, pos)
      }
      const up = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [editor],
  )

  if (!editor || editor.isDestroyed || !editor.isEditable) return null
  const range = selectedRange(editor)
  if (!range) return null
  const { ctx, top, left, bottom, right } = range
  const box = getCellRangeBox(editor, ctx, top, left, bottom - 1, right - 1)
  if (!box || box.top > window.innerHeight || box.top + box.height < 0) return null

  const menu: ReactNode = CellMenu ? <CellMenu editor={editor} onResizeStart={onResizeStart} /> : null

  return createPortal(
    <div
      className="tiptap-table-selection-overlay"
      data-multi={bottom - top > 1 || right - left > 1}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      {showResizeHandles && (
        <>
          <span {...{ [TABLE_UI_ATTR]: '' }} className="tiptap-table-resize-handle" data-corner="tl" onMouseDown={onResizeStart('tl')} />
          {!CellMenu && (
            <span {...{ [TABLE_UI_ATTR]: '' }} className="tiptap-table-resize-handle" data-corner="br" onMouseDown={onResizeStart('br')} />
          )}
        </>
      )}
      {menu && <div className="tiptap-table-overlay-menu">{menu}</div>}
    </div>,
    document.body,
  )
}
