import { CircleStop, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { Checkpoint, CheckpointIcon } from '@/components/ai-elements/checkpoint'
import { ComposerAttachmentChip } from '@/components/assistant-ui/elements/composer'
import { CopyMessage, ReplyAction, ReplyActions } from '@/components/reply-actions'
import { Bubble, Message, MessageContent } from '@/components/ui/chat'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ChatPlanCard } from '@/features/ask-sensei/components/chat-plan'
import { ChatQuestionsCard } from '@/features/ask-sensei/components/chat-questions'
import { ChatReasoning } from '@/features/ask-sensei/components/chat-reasoning'
import { ChatSearches } from '@/features/ask-sensei/components/chat-searches'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { useMediaUrl } from '@/features/note/db/hooks'
import { resolveMedia } from '@/features/note/db/media'
import type { ChatAttachment, ChatMessage } from '@/features/note/db/types'
import { cn } from '@/lib/utils'

/** Element id of the marker at the end of the list. The page scrolls to it from the down arrow. */
export const CONVERSATION_END_ID = 'conversation-end'

/** A single pulsing dot, shown from the moment a question is sent until Sensei's first words arrive. */
function ReplyDot() {
  return <span role="status" aria-label="Sensei is replying" className="block size-2 animate-pulse rounded-full bg-muted-foreground" />
}

/** Copy, read aloud and try again, shown in a row under each Sensei reply. */
function ResponseActions({
  id,
  text,
  onRetry,
  disabled,
  interrupted,
}: {
  id: string
  text: string
  onRetry: () => void
  disabled: boolean
  interrupted?: boolean
}) {
  // A stopped reply is unfinished, so only trying again is offered.
  return (
    <ReplyActions text={text} speakId={id} hideCopyAndSpeech={interrupted}>
      <ReplyAction label="Try again" onClick={onRetry} disabled={disabled}>
        <RotateCcw />
      </ReplyAction>
    </ReplyActions>
  )
}

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

/** A sent image, loaded from Cache Storage. Clicking it opens the full size in a new tab. */
function AttachedImage({ attachment, onOpen }: { attachment: ChatAttachment; onOpen: () => void }) {
  const url = useMediaUrl(attachment.src)
  if (!url) return <div className="size-28 animate-pulse rounded-lg bg-muted" />
  return (
    <button type="button" onClick={onOpen} aria-label={`Open ${attachment.name}`}>
      <img src={url} alt={attachment.name} className="max-h-28 max-w-40 rounded-lg border object-cover" />
    </button>
  )
}

/** Files sent with a message: images as pictures, other files as chips. Clicking one opens it from Cache Storage in a new tab. */
function MessageAttachments({ attachments, align = 'end' }: { attachments: ChatAttachment[]; align?: 'start' | 'end' }) {
  const open = async (attachment: ChatAttachment) => {
    const url = await resolveMedia(attachment.src)
    if (url) window.open(url, '_blank', 'noopener')
    else toast('This file is no longer saved in the browser')
  }
  return (
    <div className={cn('flex flex-wrap gap-2', align === 'end' ? 'justify-end' : 'justify-start')}>
      {attachments.map((attachment) =>
        attachment.type.startsWith('image/') ? (
          <AttachedImage key={attachment.src} attachment={attachment} onOpen={() => void open(attachment)} />
        ) : (
          <button key={attachment.src} type="button" className="text-left" onClick={() => void open(attachment)}>
            <ComposerAttachmentChip
              attachment={{
                name: attachment.name,
                meta: formatSize(attachment.size),
                state: 'done',
                kind: attachment.type.startsWith('image/') ? 'image' : attachment.type.startsWith('text/') ? 'text' : 'archive',
              }}
            />
          </button>
        ),
      )}
    </div>
  )
}

/**
 * Scrollable list of a chat's messages. Each message has an id that is also its URL hash (`#messageId`).
 * With a hash, the list opens at that message; otherwise the newest message stays in view.
 * `onAtBottomChange` reports whether the end of the list is on screen, so the page can show the down arrow.
 */
export function Conversation({
  messages,
  streamingId,
  onRetry,
  onAtBottomChange,
}: {
  messages: ChatMessage[]
  streamingId: string | null
  onRetry: () => void
  onAtBottomChange: (atBottom: boolean) => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const previousLength = useRef(messages.length)
  // Whether the end of the list was on screen the last time the observer checked.
  const followingEnd = useRef(true)
  const lastContent = messages.at(-1)?.content
  const { hash } = useLocation()
  const messageId = decodeURIComponent(hash.slice(1))

  // A new message always scrolls to the end. Otherwise a hash opens at its message.
  useEffect(() => {
    const grew = messages.length > previousLength.current
    previousLength.current = messages.length
    const target = !grew && messageId ? document.getElementById(messageId) : null
    ;(target ?? endRef.current)?.scrollIntoView({
      behavior: grew ? 'smooth' : 'auto',
      block: target ? 'center' : 'end',
    })
  }, [messageId, messages.length])

  // Tell the page when the end marker is on screen. The observer accounts for the scroll area's clipping.
  useEffect(() => {
    const end = endRef.current
    if (!end) return onAtBottomChange(true)
    const observer = new IntersectionObserver(([entry]) => {
      followingEnd.current = entry.isIntersecting
      onAtBottomChange(entry.isIntersecting)
    })
    observer.observe(end)
    return () => observer.disconnect()
  }, [messages.length, onAtBottomChange])

  // While a reply streams in, keep the newest text in view as long as the reader has not scrolled up.
  useEffect(() => {
    if (followingEnd.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lastContent])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Ask Sensei something to start this chat.</div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        {messages.map((message) => {
          const isReply = message.role === 'assistant'
          const isStreaming = message.id === streamingId
          const isWaiting =
            isReply && isStreaming && !message.content && !message.reasoning && !message.plan && !message.searches && !message.questions
          return (
            <Message key={message.id} id={message.id} align={isReply ? 'start' : 'end'} className="scroll-mt-6">
              {/* An interrupted reply takes the full row, so its checkpoint line runs across the chat. */}
              <MessageContent className={cn(!isReply && 'group/user', message.interrupted ? 'w-full max-w-full' : undefined)}>
                {message.attachments?.length ? (
                  <MessageAttachments attachments={message.attachments} align={isReply ? 'start' : 'end'} />
                ) : null}
                {!isReply && !message.content ? null : isWaiting ? (
                  <ReplyDot />
                ) : (
                  <Bubble
                    variant={isReply ? 'default' : 'muted'}
                    className={isReply ? 'self-start bg-transparent px-1 text-foreground' : 'self-end'}
                  >
                    {isReply && (
                      // Thinking is over once the reply's first words arrive; the saved time shows after a reload too.
                      // Tool calls show inside the thinking block rather than between the reply's paragraphs.
                      <ChatReasoning
                        reasoning={message.reasoning}
                        steps={message.parts?.flatMap((part) => (part.type === 'steps' ? part.steps : []))}
                        isStreaming={isStreaming && !message.content}
                        duration={message.reasoningSeconds}
                        className="mb-3"
                      />
                    )}
                    {isReply && message.parts?.length ? (
                      // A live-call reply: speech, searches and tool calls in the order they happened, in one message.
                      message.parts.map((part, index) =>
                        part.type === 'text' ? (
                          <Markdown key={index}>{part.text}</Markdown>
                        ) : part.type === 'searches' ? (
                          <ChatSearches key={index} searches={part.searches} />
                        ) : part.type === 'steps' ? null : part.type === 'answer' ? (
                          <div key={index} className="my-2 rounded-lg border bg-muted/30 px-4 py-3">
                            <Markdown>{part.text}</Markdown>
                          </div>
                        ) : (
                          <ChatPlanCard key={index} plan={part.plan} isStreaming={false} />
                        ),
                      )
                    ) : (
                      <>
                        {isReply && message.searches?.length ? <ChatSearches searches={message.searches} /> : null}
                        {isReply && message.plan && <ChatPlanCard plan={message.plan} isStreaming={isStreaming && !message.content} />}
                        <Markdown>{message.content}</Markdown>
                        {/* Unanswered questions are pinned above the input instead. */}
                        {isReply && message.questions && (message.questions.answers || !isStreaming) && (
                          <ChatQuestionsCard message={message} isStreaming={isStreaming} />
                        )}
                      </>
                    )}
                  </Bubble>
                )}
                {!isReply && message.content && <CopyMessage text={message.content} className="self-end" />}
                {isReply && message.interrupted && (
                  // A line on both sides keeps the icon and label centred in the row.
                  <Checkpoint className="gap-2 py-1 [&>[data-slot=separator]]:flex-1">
                    <Separator />
                    <CheckpointIcon>
                      <CircleStop className="size-5 shrink-0" />
                    </CheckpointIcon>
                    <span className="shrink-0 text-sm font-medium">Interrupted</span>
                  </Checkpoint>
                )}
                {isReply && !isStreaming && (
                  <ResponseActions
                    id={message.id}
                    text={message.content}
                    onRetry={onRetry}
                    disabled={!!streamingId}
                    interrupted={message.interrupted}
                  />
                )}
              </MessageContent>
            </Message>
          )
        })}
        <div ref={endRef} id={CONVERSATION_END_ID} />
      </div>
    </ScrollArea>
  )
}
