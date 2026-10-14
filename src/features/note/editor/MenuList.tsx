import type { SuggestionProps } from '@tiptap/suggestion'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { type MenuHandle, type MenuItem, useMenuKeys } from './menu-items'

/** Grouped, scrollable list of menu items. Shared by the "/" popup and the "+" block dialog. */
export function MenuList({
  items,
  active,
  onActiveChange,
  onSelect,
  className,
}: {
  items: MenuItem[]
  active: number
  onActiveChange: (index: number) => void
  onSelect: (item: MenuItem) => void
  className?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!items.length) {
    return <div className={cn('px-3 py-2 text-sm text-muted-foreground', className)}>No results</div>
  }

  return (
    <ScrollArea className={cn('h-80 w-72', className)}>
      <div ref={listRef} className="p-1">
        {items.map((item, index) => (
          <div key={item.key}>
            {item.group && item.group !== items[index - 1]?.group && (
              <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{item.group}</div>
            )}
            <button
              type="button"
              data-index={index}
              onMouseEnter={() => onActiveChange(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(item)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                index === active && 'bg-accent text-accent-foreground',
              )}
            >
              {item.icon && (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-base">
                  {item.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.title}</span>
                {item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
              </span>
            </button>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

export const SuggestionList = forwardRef<MenuHandle, SuggestionProps<MenuItem, MenuItem>>(({ items, command }, ref) => {
  const { active, setActive, onKeyDown } = useMenuKeys(items, command)
  useImperativeHandle(ref, () => ({ onKeyDown }))
  return <MenuList items={items} active={active} onActiveChange={setActive} onSelect={command} className="snote-menu" />
})
SuggestionList.displayName = 'SuggestionList'
