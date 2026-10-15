import { type ComponentType, forwardRef, useCallback } from 'react'

import type { ButtonProps } from '@/components/tiptap-ui-primitive/button'
import { Button } from '@/components/tiptap-ui-primitive/button'

import { keepSelection } from './use-table-ui'

export interface TableActionButtonProps extends Omit<ButtonProps, 'type'> {
  label: string
  Icon: ComponentType<{ className?: string }>
  isVisible: boolean
  canExecute: boolean
  active?: boolean
  /** Optional text shown next to the icon. */
  text?: string
  onAction: () => unknown
}

/**
 * The shared button every table action renders: a ghost button with icon + optional text that
 * does not steal the editor selection.
 */
export const TableActionButton = forwardRef<HTMLButtonElement, TableActionButtonProps>(
  ({ label, Icon, isVisible, canExecute, active, text, onAction, onClick, onMouseDown, children, ...rest }, ref) => {
    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        onAction()
      },
      [onAction, onClick],
    )

    if (!isVisible) return null

    return (
      <Button
        type="button"
        variant="ghost"
        role="button"
        tabIndex={-1}
        disabled={!canExecute}
        data-disabled={!canExecute}
        data-active-state={active ? 'on' : 'off'}
        aria-label={label}
        aria-pressed={active}
        tooltip={label}
        showTooltip={!text}
        onMouseDown={(event) => {
          onMouseDown?.(event)
          keepSelection(event)
        }}
        onClick={handleClick}
        {...rest}
        ref={ref}
      >
        {children ?? (
          <>
            <Icon className="tiptap-button-icon" />
            {text && <span className="tiptap-button-text">{text}</span>}
          </>
        )}
      </Button>
    )
  },
)

TableActionButton.displayName = 'TableActionButton'
