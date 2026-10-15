import type { Editor } from '@tiptap/react'
import { TableCellsMergeIcon, TableCellsSplitIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'

export type MergeSplitAction = 'merge' | 'split'

export interface UseTableMergeSplitCellConfig {
  editor?: Editor | null
  action: MergeSplitAction
  hideWhenUnavailable?: boolean
  onExecuted?: (action: MergeSplitAction) => void
}

export function useTableMergeSplitCell(config: UseTableMergeSplitCellConfig) {
  const { editor } = useTiptapEditor(config.editor)
  const { action, hideWhenUnavailable = false, onExecuted } = config

  const canMergeSplitCell = (() => {
    if (!editor?.isEditable) return false
    try {
      return action === 'merge' ? editor.can().mergeCells() : editor.can().splitCell()
    } catch {
      return false
    }
  })()
  const isVisible = !!editor && (!hideWhenUnavailable || canMergeSplitCell)

  const handleExecute = useCallback(() => {
    if (!editor || !canMergeSplitCell) return false
    const chain = editor.chain().focus()
    const ok = action === 'merge' ? chain.mergeCells().run() : chain.splitCell().run()
    if (ok) onExecuted?.(action)
    return ok
  }, [editor, canMergeSplitCell, action, onExecuted])

  return {
    isVisible,
    canMergeSplitCell,
    handleExecute,
    label: action === 'merge' ? 'Merge cells' : 'Split cell',
    Icon: action === 'merge' ? TableCellsMergeIcon : TableCellsSplitIcon,
  }
}

export interface TableMergeSplitCellButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableMergeSplitCellConfig {}

export const TableMergeSplitCellButton = forwardRef<HTMLButtonElement, TableMergeSplitCellButtonProps>(
  ({ editor, action, hideWhenUnavailable, onExecuted, ...rest }, ref) => {
    const { isVisible, canMergeSplitCell, handleExecute, label, Icon } = useTableMergeSplitCell({
      editor,
      action,
      hideWhenUnavailable,
      onExecuted,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canMergeSplitCell}
        onAction={handleExecute}
        {...rest}
      />
    )
  },
)
TableMergeSplitCellButton.displayName = 'TableMergeSplitCellButton'
