import { AudioLines, Mic, MicOff, PhoneOff, X } from 'lucide-react'
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  Composer,
  ComposerActions,
  ComposerAttachButton,
  ComposerAttachmentChip,
  ComposerAttachments,
  ComposerBar,
  ComposerSend,
  ComposerToolbar,
  ComposerVoice,
  ComposerVoiceButton,
} from '@/components/assistant-ui/elements/composer'
import { mono } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import { useLiveCall } from '@/features/ask-sensei/components/live-call'
import { deleteMedia, putMedia } from '@/features/note/db/media'
import type { ChatAttachment } from '@/features/note/db/types'
import { cn } from '@/lib/utils'

import { formatElapsed, useVoiceNote } from './use-voice-note'

/** Pasted text longer than this many lines, or bigger than this many bytes, goes in as a text attachment instead of filling the box. */
const PASTE_ATTACH_LINES = 30
const PASTE_ATTACH_BYTES = 8 * 1024

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

const attachmentKind = (type: string) => (type.startsWith('image/') ? 'image' : type.startsWith('text/') ? 'text' : 'archive')

/**
 * Message input: type, dictate, or start a live call. A voice note is sent to Gemini for transcription and the
 * text lands in the draft; you send it yourself. During a live call, typed text goes into the call instead.
 */
export function ChatComposer({
  chatId,
  onChatOpened,
  onSend,
  onCallChange,
  context,
  streaming = false,
  onStop,
}: {
  /** True while Sensei's reply streams in; with nothing typed the send button turns into stop, and a message typed meanwhile is queued or steers the reply (Settings → Chat). */
  streaming?: boolean
  onStop?: () => void
  /** Shown at the start of the toolbar, such as the context usage ring. */
  context?: ReactNode
  /** The open chat. A live call continues it and is transcribed into it. */
  chatId: string | null
  onChatOpened: (id: string) => void
  onSend: (text: string, attachments: ChatAttachment[]) => void
  /** Tells the page when a live call starts or ends, so it can show the aurora. */
  onCallChange?: (inCall: boolean) => void
}) {
  const call = useLiveCall(chatId, onChatOpened)
  const inCall = call.state !== 'idle'
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const { mode, seconds, levels, startVoice, finishVoice, cancelVoice } = useVoiceNote(draft, setDraft)
  // Up and down walk through this chat's earlier messages, newest first. null means the draft being written.
  const chatMessages = useAskSenseiStore((state) => (chatId ? state.messages[chatId] : undefined))
  const sentTexts = useMemo(
    () => (chatMessages ?? []).filter((message) => message.role === 'user' && message.content.trim()).map((message) => message.content),
    [chatMessages],
  )
  const [recalled, setRecalled] = useState<number | null>(null)
  const draftBeforeRecall = useRef('')

  const [recallChatId, setRecallChatId] = useState(chatId)
  if (recallChatId !== chatId) {
    setRecallChatId(chatId)
    setRecalled(null)
  }

  /** Shows an earlier message (an index into sentTexts), or the saved draft for null, with the caret at the end. */
  const recall = (index: number | null, textarea: HTMLTextAreaElement) => {
    const text = index === null ? draftBeforeRecall.current : sentTexts[index]
    setRecalled(index)
    setDraft(text)
    requestAnimationFrame(() => textarea.setSelectionRange(text.length, text.length))
  }

  useEffect(() => {
    onCallChange?.(inCall)
  }, [inCall, onCallChange])

  /** Saves files to Cache Storage straight away, so a sent message only has to reference them. */
  const attach = async (files: File[]) => {
    try {
      const saved = await Promise.all(
        files.map(async (file) => ({ src: await putMedia(file, file.name), name: file.name, type: file.type, size: file.size })),
      )
      setAttachments((prev) => [...prev, ...saved])
    } catch {
      toast('Could not save the attachment')
    }
  }

  const pickFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => void attach([...(input.files ?? [])])
    input.click()
  }

  const removeAttachment = (src: string) => {
    setAttachments((prev) => prev.filter((item) => item.src !== src))
    void deleteMedia(src)
  }

  /**
   * Pasted images and files attach. Pasted text goes into the box, unless it is over 30 lines or 8 KB: then it becomes a
   * text file, so a long log or document stays out of the box. A paste can carry both, such as an image
   * copied from a web page together with its caption.
   */
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.items]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file)
      // Screenshots arrive named "image.png"; give them a name that says where they came from.
      .map((file) =>
        file.name === 'image.png' ? new File([file], `Pasted image ${new Date().toLocaleTimeString()}.png`, { type: file.type }) : file,
      )
    const text = event.clipboardData.getData('text/plain')
    const longText = text.split('\n').length > PASTE_ATTACH_LINES || new Blob([text]).size > PASTE_ATTACH_BYTES
    if (files.length || longText) event.preventDefault()
    if (longText) {
      const count = attachments.filter((item) => item.name.startsWith('Pasted text')).length
      files.push(new File([text], `Pasted text${count ? ` ${count + 1}` : ''}.txt`, { type: 'text/plain' }))
    } else if (files.length && text) {
      // The default paste was stopped for the files, so put the short text in by hand.
      setDraft((value) => value + text)
    }
    if (files.length) void attach(files)
  }

  const send = () => {
    const text = draft.trim()
    if (inCall) {
      if (!text || call.state !== 'live') return
      call.sendText(text)
    } else {
      if (!text && !attachments.length) return
      onSend(text, attachments)
      setAttachments([])
    }
    setDraft('')
    setRecalled(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget
    const { selectionStart, selectionEnd, value } = textarea
    const noModifier = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
    // Up on the first line goes to the previous message; down at the very end goes to the next one.
    if (event.key === 'ArrowUp' && noModifier && selectionStart === selectionEnd && !value.slice(0, selectionStart).includes('\n')) {
      const next = recalled === null ? sentTexts.length - 1 : recalled - 1
      if (next >= 0) {
        event.preventDefault()
        if (recalled === null) draftBeforeRecall.current = value
        recall(next, textarea)
      }
      return
    }
    if (event.key === 'ArrowDown' && noModifier && recalled !== null && selectionStart === value.length && selectionEnd === value.length) {
      event.preventDefault()
      recall(recalled + 1 < sentTexts.length ? recalled + 1 : null, textarea)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  const hasText = draft.trim().length > 0 || attachments.length > 0

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

  if (inCall) {
    return (
      <Composer className="max-w-none">
        <ComposerBar>
          <textarea
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={call.state === 'connecting' ? 'Connecting…' : 'Talk, or type to Sensei'}
            aria-label="Type during the call"
            className="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <ComposerToolbar className="h-9 justify-end">
            <ComposerActions>
              <Button
                variant={call.muted ? 'secondary' : 'ghost'}
                size="icon-sm"
                className="rounded-full"
                aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={call.muted}
                disabled={call.state !== 'live'}
                onClick={() => call.setMuted(!call.muted)}
              >
                {call.muted ? <MicOff /> : <Mic />}
              </Button>
              <Button variant="destructive" size="icon-sm" className="rounded-full" aria-label="End call" onClick={call.end}>
                <PhoneOff />
              </Button>
            </ComposerActions>
          </ComposerToolbar>
        </ComposerBar>
      </Composer>
    )
  }

  return (
    <Composer className="max-w-none">
      <ComposerBar>
        {attachments.length > 0 && (
          <ComposerAttachments className="px-2 pt-2">
            {attachments.map((item) => (
              <ComposerAttachmentChip
                key={item.src}
                attachment={{ name: item.name, meta: formatSize(item.size), state: 'done', kind: attachmentKind(item.type) }}
                onRemove={() => removeAttachment(item.src)}
              />
            ))}
          </ComposerAttachments>
        )}
        <textarea
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask Sensei anything…"
          aria-label="Message Sensei"
          className="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {/* Fixed height so the row never jumps when the send button appears. */}
        <ComposerToolbar className="h-9 justify-between">
          <div className="flex items-center gap-1">
            <ComposerAttachButton onClick={pickFiles} />
            {context}
          </div>
          <ComposerActions>
            <ComposerVoiceButton active={false} aria-label="Start voice input" onClick={() => void startVoice()} />
            {/* Call and send share one box; only visibility changes, so the voice button never shifts. */}
            <div className="relative size-8">
              <Button
                variant="secondary"
                size="icon-sm"
                className={cn('absolute inset-0 rounded-full', (hasText || streaming) && 'invisible')}
                aria-label="Start live call"
                onClick={() => void call.start()}
                tabIndex={hasText || streaming ? -1 : undefined}
              >
                <AudioLines />
              </Button>
              <ComposerSend
                className={cn('absolute inset-0', !hasText && !streaming && 'invisible')}
                streaming={streaming && !hasText}
                idle={false}
                onClick={streaming && !hasText ? onStop : send}
                tabIndex={hasText || streaming ? undefined : -1}
              />
            </div>
          </ComposerActions>
        </ComposerToolbar>
      </ComposerBar>
    </Composer>
  )
}
