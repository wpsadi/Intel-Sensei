import type { Editor } from '@tiptap/react'
import { Trash2Icon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { type Orientation, canDeleteLine, deleteLine } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'
import { resolveTarget } from '../use-table-ui'

export interface UseTableDeleteRowColumnConfig {
  editor?: Editor | null
  index?: number
  orientation?: Orientation
  tablePos?: number
  hideWhenUnavailable?: boolean
  onDeleted?: () => void
}

export function useTableDeleteRowColumn(config: UseTableDeleteRowColumnConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, onDeleted } = config
  const { ctx, orientation, index, tablePos } = resolveTarget(editor, config)

  const canDeleteRowColumn = index !== null && canDeleteLine(editor, ctx, orientation, index)
  const isVisible = !!editor && (!hideWhenUnavailable || canDeleteRowColumn)

  const handleDelete = useCallback(() => {
    if (!canDeleteRowColumn || index === null) return false
    const ok = deleteLine(editor, { tablePos, index, orientation })
    if (ok) onDeleted?.()
    return ok
  }, [canDeleteRowColumn, editor, tablePos, index, orientation, onDeleted])

  return {
    isVisible,
    canDeleteRowColumn,
    handleDelete,
    label: orientation === 'row' ? 'Delete row' : 'Delete column',
    Icon: Trash2Icon,
  }
}

export interface TableDeleteRowColumnButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableDeleteRowColumnConfig {}

export const TableDeleteRowColumnButton = forwardRef<HTMLButtonElement, TableDeleteRowColumnButtonProps>(
  ({ editor, index, orientation, tablePos, hideWhenUnavailable, onDeleted, ...rest }, ref) => {
    const { isVisible, canDeleteRowColumn, handleDelete, label, Icon } = useTableDeleteRowColumn({
      editor,
      index,
      orientation,
      tablePos,
      hideWhenUnavailable,
      onDeleted,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canDeleteRowColumn}
        onAction={handleDelete}
        {...rest}
      />
    )
  },
)
TableDeleteRowColumnButton.displayName = 'TableDeleteRowColumnButton'
