import { PlusIcon } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { ChatProfile } from '@/ai/inference/chat-profile'
import senseiLogo from '@/assets/sensei.svg'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { QueuedMessages } from '@/components/queued-messages'
import { Button } from '@/components/ui/button'
import { Bubble, Message, MessageContent } from '@/components/ui/chat'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import { ChatReasoning } from '@/features/ask-sensei/components/chat-reasoning'
import { createDeepAnswerTool } from '@/ai/tools/deep-answer'
import { READ_CHAT_INSTRUCTIONS, createReadChatTool, historyTail, snapshotOf } from '@/ai/tools/read-chat'
import { LiveAurora } from '@/features/ask-sensei/components/live-aurora'
import { useLiveChatScope, useLiveTranscript } from '@/features/ask-sensei/components/live-transcript'
import { SentAttachments } from '@/features/ask-sensei/components/use-attachments'
import type { ChatAttachment } from '@/features/note/db/types'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { WidgetComposer } from '@/features/note/sensei-widget/WidgetComposer'
import { WorkedFor } from '@/features/s-3d/agent/worked-for'

/** The browser assistant uses the same streaming Sensei runtime as S3D and Ask Sensei. */
export function BrowserAgentPanel({ page, profile }: { page: string | null; profile?: ChatProfile }) {
  const ready = useAskSenseiStore((state) => state.ready)
  const messagesByChat = useAskSenseiStore((state) => state.messages)
  const streamingByChat = useAskSenseiStore((state) => state.streaming)
  const load = useAskSenseiStore((state) => state.load)
  const sendMessage = useAskSenseiStore((state) => state.sendMessage)
  const stopReply = useAskSenseiStore((state) => state.stopReply)
  // The agent chat lives in the URL (?chatId=), next to ?sessionId=, so it can be reopened from a link.
  const [searchParams, setSearchParams] = useSearchParams()
  const chatId = searchParams.get('chatId')
  const endRef = React.useRef<HTMLDivElement>(null)
  const messages = chatId ? (messagesByChat[chatId] ?? []) : []
  const streamingId = chatId ? streamingByChat[chatId] : undefined
  const streaming = !!streamingId

  const selectChat = React.useCallback(
    (id: string | null) =>
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (id) next.set('chatId', id)
        else next.delete('chatId')
        return next
      }),
    [setSearchParams],
  )

  React.useEffect(() => {
    if (!ready) void load()
  }, [ready, load])

  const lastMessageContent = messages.at(-1)?.content
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, lastMessageContent])

  const send = async (text: string, attachments?: ChatAttachment[]) => {
    const id = await sendMessage(chatId, text, attachments?.length ? attachments : undefined, profile)
    if (id) selectChat(id)
  }
  const liveScope = useLiveChatScope(chatId)
  // The chat the running call belongs to. A call started with no chat makes one on its first words, and keeps it.
  const callChat = React.useRef<string | null>(null)
  const chatIdRef = React.useRef(chatId)
  chatIdRef.current = chatId
  const activeChat = () => callChat.current ?? chatIdRef.current
  const transcript = useLiveTranscript(async (turn) => {
    const store = useAskSenseiStore.getState()
    let id = activeChat()
    if (!id) {
      id = (await store.createChat()).id
      liveScope.adopt(id)
      selectChat(id)
    }
    callChat.current = id
    await store.saveCallMessage(id, turn.id, turn.role, turn.text, undefined, turn.attachments ? { attachments: turn.attachments } : undefined)
  })
  const onLiveActive = (active: boolean) => {
    if (active) return
    callChat.current = null
    liveScope.release()
    transcript.reset()
  }
  const liveTools = React.useMemo(() => {
    if (!profile?.tools) return profile?.tools
    return {
      ...profile.tools,
      // The call starts with only the last few turns; this reads the rest, in full, when asked about it.
      readChat: createReadChatTool(() => snapshotOf(useAskSenseiStore.getState().messages[activeChat() ?? ''] ?? [])),
      ...(chatId && {
        deepAnswer: createDeepAnswerTool({
          chatId,
          history: () =>
            (useAskSenseiStore.getState().messages[chatId] ?? [])
              .map((message) => ({ role: message.role, content: message.content }))
              .filter((message) => message.content),
          onAnswer: (id, text) => void useAskSenseiStore.getState().saveCallMessage(chatId, id, 'assistant', text),
        }),
      }),
    }
    // `activeChat` only reads refs, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, profile?.tools])
  // A map, not the page: what is open and how to read it. The page itself is read with the tools only when a question needs it.
  const liveInstructions = [
    profile?.instructions,
    page &&
      `The user is browsing ${page}. The browser tools read and operate that page. You cannot see it up front: before you say what is on it, or act on it, read it with the browser tools. A question that has nothing to do with the page needs no tools.`,
    READ_CHAT_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join('\n\n')

  return (
    <LiveAurora as="section" className="flex h-full min-h-0 flex-col text-sm">
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div className="flex size-7 items-center justify-center rounded-full bg-primary/10">
          <img src={senseiLogo} alt="" className="size-5 brightness-0 dark:invert" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight">Sensei Browser Agent</p>
          <p className="text-[11px] text-muted-foreground">
            {streaming ? 'Working…' : page ? `Ready on ${new URL(page).hostname.replace(/^www\./, '')}` : 'Ready to browse with you'}
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" title="New browser chat" aria-label="New browser chat" onClick={() => selectChat(null)}>
          <PlusIcon />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {!messages.length && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <img src={senseiLogo} alt="" className="size-10 brightness-0 dark:invert" />
              <div>
                <p className="font-medium">What should we do?</p>
                <p className="mt-1 text-xs text-muted-foreground">Ask questions or get help while you browse.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {['Summarise this page', 'Find the key details', 'Help me compare options'].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => {
            const assistant = message.role === 'assistant'
            const isStreaming = message.id === streamingId
            const waiting = assistant && isStreaming && !message.content && !message.reasoning && !message.steps?.length
            return (
              <Message key={message.id} align={assistant ? 'start' : 'end'}>
                <MessageContent>
                  {assistant && !waiting && (
                    <>
                      {message.steps?.length ? (
                        <WorkedFor startedAt={message.createdAt} seconds={message.workedSeconds} running={isStreaming} />
                      ) : null}
                      <ChatReasoning
                        reasoning={message.reasoning}
                        steps={message.steps}
                        isStreaming={isStreaming}
                        duration={message.reasoningSeconds ?? message.workedSeconds}
                        toolCount={!message.steps?.length}
                        defaultOpen={false}
                        className="mb-2"
                      />
                    </>
                  )}
                  {waiting ? (
                    <p className="px-1 text-xs text-muted-foreground" role="status" aria-label="Sensei is replying">
                      <Shimmer duration={1}>Working…</Shimmer>
                    </p>
                  ) : assistant && !message.content ? null : message.content || assistant ? (
                    <Bubble variant={assistant ? 'muted' : 'default'}>
                      {assistant ? <Markdown>{message.content}</Markdown> : <span className="whitespace-pre-wrap">{message.content}</span>}
                    </Bubble>
                  ) : null}
                  {!assistant && <SentAttachments attachments={message.attachments} />}
                </MessageContent>
              </Message>
            )
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t p-2">
        <QueuedMessages chatId={chatId} />
        <WidgetComposer
          onSend={(text, attachments) => void send(text, attachments)}
          attachable
          attachSession={chatId ?? undefined}
          liveAttachments={() => (useAskSenseiStore.getState().messages[activeChat() ?? ''] ?? []).flatMap((message) => message.attachments ?? [])}
          streaming={streaming}
          onStop={() => stopReply(chatId)}
          placeholder="Ask Sensei about this page…"
          chatId={chatId}
          history={messages.filter((message) => message.role === 'user').map((message) => message.content)}
          liveScope={`${page ?? 'browser'}:${liveScope.chat}`}
          liveSession={`browser-${chatId ?? 'widget'}`}
          liveHistory={historyTail(snapshotOf(messages))}
          onLiveTranscript={transcript.push}
          onLiveActive={onLiveActive}
          liveTools={liveTools}
          liveInstructions={liveInstructions}
        />
      </div>
    </LiveAurora>
  )
}
