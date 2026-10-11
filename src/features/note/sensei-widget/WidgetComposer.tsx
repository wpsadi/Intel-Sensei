import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Composer, ComposerActions, ComposerBar, ComposerSend, ComposerToolbar, ComposerVoice, ComposerVoiceButton } from '@/components/assistant-ui/elements/composer'
import { mono } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { formatElapsed, useVoiceNote } from '@/features/ask-sensei/components/use-voice-note'
import { cn } from '@/lib/utils'

/**
 * The widget's message box, styled like the Ask Sensei composer: type or dictate (Gemini transcribes the voice note
 * into the draft), Enter sends, and the send button turns into stop while Sensei replies.
 */
export function WidgetComposer({ onSend, streaming, onStop, autoFocus }: { onSend: (text: string) => void; streaming: boolean; onStop: () => void; autoFocus?: boolean }) {
  const [draft, setDraft] = useState('')
  const { mode, seconds, levels, startVoice, finishVoice, cancelVoice } = useVoiceNote(draft, setDraft)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus && mode === 'text') inputRef.current?.focus()
  }, [autoFocus, mode])

  const send = () => {
    const text = draft.trim()
    if (!text || streaming) return
    onSend(text)
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
    <Composer className="max-w-none">
      <ComposerBar>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Sensei about your notes…"
          aria-label="Message Sensei"
          // An empty box passes Ctrl+Z to the note, so agent edits can be undone without leaving the chat.
          data-undo-passthrough
          className="field-sizing-content max-h-36 min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ComposerToolbar className="h-9 justify-end">
          <ComposerActions>
            <ComposerVoiceButton active={false} aria-label="Start voice input" onClick={() => void startVoice()} />
            <ComposerSend streaming={streaming} idle={!hasText && !streaming} onClick={streaming ? onStop : send} disabled={!hasText && !streaming} />
          </ComposerActions>
        </ComposerToolbar>
      </ComposerBar>
    </Composer>
  )
}
