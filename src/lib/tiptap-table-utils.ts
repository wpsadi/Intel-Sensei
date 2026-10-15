import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { CellSelection, TableMap, type TableRect, addColumn, addRow, cellAround, moveTableColumn, moveTableRow } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/react'

export type Orientation = 'row' | 'column'
export type SortDirection = 'asc' | 'desc'

export const TABLE_UI_ATTR = 'data-table-ui'

export interface TableContext {
  node: PMNode
  /** Position of the table node itself. */
  pos: number
  /** Position of the first row (pos + 1). */
  start: number
  map: TableMap
}

const isTable = (node: PMNode) => node.type.spec.tableRole === 'table'
const isCell = (node: PMNode) => node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell'

/**
 * Resolves the table the selection sits in (or the table at `tablePos`).
 */
export function getTableContext(editor: Editor | null, tablePos?: number): TableContext | null {
  if (!editor || editor.isDestroyed) return null
  const { doc, selection } = editor.state

  if (tablePos !== undefined) {
    const node = tablePos >= 0 && tablePos < doc.content.size ? doc.nodeAt(tablePos) : null
    if (!node || !isTable(node)) return null
    return { node, pos: tablePos, start: tablePos + 1, map: TableMap.get(node) }
  }

  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (isTable(node)) {
      return {
        node,
        pos: $from.before(depth),
        start: $from.start(depth),
        map: TableMap.get(node),
      }
    }
  }
  // CellSelection anchors sit directly under a row
  if (selection instanceof CellSelection) {
    const cell = selection.$anchorCell
    for (let depth = cell.depth; depth > 0; depth--) {
      const node = cell.node(depth)
      if (isTable(node)) {
        return {
          node,
          pos: cell.before(depth),
          start: cell.start(depth),
          map: TableMap.get(node),
        }
      }
    }
  }
  return null
}

export function lineCount(ctx: TableContext, orientation: Orientation) {
  return orientation === 'row' ? ctx.map.height : ctx.map.width
}

/**
 * The row / column the selection currently covers (first one for ranges).
 */
export function getSelectionLine(editor: Editor | null, ctx: TableContext | null, orientation: Orientation): number | null {
  if (!editor || !ctx) return null
  const { selection } = editor.state
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$anchor)
  if (!$cell) return null
  try {
    const rect = ctx.map.findCell($cell.pos - ctx.start)
    return orientation === 'row' ? rect.top : rect.left
  } catch {
    return null
  }
}

/** Offset (relative to the table start) of the cell at (row, col). */
const cellOffsetAt = (ctx: TableContext, row: number, col: number) => ctx.map.map[row * ctx.map.width + col]

/** Absolute document position of the cell at (row, col). */
export function cellPosAt(ctx: TableContext, row: number, col: number) {
  return ctx.start + cellOffsetAt(ctx, row, col)
}

function rectOf(ctx: TableContext): TableRect {
  return {
    map: ctx.map,
    tableStart: ctx.start,
    table: ctx.node,
    left: 0,
    top: 0,
    right: ctx.map.width,
    bottom: ctx.map.height,
  }
}

/** Unique cell offsets covering a row / column, top-left to bottom-right. */
function lineCells(ctx: TableContext, orientation: Orientation, index: number) {
  const seen = new Set<number>()
  const out: number[] = []
  const total = orientation === 'row' ? ctx.map.width : ctx.map.height
  for (let i = 0; i < total; i++) {
    const offset = orientation === 'row' ? cellOffsetAt(ctx, index, i) : cellOffsetAt(ctx, i, index)
    if (!seen.has(offset)) {
      seen.add(offset)
      out.push(offset)
    }
  }
  return out
}

/** True when no cell in the table spans more than one row or column. */
export function isSimpleTable(ctx: TableContext) {
  return new Set(ctx.map.map).size === ctx.map.width * ctx.map.height
}

/** True when a row / column holds no merged cell and no cell reaching in from a neighbour. */
function isSimpleLine(ctx: TableContext, orientation: Orientation, index: number) {
  const total = orientation === 'row' ? ctx.map.width : ctx.map.height
  for (let i = 0; i < total; i++) {
    const offset = orientation === 'row' ? cellOffsetAt(ctx, index, i) : cellOffsetAt(ctx, i, index)
    const rect = ctx.map.findCell(offset)
    if (rect.right - rect.left > 1 || rect.bottom - rect.top > 1) return false
  }
  return true
}

export function inRange(ctx: TableContext, orientation: Orientation, index: number) {
  return index >= 0 && index < lineCount(ctx, orientation)
}

// --- selection ---------------------------------------------------------------

export function selectLine(editor: Editor | null, tablePos: number | undefined, orientation: Orientation, index: number): boolean {
  const ctx = getTableContext(editor, tablePos)
  if (!editor || !ctx || !inRange(ctx, orientation, index)) return false
  const row = orientation === 'row' ? index : 0
  const col = orientation === 'row' ? 0 : index
  const $cell = editor.state.doc.resolve(cellPosAt(ctx, row, col))
  const selection = orientation === 'row' ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell)
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  return true
}

export function selectCellRange(editor: Editor, anchorPos: number, headPos: number): boolean {
  const { doc } = editor.state
  const selection = CellSelection.create(doc, anchorPos, headPos)
  if (editor.state.selection.eq(selection)) return false
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  return true
}

// --- add / delete / move / duplicate ----------------------------------------

export function addLine(
  editor: Editor | null,
  opts: {
    tablePos?: number
    index: number
    orientation: Orientation
    direction: 'before' | 'after'
  },
): boolean {
  const ctx = getTableContext(editor, opts.tablePos)
  if (!editor || !ctx || !editor.isEditable) return false
  const { orientation, direction, index } = opts
  if (!inRange(ctx, orientation, index)) return false
  const at = direction === 'before' ? index : index + 1
  const tr = editor.state.tr
  if (orientation === 'row') addRow(tr, rectOf(ctx), at)
  else addColumn(tr, rectOf(ctx), at)
  editor.view.dispatch(tr)
  return true
}

export function canDeleteLine(editor: Editor | null, ctx: TableContext | null, orientation: Orientation, index: number) {
  return !!editor?.isEditable && !!ctx && inRange(ctx, orientation, index) && lineCount(ctx, orientation) > 1
}

export function deleteLine(editor: Editor | null, opts: { tablePos?: number; index: number; orientation: Orientation }): boolean {
  const ctx = getTableContext(editor, opts.tablePos)
  if (!editor || !canDeleteLine(editor, ctx, opts.orientation, opts.index)) return false
  if (!selectLine(editor, ctx!.pos, opts.orientation, opts.index)) return false
  return opts.orientation === 'row' ? editor.commands.deleteRow() : editor.commands.deleteColumn()
}

export function canMoveLine(editor: Editor | null, ctx: TableContext | null, orientation: Orientation, from: number, to: number) {
  if (!editor?.isEditable || !ctx) return false
  if (from === to || !inRange(ctx, orientation, from) || !inRange(ctx, orientation, to)) return false
  // prosemirror-tables refuses to move lines that cross merged cells
  return isSimpleLine(ctx, orientation, from) && isSimpleLine(ctx, orientation, to)
}

export function moveLine(editor: Editor | null, opts: { tablePos?: number; orientation: Orientation; from: number; to: number }): boolean {
  const ctx = getTableContext(editor, opts.tablePos)
  if (!editor || !canMoveLine(editor, ctx, opts.orientation, opts.from, opts.to)) return false
  const { from, to, orientation } = opts
  const options = { from, to, select: true, pos: ctx!.start }
  const command = orientation === 'row' ? moveTableRow(options) : moveTableColumn(options)
  return editor.commands.command(({ state, dispatch }) => command(state, dispatch))
}

export function canDuplicateLine(editor: Editor | null, ctx: TableContext | null, orientation: Orientation, index: number) {
  return !!editor?.isEditable && !!ctx && inRange(ctx, orientation, index) && isSimpleLine(ctx, orientation, index)
}

export function duplicateLine(editor: Editor | null, opts: { tablePos?: number; index: number; orientation: Orientation }): boolean {
  const ctx = getTableContext(editor, opts.tablePos)
  const { orientation, index } = opts
  if (!editor || !canDuplicateLine(editor, ctx, orientation, index)) return false
  const { start, node } = ctx!
  const tr = editor.state.tr

  if (orientation === 'row') {
    let rowPos = start
    for (let r = 0; r < index; r++) rowPos += node.child(r).nodeSize
    const row = node.child(index)
    tr.insert(rowPos + row.nodeSize, row)
  } else {
    // Insert from the bottom up so earlier offsets stay valid.
    const offsets = lineCells(ctx!, 'column', index).sort((a, b) => b - a)
    for (const offset of offsets) {
      const cell = node.nodeAt(offset)!
      tr.insert(start + offset + cell.nodeSize, cell)
    }
  }
  editor.view.dispatch(tr)
  return true
}

// --- sort ---------------------------------------------------------------------

const textAt = (ctx: TableContext, row: number, col: number) => ctx.node.nodeAt(cellOffsetAt(ctx, row, col))?.textContent.trim() ?? ''

const isHeaderAt = (ctx: TableContext, row: number, col: number) =>
  ctx.node.nodeAt(cellOffsetAt(ctx, row, col))?.type.spec.tableRole === 'header_cell'

const compareText = (a: string, b: string, dir: SortDirection) => {
  // Empty cells always sink to the end
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const result = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return dir === 'asc' ? result : -result
}

export function canSortLine(editor: Editor | null, ctx: TableContext | null, orientation: Orientation, index: number) {
  return !!editor?.isEditable && !!ctx && inRange(ctx, orientation, index) && isSimpleTable(ctx)
}

/**
 * Sorts the table by the values of one column (reordering rows) or one row (reordering
 * columns). Header lines stay where they are.
 */
export function sortLine(
  editor: Editor | null,
  opts: {
    tablePos?: number
    index: number
    orientation: Orientation
    direction: SortDirection
  },
): boolean {
  const ctx = getTableContext(editor, opts.tablePos)
  const { orientation, index, direction } = opts
  if (!editor || !canSortLine(editor, ctx, orientation, index)) return false
  const { map, node, start } = ctx!
  const tr = editor.state.tr

  if (orientation === 'column') {
    // Sort rows by the values in this column.
    const headerRows = isHeaderLine(ctx!, 'row', 0) ? 1 : 0
    const order = Array.from({ length: map.height - headerRows }, (_, i) => i + headerRows)
    order.sort((a, b) => compareText(textAt(ctx!, a, index), textAt(ctx!, b, index), direction))
    const rows = [...Array(headerRows).keys(), ...order].map((r) => node.child(r))
    tr.replaceWith(start, start + node.content.size, rows)
  } else {
    // Sort columns by the values in this row.
    const headerCols = isHeaderLine(ctx!, 'column', 0) ? 1 : 0
    const order = Array.from({ length: map.width - headerCols }, (_, i) => i + headerCols)
    order.sort((a, b) => compareText(textAt(ctx!, index, a), textAt(ctx!, index, b), direction))
    const cols = [...Array(headerCols).keys(), ...order]
    const rows: PMNode[] = []
    node.forEach((row) => {
      const cells: PMNode[] = []
      row.forEach((cell) => cells.push(cell))
      rows.push(row.copy(Fragment.from(cols.map((i) => cells[i]))))
    })
    tr.replaceWith(start, start + node.content.size, rows)
  }
  editor.view.dispatch(tr)
  return true
}

function isHeaderLine(ctx: TableContext, orientation: Orientation, index: number) {
  const total = orientation === 'row' ? ctx.map.width : ctx.map.height
  for (let i = 0; i < total; i++) {
    const header = orientation === 'row' ? isHeaderAt(ctx, index, i) : isHeaderAt(ctx, i, index)
    if (!header) return false
  }
  return total > 0
}

// --- clear / header / merge / fit --------------------------------------------

const CELL_ATTR_DEFAULTS: Record<string, unknown> = {
  backgroundColor: null,
  textAlign: null,
  verticalAlign: null,
}

export function clearCells(editor: Editor | null, offsets: number[], resetAttrs: boolean) {
  if (!editor || !editor.isEditable || offsets.length === 0) return false
  const tr = editor.state.tr
  // Positions only shrink as we replace content, so walk back to front.
  for (const pos of [...offsets].sort((a, b) => b - a)) {
    const cell = tr.doc.nodeAt(pos)
    if (!cell || !isCell(cell)) continue
    const empty = cell.type.schema.nodes.paragraph.create()
    if (resetAttrs) {
      const attrs = { ...cell.attrs }
      for (const key of Object.keys(CELL_ATTR_DEFAULTS)) {
        if (key in attrs) attrs[key] = CELL_ATTR_DEFAULTS[key]
      }
      tr.setNodeMarkup(pos, undefined, attrs)
    }
    tr.replaceWith(pos + 1, pos + 1 + cell.content.size, empty)
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(offsets[0] + 2, tr.doc.content.size))))
  editor.view.dispatch(tr)
  return true
}

export function clearLine(
  editor: Editor | null,
  opts: { tablePos?: number; index: number; orientation: Orientation; resetAttrs?: boolean },
) {
  const ctx = getTableContext(editor, opts.tablePos)
  if (!editor || !ctx || !inRange(ctx, opts.orientation, opts.index)) return false
  const offsets = lineCells(ctx, opts.orientation, opts.index).map((o) => ctx.start + o)
  return clearCells(editor, offsets, !!opts.resetAttrs)
}

export function selectedCellPositions(editor: Editor | null): number[] {
  if (!editor) return []
  const { selection } = editor.state
  if (selection instanceof CellSelection) {
    const out: number[] = []
    selection.forEachCell((_node, pos) => out.push(pos))
    return out
  }
  const $cell = cellAround(selection.$anchor)
  return $cell ? [$cell.pos] : []
}

/** Sets every column to an equal share of the editor width. */
export function fitTableToWidth(editor: Editor | null, tablePos?: number): boolean {
  const ctx = getTableContext(editor, tablePos)
  if (!editor || !ctx || !editor.isEditable) return false
  const dom = editor.view.nodeDOM(ctx.pos) as HTMLElement | null
  const container = dom?.closest<HTMLElement>('.tableWrapper') ?? dom?.parentElement
  const available = container?.clientWidth ?? editor.view.dom.clientWidth
  if (!available) return false
  const width = Math.max(40, Math.floor(available / ctx.map.width))
  const tr = editor.state.tr
  ctx.node.descendants((cell, offset) => {
    if (!isCell(cell)) return true
    const span = (cell.attrs.colspan as number) ?? 1
    tr.setNodeMarkup(ctx.start + offset, undefined, {
      ...cell.attrs,
      colwidth: Array(span).fill(width),
    })
    return false
  })
  editor.view.dispatch(tr)
  return true
}

// --- DOM geometry ------------------------------------------------------------

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height })

export function getTableElement(editor: Editor, ctx: TableContext): HTMLTableElement | null {
  const dom = editor.view.nodeDOM(ctx.pos)
  if (!(dom instanceof HTMLElement)) return null
  return dom instanceof HTMLTableElement ? dom : dom.querySelector('table')
}

function cellElement(editor: Editor, ctx: TableContext, row: number, col: number) {
  const dom = editor.view.nodeDOM(cellPosAt(ctx, row, col))
  return dom instanceof HTMLElement ? dom : null
}

export function getTableBox(editor: Editor, ctx: TableContext): Box | null {
  const table = getTableElement(editor, ctx)
  if (!table) return null
  const wrapper = table.closest<HTMLElement>('.tableWrapper')
  const t = table.getBoundingClientRect()
  const w = wrapper?.getBoundingClientRect()
  // The wrapper scrolls; never report more than what is visible.
  return toBox(new DOMRect(t.left, t.top, w ? Math.min(t.width, w.width) : t.width, t.height))
}

export function getRowBox(editor: Editor, ctx: TableContext, row: number): Box | null {
  const table = getTableElement(editor, ctx)
  const tr = table?.rows[row]
  if (!tr) return null
  const t = getTableBox(editor, ctx)
  const r = tr.getBoundingClientRect()
  return t ? { left: t.left, top: r.top, width: t.width, height: r.height } : toBox(r)
}

export function getColumnBox(editor: Editor, ctx: TableContext, col: number): Box | null {
  const cell = cellElement(editor, ctx, 0, col)
  if (!cell) return null
  const rect = ctx.map.findCell(cellOffsetAt(ctx, 0, col))
  const span = rect.right - rect.left
  const r = cell.getBoundingClientRect()
  const t = getTableBox(editor, ctx)
  const width = r.width / span
  return {
    left: r.left + (col - rect.left) * width,
    top: t?.top ?? r.top,
    width,
    height: t?.height ?? r.height,
  }
}

/** Bounding box of the cells from (r1,c1) to (r2,c2) inclusive. */
export function getCellRangeBox(editor: Editor, ctx: TableContext, r1: number, c1: number, r2: number, c2: number): Box | null {
  const a = cellElement(editor, ctx, r1, c1)?.getBoundingClientRect()
  const b = cellElement(editor, ctx, r2, c2)?.getBoundingClientRect()
  if (!a || !b) return null
  const left = Math.min(a.left, b.left)
  const top = Math.min(a.top, b.top)
  return {
    left,
    top,
    width: Math.max(a.right, b.right) - left,
    height: Math.max(a.bottom, b.bottom) - top,
  }
}

/** The cell (as an absolute position) under a viewport point, or null. */
export function cellPosFromPoint(editor: Editor, x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest('td,th')
  if (!cell || !editor.view.dom.contains(cell)) return null
  try {
    const $cell = cellAround(editor.state.doc.resolve(editor.view.posAtDOM(cell, 0)))
    return $cell ? $cell.pos : null
  } catch {
    return null
  }
}

/** Which row / column index a viewport point falls on within a table. */
export function lineIndexFromPoint(editor: Editor, ctx: TableContext, orientation: Orientation, x: number, y: number): number {
  const total = lineCount(ctx, orientation)
  for (let i = 0; i < total; i++) {
    const box = orientation === 'row' ? getRowBox(editor, ctx, i) : getColumnBox(editor, ctx, i)
    if (!box) continue
    const mid = orientation === 'row' ? box.top + box.height : box.left + box.width
    if ((orientation === 'row' ? y : x) < mid) return i
  }
  return total - 1
}
