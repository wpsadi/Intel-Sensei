import type { Editor } from '@tiptap/react'
import { EraserIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { type Orientation, clearCells, clearLine, inRange, selectedCellPositions } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'
import { resolveTarget } from '../use-table-ui'

export interface UseTableClearRowColumnContentConfig {
  editor?: Editor | null
  /** Omit `index` and `orientation` to clear the selected cells instead of a whole line. */
  index?: number
  orientation?: Orientation
  tablePos?: number
  /** Also reset colors and alignment. */
  resetAttrs?: boolean
  hideWhenUnavailable?: boolean
  onCleared?: () => void
}

export function useTableClearRowColumnContent(config: UseTableClearRowColumnContentConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, resetAttrs = false, onCleared } = config
  const wholeLine = config.index !== undefined
  const { ctx, orientation, index, tablePos } = resolveTarget(editor, config)

  const canClearRowColumnContent =
    !!editor?.isEditable &&
    !!ctx &&
    (wholeLine ? index !== null && inRange(ctx, orientation, index) : selectedCellPositions(editor).length > 0)
  const isVisible = !!editor && (!hideWhenUnavailable || canClearRowColumnContent)

  const handleClear = useCallback(() => {
    if (!editor || !canClearRowColumnContent) return false
    const ok =
      wholeLine && index !== null
        ? clearLine(editor, { tablePos, index, orientation, resetAttrs })
        : clearCells(editor, selectedCellPositions(editor), resetAttrs)
    if (ok) onCleared?.()
    return ok
  }, [editor, canClearRowColumnContent, wholeLine, tablePos, index, orientation, resetAttrs, onCleared])

  const label = !wholeLine ? 'Clear contents' : orientation === 'row' ? 'Clear row contents' : 'Clear column contents'
  return { isVisible, canClearRowColumnContent, handleClear, label, Icon: EraserIcon }
}

export interface TableClearRowColumnContentButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableClearRowColumnContentConfig {}

export const TableClearRowColumnContentButton = forwardRef<HTMLButtonElement, TableClearRowColumnContentButtonProps>(
  ({ editor, index, orientation, tablePos, resetAttrs, hideWhenUnavailable, onCleared, ...rest }, ref) => {
    const { isVisible, canClearRowColumnContent, handleClear, label, Icon } = useTableClearRowColumnContent({
      editor,
      index,
      orientation,
      tablePos,
      resetAttrs,
      hideWhenUnavailable,
      onCleared,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canClearRowColumnContent}
        onAction={handleClear}
        {...rest}
      />
    )
  },
)
TableClearRowColumnContentButton.displayName = 'TableClearRowColumnContentButton'
