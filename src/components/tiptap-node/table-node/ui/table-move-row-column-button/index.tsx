import type { Editor } from '@tiptap/react'
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon } from 'lucide-react'
import { forwardRef, useCallback } from 'react'

import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { type Orientation, canMoveLine, moveLine } from '@/lib/tiptap-table-utils'

import { TableActionButton, type TableActionButtonProps } from '../table-action-button'
import { resolveTarget } from '../use-table-ui'

export type MoveDirection = 'up' | 'down' | 'left' | 'right'

export interface UseTableMoveRowColumnConfig {
  editor?: Editor | null
  index?: number
  orientation?: Orientation
  direction?: MoveDirection
  tablePos?: number
  hideWhenUnavailable?: boolean
  onMoved?: () => void
}

const ICONS = { up: ArrowUpIcon, down: ArrowDownIcon, left: ArrowLeftIcon, right: ArrowRightIcon }

export function useTableMoveRowColumn(config: UseTableMoveRowColumnConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, onMoved } = config
  const { ctx, orientation, index, tablePos } = resolveTarget(editor, config)
  const direction: MoveDirection = config.direction ?? (orientation === 'row' ? 'down' : 'right')
  const step = direction === 'up' || direction === 'left' ? -1 : 1
  const target = index === null ? null : index + step

  // Rows move up / down, columns left / right
  const matches = orientation === 'row' ? direction === 'up' || direction === 'down' : direction === 'left' || direction === 'right'
  const canMoveRowColumn = matches && index !== null && target !== null && canMoveLine(editor, ctx, orientation, index, target)
  const isVisible = !!editor && matches && (!hideWhenUnavailable || canMoveRowColumn)

  const handleMove = useCallback(() => {
    if (!canMoveRowColumn || index === null || target === null) return false
    const ok = moveLine(editor, { tablePos, orientation, from: index, to: target })
    if (ok) onMoved?.()
    return ok
  }, [canMoveRowColumn, editor, tablePos, orientation, index, target, onMoved])

  const noun = orientation === 'row' ? 'row' : 'column'
  return {
    isVisible,
    canMoveRowColumn,
    handleMove,
    label: `Move ${noun} ${direction}`,
    Icon: ICONS[direction],
  }
}

export interface TableMoveRowColumnButtonProps
  extends Omit<TableActionButtonProps, 'label' | 'Icon' | 'isVisible' | 'canExecute' | 'onAction'>, UseTableMoveRowColumnConfig {}

export const TableMoveRowColumnButton = forwardRef<HTMLButtonElement, TableMoveRowColumnButtonProps>(
  ({ editor, index, orientation, direction, tablePos, hideWhenUnavailable, onMoved, ...rest }, ref) => {
    const { isVisible, canMoveRowColumn, handleMove, label, Icon } = useTableMoveRowColumn({
      editor,
      index,
      orientation,
      direction,
      tablePos,
      hideWhenUnavailable,
      onMoved,
    })
    return (
      <TableActionButton
        ref={ref}
        label={label}
        Icon={Icon}
        isVisible={isVisible}
        canExecute={canMoveRowColumn}
        onAction={handleMove}
        {...rest}
      />
    )
  },
)
TableMoveRowColumnButton.displayName = 'TableMoveRowColumnButton'
