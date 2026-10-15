import type { Editor } from '@tiptap/react'
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignVerticalJustifyCenterIcon,
  AlignVerticalJustifyEndIcon,
  AlignVerticalJustifyStartIcon,
} from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { getSelectedNodesOfType } from '@/lib/tiptap-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'

export type AlignType = 'textAlign' | 'verticalAlign'

export interface UseTableAlignCellConfig {
  editor?: Editor | null
  /** "left" | "center" | "right" | "justify" for textAlign, "top" | "middle" | "bottom" for verticalAlign. */
  alignment: string
  type: AlignType
  hideWhenUnavailable?: boolean
  onAligned?: () => void
}

const CELL_TYPES = ['tableCell', 'tableHeader']

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
  justify: AlignJustifyIcon,
  top: AlignVerticalJustifyStartIcon,
  middle: AlignVerticalJustifyCenterIcon,
  bottom: AlignVerticalJustifyEndIcon,
}

const LABELS: Record<string, string> = {
  left: 'Align left',
  center: 'Align center',
  right: 'Align right',
  justify: 'Justify',
  top: 'Align top',
  middle: 'Align middle',
  bottom: 'Align bottom',
}

export function useTableAlignCell(config: UseTableAlignCellConfig) {
  const { editor } = useTiptapEditor(config.editor)
  const { alignment, type, hideWhenUnavailable = false, onAligned } = config

  const cells = editor ? getSelectedNodesOfType(editor.state.selection, CELL_TYPES) : []
  const canAlignCell = !!editor?.isEditable && cells.length > 0
  const isVisible = !!editor && (!hideWhenUnavailable || canAlignCell)
  // Cells with no explicit alignment fall back to left / top.
  const fallback = type === 'textAlign' ? 'left' : 'top'
  const isActive = canAlignCell && cells.every(({ node }) => (node.attrs[type] ?? fallback) === alignment)

  const handleAlign = useCallback(() => {
    if (!editor || !canAlignCell) return false
    const chain = editor.chain().focus()
    const ok =
      type === 'textAlign' ? chain.setNodeTextAlign(alignment as 'left').run() : chain.setNodeVerticalAlign(alignment as 'top').run()
    if (ok) onAligned?.()
    return ok
  }, [editor, canAlignCell, type, alignment, onAligned])

  return {
    isVisible,
    canAlignCell,
    isActive,
    handleAlign,
    label: LABELS[alignment] ?? `Align ${alignment}`,
    Icon: ICONS[alignment] ?? AlignLeftIcon,
  }
}

export interface TableAlignCellButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction' | 'active'>, UseTableAlignCellConfig {}

export const TableAlignCellButton = forwardRef<HTMLButtonElement, TableAlignCellButtonProps>(
  ({ editor, alignment, type, hideWhenUnavailable, onAligned, ...rest }, ref) => {
    const { isVisible, canAlignCell, isActive, handleAlign, label, Icon } = useTableAlignCell({
      editor,
      alignment,
      type,
      hideWhenUnavailable,
      onAligned,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canAlignCell}
        active={isActive}
        onAction={handleAlign}
        {...rest}
      />
    )
  },
)
TableAlignCellButton.displayName = 'TableAlignCellButton'
