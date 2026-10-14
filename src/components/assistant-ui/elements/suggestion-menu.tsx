import { type KeyboardEvent, type ReactNode, type RefObject, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/** One row of the list that opens above the box when the draft has a `/command` or `@mention` being typed. */
export interface ComposerSuggestion {
  id: string
  label: string
  hint?: string
  icon?: ReactNode
  /** Replaces what was typed, e.g. "/goal" or "@Cow body". A space follows it. */
  insert: string
  /** Runs this instead of inserting anything, for a row that does something (such as opening settings). */
  run?: () => void
}

/** Where the cursor is inside a `/` or `@` word: the trigger, what follows it, and the range to replace. */
export function triggerAt(draft: string, caret: number) {
  const before = draft.slice(0, caret)
  const m = /(^|\s)([/@])([^\s]*)$/.exec(before)
  if (!m) return null
  // Slash commands only open at the very start of the message.
  if (m[2] === '/' && m.index + m[1].length !== 0) return null
  return { trigger: m[2] as '/' | '@', query: m[3], start: before.length - m[3].length - 1, end: caret }
}

export type SuggestFn = (trigger: '/' | '@', query: string) => { title: string; items: ComposerSuggestion[] }

/**
 * The list that opens above a message box while a `/command` or `@mention` is typed. The box passes its changes and
 * keys through here: `onKeyDown` returns true when the menu used the key (arrows, Enter, Tab, Escape).
 */
export function useSuggestionMenu({
  draft,
  setDraft,
  inputRef,
  suggest,
}: {
  draft: string
  setDraft: (text: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  suggest?: SuggestFn
}) {
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const found = suggest ? triggerAt(draft, caret) : null
  const list = found && suggest && !dismissed ? suggest(found.trigger, found.query) : null
  const items = list?.items ?? []
  const open = items.length > 0

  const pick = (item: ComposerSuggestion) => {
    if (!found) return
    if (item.run) {
      // The row is an action: the typed word goes, and the action runs.
      setDraft(`${draft.slice(0, found.start)}${draft.slice(found.end)}`)
      item.run()
      return
    }
    const next = `${draft.slice(0, found.start)}${item.insert} ${draft.slice(found.end)}`
    const at = found.start + item.insert.length + 1
    setDraft(next)
    setCaret(at)
    setActive(0)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(at, at)
    })
  }

  return {
    open,
    /** Call from the box's onChange and onSelect. */
    track(element: HTMLTextAreaElement) {
      setCaret(element.selectionStart)
    },
    /** Call from the box's onChange. */
    typed() {
      setActive(0)
      setDismissed(false)
    },
    /** Call first from the box's onKeyDown; skip the box's own handling when this returns true. */
    onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (!open || event.nativeEvent.isComposing) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => (i + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        pick(items[Math.min(active, items.length - 1)])
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissed(true)
        return true
      }
      return false
    },
    /** Put this inside a `relative` wrapper around the box: it opens above it. */
    menu: open ? (
      <div
        className="absolute inset-x-0 bottom-full z-30 mb-1.5 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        role="listbox"
      >
        <div className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground">{list!.title}</div>
        <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-56">
          <div className="flex flex-col gap-0.5 p-1">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={i === active}
                // Picking must not take focus from the box, or its caret position is lost.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                {item.icon}
                <span className="truncate font-medium">{item.label}</span>
                {item.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{item.hint}</span>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    ) : null,
  }
}
