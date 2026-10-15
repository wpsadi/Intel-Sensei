import type { Editor } from '@tiptap/react'

import { ButtonGroup } from '@/components/tiptap-ui-primitive/button-group'
import type { Orientation } from '@/lib/tiptap-table-utils'
import { selectLine } from '@/lib/tiptap-table-utils'

import { TableAlignCellButton } from '../table-align-cell-button'
import { resolveTarget } from '../use-table-ui'

export interface TableAlignMenuProps {
  editor?: Editor | null
  /** With `orientation` + `index` the whole row / column is selected first; otherwise the current cell selection is aligned. */
  index?: number
  orientation?: Orientation
  tablePos?: number
}

/**
 * Text alignment (left / center / right) and vertical alignment (top / middle / bottom) for the
 * selected cells. Buttons stay open so several settings can be applied in a row.
 */
export function TableAlignMenu({ editor, index, orientation, tablePos }: TableAlignMenuProps) {
  // Aligning a line means selecting it so the commands see its cells.
  const selectFirst = () => {
    if (index === undefined || !orientation) return
    const target = resolveTarget(editor ?? null, { index, orientation, tablePos })
    if (editor && target.ctx) selectLine(editor, target.tablePos, orientation, index)
  }

  return (
    <div className="tiptap-table-align-menu" onMouseDownCapture={selectFirst}>
      <ButtonGroup orientation="horizontal">
        <TableAlignCellButton editor={editor} type="textAlign" alignment="left" />
        <TableAlignCellButton editor={editor} type="textAlign" alignment="center" />
        <TableAlignCellButton editor={editor} type="textAlign" alignment="right" />
      </ButtonGroup>
      <ButtonGroup orientation="horizontal">
        <TableAlignCellButton editor={editor} type="verticalAlign" alignment="top" />
        <TableAlignCellButton editor={editor} type="verticalAlign" alignment="middle" />
        <TableAlignCellButton editor={editor} type="verticalAlign" alignment="bottom" />
      </ButtonGroup>
    </div>
  )
}
