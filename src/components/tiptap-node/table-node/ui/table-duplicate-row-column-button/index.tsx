import type { Editor } from '@tiptap/react'
import { CopyPlusIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { type Orientation, canDuplicateLine, duplicateLine } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'
import { resolveTarget } from '../use-table-ui'

export interface UseTableDuplicateRowColumnConfig {
  editor?: Editor | null
  index?: number
  orientation?: Orientation
  tablePos?: number
  hideWhenUnavailable?: boolean
  onDuplicated?: () => void
}

export function useTableDuplicateRowColumn(config: UseTableDuplicateRowColumnConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, onDuplicated } = config
  const { ctx, orientation, index, tablePos } = resolveTarget(editor, config)

  const canDuplicateRowColumn = index !== null && canDuplicateLine(editor, ctx, orientation, index)
  const isVisible = !!editor && (!hideWhenUnavailable || canDuplicateRowColumn)

  const handleDuplicate = useCallback(() => {
    if (!canDuplicateRowColumn || index === null) return false
    const ok = duplicateLine(editor, { tablePos, index, orientation })
    if (ok) onDuplicated?.()
    return ok
  }, [canDuplicateRowColumn, editor, tablePos, index, orientation, onDuplicated])

  return {
    isVisible,
    canDuplicateRowColumn,
    handleDuplicate,
    label: orientation === 'row' ? 'Duplicate row' : 'Duplicate column',
    Icon: CopyPlusIcon,
  }
}

export interface TableDuplicateRowColumnButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableDuplicateRowColumnConfig {}

export const TableDuplicateRowColumnButton = forwardRef<HTMLButtonElement, TableDuplicateRowColumnButtonProps>(
  ({ editor, index, orientation, tablePos, hideWhenUnavailable, onDuplicated, ...rest }, ref) => {
    const { isVisible, canDuplicateRowColumn, handleDuplicate, label, Icon } = useTableDuplicateRowColumn({
      editor,
      index,
      orientation,
      tablePos,
      hideWhenUnavailable,
      onDuplicated,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canDuplicateRowColumn}
        onAction={handleDuplicate}
        {...rest}
      />
    )
  },
)
TableDuplicateRowColumnButton.displayName = 'TableDuplicateRowColumnButton'
