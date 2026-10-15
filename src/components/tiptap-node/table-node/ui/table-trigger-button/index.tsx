import type { Editor } from '@tiptap/react'
import { TableIcon } from 'lucide-react'
import { forwardRef, useCallback, useState } from 'react'

import { Button, type ButtonProps } from '@/components/tiptap-ui-primitive/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/tiptap-ui-primitive/popover'
import { useTiptapEditor } from '@/hooks/use-tiptap-editor'
import { cn } from '@/lib/tiptap-utils'

export interface UseTableTriggerButtonConfig {
  editor?: Editor | null
  hideWhenUnavailable?: boolean
  maxRows?: number
  maxCols?: number
  onInserted?: (rows: number, cols: number) => void
}

export function useTableTriggerButton(config: UseTableTriggerButtonConfig = {}) {
  const { editor } = useTiptapEditor(config.editor)
  const { hideWhenUnavailable = false, maxRows = 8, maxCols = 8, onInserted } = config
  const [isOpen, setIsOpen] = useState(false)
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)

  const canInsert = (() => {
    if (!editor?.isEditable) return false
    try {
      return editor.can().insertTable({ rows: 1, cols: 1 })
    } catch {
      return false
    }
  })()
  const isVisible = !!editor && (!hideWhenUnavailable || canInsert)

  const handleCellHover = useCallback((row: number, col: number) => setHoveredCell({ row, col }), [])
  const resetHoveredCell = useCallback(() => setHoveredCell(null), [])

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (!editor || !canInsert) return false
      const rows = Math.min(row + 1, maxRows)
      const cols = Math.min(col + 1, maxCols)
      const ok = editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
      if (ok) {
        setIsOpen(false)
        setHoveredCell(null)
        onInserted?.(rows, cols)
      }
      return ok
    },
    [editor, canInsert, maxRows, maxCols, onInserted],
  )

  return {
    isVisible,
    canInsert,
    isOpen,
    setIsOpen,
    hoveredCell,
    handleCellHover,
    handleCellClick,
    resetHoveredCell,
    label: 'Insert table',
    Icon: TableIcon,
  }
}

export interface TableTriggerButtonProps extends Omit<ButtonProps, 'type'>, UseTableTriggerButtonConfig {
  text?: string
}

export const TableTriggerButton = forwardRef<HTMLButtonElement, TableTriggerButtonProps>(
  (
    { editor: providedEditor, hideWhenUnavailable, maxRows = 8, maxCols = 8, onInserted, text, className, children, ...buttonProps },
    ref,
  ) => {
    const { isVisible, canInsert, isOpen, setIsOpen, hoveredCell, handleCellHover, handleCellClick, resetHoveredCell, label, Icon } =
      useTableTriggerButton({ editor: providedEditor, hideWhenUnavailable, maxRows, maxCols, onInserted })

    if (!isVisible) return null

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            tabIndex={-1}
            disabled={!canInsert}
            data-disabled={!canInsert}
            data-active-state={isOpen ? 'on' : 'off'}
            aria-label={label}
            tooltip={label}
            className={className}
            onMouseDown={(e) => e.preventDefault()}
            {...buttonProps}
            ref={ref}
          >
            {children ?? (
              <>
                <Icon className="tiptap-button-icon" />
                {text && <span className="tiptap-button-text">{text}</span>}
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="tiptap-table-trigger-popover"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div
            className="tiptap-table-grid"
            role="grid"
            aria-label="Select table size"
            style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}
            onMouseLeave={resetHoveredCell}
          >
            {Array.from({ length: maxRows * maxCols }, (_, i) => {
              const row = Math.floor(i / maxCols)
              const col = i % maxCols
              const lit = !!hoveredCell && row <= hoveredCell.row && col <= hoveredCell.col
              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  aria-label={`${row + 1} × ${col + 1}`}
                  className={cn('tiptap-table-grid-cell', lit && 'is-lit')}
                  onMouseEnter={() => handleCellHover(row, col)}
                  onFocus={() => handleCellHover(row, col)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleCellClick(row, col)}
                />
              )
            })}
          </div>
          <div className="tiptap-table-grid-caption">
            {hoveredCell ? `${hoveredCell.row + 1} × ${hoveredCell.col + 1}` : 'Insert table'}
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)
TableTriggerButton.displayName = 'TableTriggerButton'
