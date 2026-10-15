import type { Editor } from '@tiptap/react'
import { PlusIcon } from 'lucide-react'
import { createPortal } from 'react-dom'

import { clearTableHover } from '@/components/tiptap-node/table-node/extensions/table-handle'
import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { TABLE_UI_ATTR, addLine, getTableBox } from '@/lib/tiptap-table-utils'

import { useActiveTable, useGeometryTick } from '../use-table-ui'

const BAR = 18
const GAP = 4

export interface TableExtendRowColumnButtonsProps {
  editor?: Editor | null
}

/**
 * Thin "+" bars on the right and bottom edges of the active table that append a column or a row.
 * Place it outside `EditorContent`.
 */
export function TableExtendRowColumnButtons({ editor: providedEditor }: TableExtendRowColumnButtonsProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const active = useActiveTable(editor)
  useGeometryTick(editor)

  if (!editor || !active) return null
  const { ctx } = active
  const box = getTableBox(editor, ctx)
  if (!box || box.top > window.innerHeight || box.top + box.height < 0) return null

  const append = (orientation: 'row' | 'column') => () => {
    const index = (orientation === 'row' ? ctx.map.height : ctx.map.width) - 1
    addLine(editor, { tablePos: ctx.pos, index, orientation, direction: 'after' })
  }
  const leave = (e: React.MouseEvent) => {
    if (!editor.view.dom.contains(e.relatedTarget as Node | null)) clearTableHover(editor)
  }

  return createPortal(
    <>
      <button
        type="button"
        {...{ [TABLE_UI_ATTR]: '' }}
        className="tiptap-table-extend"
        data-orientation="column"
        aria-label="Add column"
        title="Add column"
        style={{ left: box.left + box.width + GAP, top: box.top, width: BAR, height: box.height }}
        onMouseDown={(e) => e.preventDefault()}
        onMouseLeave={leave}
        onClick={append('column')}
      >
        <PlusIcon className="tiptap-table-extend-icon" />
      </button>
      <button
        type="button"
        {...{ [TABLE_UI_ATTR]: '' }}
        className="tiptap-table-extend"
        data-orientation="row"
        aria-label="Add row"
        title="Add row"
        style={{ left: box.left, top: box.top + box.height + GAP, width: box.width, height: BAR }}
        onMouseDown={(e) => e.preventDefault()}
        onMouseLeave={leave}
        onClick={append('row')}
      >
        <PlusIcon className="tiptap-table-extend-icon" />
      </button>
    </>,
    document.body,
  )
}
