import { PlusIcon } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import type { ChatProfile } from '@/ai/inference/chat-profile'
import senseiLogo from '@/assets/sensei.svg'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { Bubble, Message, MessageContent } from '@/components/ui/chat'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import { ChatReasoning } from '@/features/ask-sensei/components/chat-reasoning'
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

  const send = async (text: string) => {
    const id = await sendMessage(chatId, text, undefined, profile)
    if (id) selectChat(id)
  }

  return (
    <section className="flex h-full min-h-0 flex-col text-sm">
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
                        isStreaming={isStreaming && !message.content}
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
                  ) : assistant && !message.content ? null : (
                    <Bubble variant={assistant ? 'muted' : 'default'}>
                      {assistant ? <Markdown>{message.content}</Markdown> : <span className="whitespace-pre-wrap">{message.content}</span>}
                    </Bubble>
                  )}
                </MessageContent>
              </Message>
            )
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t p-2">
        <WidgetComposer
          onSend={(text) => void send(text)}
          streaming={streaming}
          onStop={() => stopReply(chatId)}
          placeholder="Ask Sensei about this page…"
          history={messages.filter((message) => message.role === 'user').map((message) => message.content)}
        />
      </div>
    </section>
  )
}
