import type { Editor } from '@tiptap/react'
import { ArrowDownAZIcon, ArrowUpZAIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { type Orientation, type SortDirection, canSortLine, sortLine } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'
import { resolveTarget } from '../use-table-ui'

export interface UseTableSortRowColumnConfig {
  editor?: Editor | null
  index?: number
  orientation?: Orientation
  direction: SortDirection
  tablePos?: number
  hideWhenUnavailable?: boolean
  onSorted?: () => void
}

/**
 * Sorting by a column reorders the rows; sorting by a row reorders the columns. Header lines stay put
 * and empty cells always sort last.
 */
export function useTableSortRowColumn(config: UseTableSortRowColumnConfig) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, direction, onSorted } = config
  const { ctx, orientation, index, tablePos } = resolveTarget(editor, config)

  const canSortRowColumn = index !== null && canSortLine(editor, ctx, orientation, index)
  const isVisible = !!editor && (!hideWhenUnavailable || canSortRowColumn)

  const handleSort = useCallback(() => {
    if (!canSortRowColumn || index === null) return false
    const ok = sortLine(editor, { tablePos, index, orientation, direction })
    if (ok) onSorted?.()
    return ok
  }, [canSortRowColumn, editor, tablePos, index, orientation, direction, onSorted])

  return {
    isVisible,
    canSortRowColumn,
    handleSort,
    label: direction === 'asc' ? 'Sort A → Z' : 'Sort Z → A',
    Icon: direction === 'asc' ? ArrowDownAZIcon : ArrowUpZAIcon,
  }
}

export interface TableSortRowColumnButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableSortRowColumnConfig {}

export const TableSortRowColumnButton = forwardRef<HTMLButtonElement, TableSortRowColumnButtonProps>(
  ({ editor, index, orientation, direction, tablePos, hideWhenUnavailable, onSorted, ...rest }, ref) => {
    const { isVisible, canSortRowColumn, handleSort, label, Icon } = useTableSortRowColumn({
      editor,
      index,
      orientation,
      direction,
      tablePos,
      hideWhenUnavailable,
      onSorted,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canSortRowColumn}
        onAction={handleSort}
        {...rest}
      />
    )
  },
)
TableSortRowColumnButton.displayName = 'TableSortRowColumnButton'
