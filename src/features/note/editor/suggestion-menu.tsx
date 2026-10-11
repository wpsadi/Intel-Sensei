import { ScrollArea } from '@/components/ui/scroll-area'
import { type Editor, type Range, ReactRenderer } from '@tiptap/react'
import { type ReactNode, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import { cn } from '@/lib/utils'

/** A row in any suggestion popup (slash commands, mentions, emoji). */
export interface MenuItem {
  key: string
  title: string
  subtitle?: string
  group?: string
  icon?: ReactNode
  keywords?: string[]
  run: (editor: Editor, range: Range) => void
}

export const matches = (item: Pick<MenuItem, 'title' | 'keywords'>, query: string) => {
  const q = query.toLowerCase().trim()
  if (!q) return true
  return [item.title, ...(item.keywords ?? [])].some((text) => text.toLowerCase().includes(q))
}

/** Exact title, then title prefix, then any other match. */
export function rankMatches<T extends Pick<MenuItem, 'title' | 'keywords'>>(items: T[], query: string) {
  const q = query.toLowerCase().trim()
  const rank = (item: T) => {
    const title = item.title.toLowerCase()
    return title === q ? 0 : title.startsWith(q) ? 1 : 2
  }
  return items.filter((item) => matches(item, query)).sort((a, b) => rank(a) - rank(b))
}

interface MenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** Arrow / Enter / Tab navigation over a menu list. Returns true when the key was handled. */
export function useMenuKeys(items: MenuItem[], onSelect: (item: MenuItem) => void) {
  const [active, setActive] = useState(0)
  useEffect(() => setActive(0), [items])
  const onKeyDown = (event: Pick<KeyboardEvent, 'key'>) => {
    if (!items.length) return false
    if (event.key === 'ArrowDown') setActive((i) => (i + 1) % items.length)
    else if (event.key === 'ArrowUp') setActive((i) => (i - 1 + items.length) % items.length)
    else if (event.key === 'Enter' || event.key === 'Tab') onSelect(items[active])
    else return false
    return true
  }
  return { active, setActive, onKeyDown }
}

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

const SuggestionList = forwardRef<MenuHandle, SuggestionProps<MenuItem, MenuItem>>(({ items, command }, ref) => {
  const { active, setActive, onKeyDown } = useMenuKeys(items, command)
  useImperativeHandle(ref, () => ({ onKeyDown }))
  return <MenuList items={items} active={active} onActiveChange={setActive} onSelect={command} className="snote-menu" />
})
SuggestionList.displayName = 'SuggestionList'

/** Shared popup renderer: mounts SuggestionList next to the caret. */
export const renderSuggestion: SuggestionOptions<MenuItem, MenuItem>['render'] = () => {
  let renderer: ReactRenderer<MenuHandle, SuggestionProps<MenuItem, MenuItem>> | null = null
  let host: HTMLDivElement | null = null
  // Escape hides the menu for the rest of this suggestion; keys then go back to the editor.
  let dismissed = false

  const place = (props: SuggestionProps<MenuItem, MenuItem>) => {
    const rect = props.clientRect?.()
    if (!rect || !host) return
    const below = rect.bottom + 320 < window.innerHeight
    host.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
    host.style.top = below ? `${rect.bottom + 6}px` : ''
    host.style.bottom = below ? '' : `${window.innerHeight - rect.top + 6}px`
  }

  return {
    onStart(props) {
      dismissed = false
      renderer = new ReactRenderer(SuggestionList, { props, editor: props.editor })
      host = document.createElement('div')
      host.className = 'fixed z-50'
      host.appendChild(renderer.element)
      document.body.appendChild(host)
      place(props)
    },
    onUpdate(props) {
      renderer?.updateProps(props)
      place(props)
    },
    onKeyDown({ event }) {
      if (dismissed) return false
      if (event.key === 'Escape') {
        dismissed = true
        host?.remove()
        return true
      }
      return renderer?.ref?.onKeyDown(event) ?? false
    },
    onExit() {
      renderer?.destroy()
      host?.remove()
      renderer = null
      host = null
    },
  }
}

export const runMenuItem: SuggestionOptions<MenuItem, MenuItem>['command'] = ({ editor, range, props }) =>
  props.run(editor, range)
