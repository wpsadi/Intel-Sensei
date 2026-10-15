import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'

import { useTableHover } from '@/components/tiptap-node/table-node/extensions/table-handle'
import { type Orientation, type TableContext, getSelectionLine, getTableContext } from '@/lib/tiptap-table-utils'

/** Re-renders on scroll, resize and document changes so fixed-position UI follows the table. */
export function useGeometryTick(editor: Editor | null) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    let frame = 0
    const bump = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTick((n) => n + 1))
    }
    editor.on('transaction', bump)
    window.addEventListener('scroll', bump, true)
    window.addEventListener('resize', bump)
    let observer: ResizeObserver | undefined
    try {
      observer = new ResizeObserver(bump)
      observer.observe(editor.view.dom)
    } catch {
      /* view not mounted yet */
    }
    return () => {
      cancelAnimationFrame(frame)
      editor.off('transaction', bump)
      window.removeEventListener('scroll', bump, true)
      window.removeEventListener('resize', bump)
      observer?.disconnect()
    }
  }, [editor])
}

export interface ActiveTable {
  ctx: TableContext
  /** The hovered cell's row / column, falling back to the selection's. */
  row: number | null
  col: number | null
  hovered: boolean
}

/** The table the pointer is over, or else the one the selection is in. */
export function useActiveTable(editor: Editor | null): ActiveTable | null {
  const hover = useTableHover(editor)
  if (!editor || editor.isDestroyed || !editor.isEditable) return null
  if (hover) {
    const ctx = getTableContext(editor, hover.tablePos)
    if (ctx) return { ctx, row: hover.row, col: hover.col, hovered: true }
  }
  const ctx = getTableContext(editor)
  if (!ctx) return null
  return {
    ctx,
    row: getSelectionLine(editor, ctx, 'row'),
    col: getSelectionLine(editor, ctx, 'column'),
    hovered: false,
  }
}

export interface TableTargetConfig {
  tablePos?: number
  index?: number
  orientation?: Orientation
}

/** Resolves which table / line an action applies to: explicit props, else the selection. */
export function resolveTarget(editor: Editor | null, config: TableTargetConfig) {
  const orientation = config.orientation ?? 'row'
  const ctx = getTableContext(editor, config.tablePos)
  const index = config.index ?? getSelectionLine(editor, ctx, orientation)
  return { ctx, orientation, index, tablePos: ctx?.pos }
}

/** Keeps the editor selection while a toolbar / menu control is pressed. */
export const keepSelection = (event: React.MouseEvent | React.PointerEvent) => event.preventDefault()
