import { X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInstalledSkills } from '@/ai/skills/skills'
import {
  Composer,
  ComposerActions,
  ComposerBar,
  ComposerSend,
  ComposerToolbar,
  ComposerVoice,
  ComposerVoiceButton,
} from '@/components/assistant-ui/elements/composer'
import { type ComposerSuggestion, triggerAt } from '@/components/assistant-ui/elements/suggestion-menu'
import { mono } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatElapsed, useVoiceNote } from '@/features/ask-sensei/components/use-voice-note'
import { skillSuggestions } from '@/features/skills/suggest'
import { useInputHistory } from '@/hooks/use-input-history'
import { cn } from '@/lib/utils'

export type { ComposerSuggestion }

/**
 * The widget's message box, styled like the Ask Sensei composer: type or dictate (Gemini transcribes the voice note
 * into the draft), Enter sends, and the send button turns into stop while Sensei replies and nothing is typed. A message typed meanwhile is queued or steers the reply (Settings → Chat).
 */
export function WidgetComposer({
  onSend,
  streaming,
  onStop,
  autoFocus,
  placeholder = 'Ask Sensei about your notes…',
  toolbarStart,
  disabled,
  suggest,
  history = [],
  chatId,
  historyScope,
}: {
  onSend: (text: string) => void
  streaming: boolean
  onStop: () => void
  autoFocus?: boolean
  placeholder?: string
  /** Extra controls at the left of the toolbar, such as an attach button. */
  toolbarStart?: ReactNode
  disabled?: boolean
  /** Additional commands or mentions, combined with the installed skills. */
  suggest?: (trigger: '/' | '@', query: string) => { title: string; items: ComposerSuggestion[] }
  /** Earlier messages, oldest first. Up and Down in the box step through them like a shell. */
  history?: string[]
  chatId?: string | null
  historyScope?: string
}) {
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const recall = useInputHistory({ history, chatId, scope: historyScope ?? chatId, draft, setDraft })
  const skills = useInstalledSkills()
  const [, setParams] = useSearchParams()
  const openSkills = () =>
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('settings', 'open')
      next.set('section', 'skills')
      return next
    })
  const { mode, seconds, levels, startVoice, finishVoice, cancelVoice } = useVoiceNote(draft, setDraft)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus && mode === 'text') inputRef.current?.focus()
  }, [autoFocus, mode])

  const send = () => {
    const text = draft.trim()
    if (!text || disabled) return
    onSend(text)
    setDraft('')
    recall.reset()
  }

  const found = triggerAt(draft, caret)
  const custom = found && suggest ? suggest(found.trigger, found.query) : null
  const skillItems = found?.trigger === '/' ? skillSuggestions(skills, found.query, custom?.items.length ? undefined : openSkills) : []
  const list =
    found && !dismissed && !recall.active
      ? {
          title: custom?.title ?? 'Skills',
          items: [...(custom?.items ?? []), ...skillItems.filter((item) => !custom?.items.some((other) => other.id === item.id))],
        }
      : null
  const items = list?.items ?? []
  const open = items.length > 0
  const pick = (item: ComposerSuggestion) => {
    if (!found) return
    if (item.run) {
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

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && !event.nativeEvent.isComposing) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => (i + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        pick(items[Math.min(active, items.length - 1)])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (recall.onKeyDown(event)) return
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  if (mode === 'transcribing') {
    return (
      <Composer className="max-w-none">
        <ComposerBar>
          <ComposerVoice recording={false} seconds={0} />
        </ComposerBar>
      </Composer>
    )
  }

  if (mode === 'voice') {
    return (
      <Composer className="max-w-none">
        <ComposerBar>
          <ComposerVoice recording seconds={seconds} levels={levels} showTimer={false} />
          <ComposerToolbar>
            <Button variant="ghost" size="icon-sm" aria-label="Cancel voice input" onClick={cancelVoice}>
              <X />
            </Button>
            <span className={cn(mono, 'text-sm text-muted-foreground tabular-nums')}>{formatElapsed(seconds)}</span>
            <ComposerActions>
              <ComposerVoiceButton active onClick={finishVoice} />
            </ComposerActions>
          </ComposerToolbar>
        </ComposerBar>
      </Composer>
    )
  }

  const hasText = draft.trim().length > 0
  return (
    <div className="relative">
      {open && (
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
      )}
      <Composer className="max-w-none">
        <ComposerBar>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setCaret(event.target.selectionStart)
              setActive(0)
              setDismissed(false)
              recall.reset()
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Message Sensei"
            // An empty box passes Ctrl+Z to the note, so agent edits can be undone without leaving the chat.
            data-undo-passthrough
            className="field-sizing-content max-h-36 min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <ComposerToolbar className="h-9 justify-end">
            {toolbarStart}
            <ComposerActions>
              <ComposerVoiceButton active={false} aria-label="Start voice input" onClick={() => void startVoice()} />
              <ComposerSend
                streaming={streaming && !hasText}
                idle={!hasText && !streaming}
                onClick={streaming && !hasText ? onStop : send}
                disabled={(!hasText || !!disabled) && !streaming}
              />
            </ComposerActions>
          </ComposerToolbar>
        </ComposerBar>
      </Composer>
    </div>
  )
}
