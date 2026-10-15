import type { Editor } from '@tiptap/react'
import { PanelLeftIcon, PanelTopIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { type Orientation, cellPosAt, selectLine } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'
import { resolveTarget } from '../use-table-ui'

export interface UseTableHeaderRowColumnConfig {
  editor?: Editor | null
  /** Only the first row / column can be a header, so this should be 0 (the default). */
  index?: number
  orientation?: Orientation
  tablePos?: number
  hideWhenUnavailable?: boolean
  onToggled?: () => void
}

export function useTableHeaderRowColumn(config: UseTableHeaderRowColumnConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, onToggled } = config
  const { ctx, orientation, tablePos } = resolveTarget(editor, { ...config, index: config.index ?? 0 })
  const index = config.index ?? 0

  const canToggleHeader = !!editor?.isEditable && !!ctx && index === 0
  const isVisible = !!editor && (!hideWhenUnavailable || canToggleHeader)

  const isHeader = (() => {
    if (!ctx) return false
    const total = orientation === 'row' ? ctx.map.width : ctx.map.height
    for (let i = 0; i < total; i++) {
      const pos = orientation === 'row' ? cellPosAt(ctx, 0, i) : cellPosAt(ctx, i, 0)
      if (ctx.node.nodeAt(pos - ctx.start)?.type.name !== 'tableHeader') return false
    }
    return total > 0
  })()

  const handleToggle = useCallback(() => {
    if (!editor || !canToggleHeader) return false
    selectLine(editor, tablePos, orientation, 0)
    const chain = editor.chain().focus()
    const ok = orientation === 'row' ? chain.toggleHeaderRow().run() : chain.toggleHeaderColumn().run()
    if (ok) onToggled?.()
    return ok
  }, [editor, canToggleHeader, tablePos, orientation, onToggled])

  return {
    isVisible,
    canToggleHeader,
    isHeader,
    handleToggle,
    label: orientation === 'row' ? 'Header row' : 'Header column',
    Icon: orientation === 'row' ? PanelTopIcon : PanelLeftIcon,
  }
}

export interface TableHeaderRowColumnButtonProps
  extends
    Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction' | 'active'>,
    UseTableHeaderRowColumnConfig {}

export const TableHeaderRowColumnButton = forwardRef<HTMLButtonElement, TableHeaderRowColumnButtonProps>(
  ({ editor, index, orientation, tablePos, hideWhenUnavailable, onToggled, ...rest }, ref) => {
    const { isVisible, canToggleHeader, isHeader, handleToggle, label, Icon } = useTableHeaderRowColumn({
      editor,
      index,
      orientation,
      tablePos,
      hideWhenUnavailable,
      onToggled,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canToggleHeader}
        active={isHeader}
        onAction={handleToggle}
        {...rest}
      />
    )
  },
)
TableHeaderRowColumnButton.displayName = 'TableHeaderRowColumnButton'
