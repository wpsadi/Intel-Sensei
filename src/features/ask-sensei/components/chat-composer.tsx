import { AudioLines, Mic, MicOff, PhoneOff, X } from 'lucide-react'
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { warmForFiles } from '@/ai/sandbox/attachments'
import { useInstalledSkills } from '@/ai/skills/skills'
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
import { type ComposerSuggestion, useSuggestionMenu } from '@/components/assistant-ui/elements/suggestion-menu'
import { mono } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import { useLiveCall } from '@/features/ask-sensei/components/live-call'
import { deleteMedia, putMedia } from '@/features/note/db/media'
import type { ChatAttachment } from '@/features/note/db/types'
import { skillSuggestions } from '@/features/skills/suggest'
import { useInputHistory } from '@/hooks/use-input-history'
import { cn } from '@/lib/utils'

import { PASTE_ATTACH_BYTES, PASTE_ATTACH_LINES, attachmentKind, formatSize } from './use-attachments'
import { formatElapsed, useVoiceNote } from './use-voice-note'

/** The files `@` can point at: names that start with what is typed first, then names that contain it. */
function fileSuggestions(names: string[], query: string): ComposerSuggestion[] {
  const q = query.toLowerCase()
  const starts = names.filter((name) => name.toLowerCase().startsWith(q))
  const contains = names.filter((name) => !name.toLowerCase().startsWith(q) && name.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, 30).map((name) => ({ id: `file-${name}`, label: name, insert: `@${name}` }))
}


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
  const recall = useInputHistory({ history: sentTexts, chatId, draft, setDraft })
  // "/" lists the skills, "@" the files of this chat (the ones attached, and the ones Sensei made).
  const skills = useInstalledSkills()
  const [, setSearchParams] = useSearchParams()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileNames = useMemo(
    () => [...new Set([...(chatMessages ?? []).flatMap((message) => message.attachments ?? []), ...attachments].map((file) => file.name))],
    [chatMessages, attachments],
  )
  const openSkillSettings = () =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('settings', 'open')
      params.set('section', 'skills')
      return params
    })
  const suggestions = useSuggestionMenu({
    draft,
    setDraft,
    inputRef,
    suggest: (trigger, query) =>
      recall.active
        ? { title: '', items: [] }
        : trigger === '/'
          ? { title: 'Skills', items: skillSuggestions(skills, query, openSkillSettings) }
          : { title: 'Files', items: fileSuggestions(fileNames, query) },
  })
  useEffect(() => {
    onCallChange?.(inCall)
  }, [inCall, onCallChange])

  /** Saves files to Cache Storage straight away, so a sent message only has to reference them. */
  const attach = async (files: File[]) => {
    try {
      const saved = await Promise.all(
        files.map(async (file) => ({ src: await putMedia(file, file.name), name: file.name, type: file.type, size: file.size })),
      )
      // Files the model reads through Python start the environment now, so it is ready by the time they are asked about.
      if (chatId) warmForFiles(saved, chatId)
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
      if ((!text && !attachments.length) || call.state !== 'live') return
      call.sendText(text, attachments)
      setAttachments([])
    } else {
      if (!text && !attachments.length) return
      onSend(text, attachments)
      setAttachments([])
    }
    setDraft('')
    recall.reset()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || recall.onKeyDown(event)) return
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
            onChange={(event) => {
              setDraft(event.target.value)
              recall.reset()
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={call.state === 'connecting' ? 'Connecting…' : 'Talk, or type to Sensei'}
            aria-label="Type during the call"
            className="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <ComposerToolbar className="h-9 justify-between">
            <ComposerAttachButton onClick={pickFiles} />
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
    <div className="relative">
      {suggestions.menu}
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
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              recall.reset()
              suggestions.track(event.target)
              suggestions.typed()
            }}
            onSelect={(event) => suggestions.track(event.currentTarget)}
            onKeyDown={(event) => !suggestions.onKeyDown(event) && handleKeyDown(event)}
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
    </div>
  )
}
