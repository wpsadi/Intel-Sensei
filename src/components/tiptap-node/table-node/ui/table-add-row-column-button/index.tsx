import type { Editor } from '@tiptap/react'
import { ArrowDownToLineIcon, ArrowLeftToLineIcon, ArrowRightToLineIcon, ArrowUpToLineIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { type Orientation, addLine, inRange } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'
import { resolveTarget } from '../use-table-ui'

export interface UseTableAddRowColumnConfig {
  editor?: Editor | null
  index?: number
  orientation?: Orientation
  direction?: 'before' | 'after'
  tablePos?: number
  hideWhenUnavailable?: boolean
  onAdded?: () => void
}

export function useTableAddRowColumn(config: UseTableAddRowColumnConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, direction = 'after', onAdded } = config
  const { ctx, orientation, index, tablePos } = resolveTarget(editor, config)

  const canAddRowColumn = !!editor?.isEditable && !!ctx && index !== null && inRange(ctx, orientation, index)
  const isVisible = !!editor && (!hideWhenUnavailable || canAddRowColumn)

  const handleAdd = useCallback(() => {
    if (!canAddRowColumn || index === null) return false
    const ok = addLine(editor, { tablePos, index, orientation, direction })
    if (ok) onAdded?.()
    return ok
  }, [canAddRowColumn, editor, tablePos, index, orientation, direction, onAdded])

  const label =
    orientation === 'row'
      ? `Insert row ${direction === 'before' ? 'above' : 'below'}`
      : `Insert column ${direction === 'before' ? 'left' : 'right'}`
  const Icon =
    orientation === 'row'
      ? direction === 'before'
        ? ArrowUpToLineIcon
        : ArrowDownToLineIcon
      : direction === 'before'
        ? ArrowLeftToLineIcon
        : ArrowRightToLineIcon

  return { isVisible, canAddRowColumn, handleAdd, label, Icon }
}

export interface TableAddRowColumnButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableAddRowColumnConfig {}

export const TableAddRowColumnButton = forwardRef<HTMLButtonElement, TableAddRowColumnButtonProps>(
  ({ editor, index, orientation, direction, tablePos, hideWhenUnavailable, onAdded, ...rest }, ref) => {
    const { isVisible, canAddRowColumn, handleAdd, label, Icon } = useTableAddRowColumn({
      editor,
      index,
      orientation,
      direction,
      tablePos,
      hideWhenUnavailable,
      onAdded,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canAddRowColumn}
        onAction={handleAdd}
        {...rest}
      />
    )
  },
)
TableAddRowColumnButton.displayName = 'TableAddRowColumnButton'
