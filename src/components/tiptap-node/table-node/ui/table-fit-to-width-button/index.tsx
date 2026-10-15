import type { Editor } from '@tiptap/react'
import { MoveHorizontalIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { fitTableToWidth, getTableContext } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'

export interface UseTableFitToWidthConfig {
  editor?: Editor | null
  tablePos?: number
  hideWhenUnavailable?: boolean
  onWidthAdjusted?: () => void
}

export function useTableFitToWidth(config: UseTableFitToWidthConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, tablePos, onWidthAdjusted } = config

  const canFitToWidth = !!editor?.isEditable && !!getTableContext(editor, tablePos)
  const isVisible = !!editor && (!hideWhenUnavailable || canFitToWidth)

  const handleFitToWidth = useCallback(() => {
    if (!canFitToWidth) return false
    const ok = fitTableToWidth(editor, tablePos)
    if (ok) onWidthAdjusted?.()
    return ok
  }, [canFitToWidth, editor, tablePos, onWidthAdjusted])

  return { isVisible, canFitToWidth, handleFitToWidth, label: 'Fit to width', Icon: MoveHorizontalIcon }
}

export interface TableFitToWidthButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableFitToWidthConfig {}

export const TableFitToWidthButton = forwardRef<HTMLButtonElement, TableFitToWidthButtonProps>(
  ({ editor, tablePos, hideWhenUnavailable, onWidthAdjusted, ...rest }, ref) => {
    const { isVisible, canFitToWidth, handleFitToWidth, label, Icon } = useTableFitToWidth({
      editor,
      tablePos,
      hideWhenUnavailable,
      onWidthAdjusted,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canFitToWidth}
        onAction={handleFitToWidth}
        {...rest}
      />
    )
  },
)
TableFitToWidthButton.displayName = 'TableFitToWidthButton'
