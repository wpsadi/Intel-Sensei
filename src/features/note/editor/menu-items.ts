import type { Editor, Range } from '@tiptap/react'
import { type ReactNode, useState } from 'react'

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

export interface MenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** Arrow / Enter / Tab navigation over a menu list. Returns true when the key was handled. */
export function useMenuKeys(items: MenuItem[], onSelect: (item: MenuItem) => void) {
  const [active, setActive] = useState(0)
  // Reset the highlight whenever the item list changes (adjusting state during render, not in an effect).
  const [prevItems, setPrevItems] = useState(items)
  if (items !== prevItems) {
    setPrevItems(items)
    setActive(0)
  }
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
