import { PlusIcon } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import senseiLogo from '@/assets/sensei.svg'
import { Bubble, Message, MessageContent } from '@/components/ui/chat'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import { WidgetComposer } from '@/features/note/sensei-widget/WidgetComposer'
import { cn } from '@/lib/utils'

/** The browser assistant uses the same streaming Sensei runtime as S3D and Ask Sensei. */
export function BrowserAgentPanel({ page }: { page: string | null }) {
  const ready = useAskSenseiStore((state) => state.ready)
  const messagesByChat = useAskSenseiStore((state) => state.messages)
  const streamingId = useAskSenseiStore((state) => state.streamingId)
  const load = useAskSenseiStore((state) => state.load)
  const sendMessage = useAskSenseiStore((state) => state.sendMessage)
  const stopReply = useAskSenseiStore((state) => state.stopReply)
  // The agent chat lives in the URL (?chatId=), next to ?sessionId=, so it can be reopened from a link.
  const [searchParams, setSearchParams] = useSearchParams()
  const chatId = searchParams.get('chatId')
  const endRef = React.useRef<HTMLDivElement>(null)
  const messages = chatId ? (messagesByChat[chatId] ?? []) : []
  const streaming = !!streamingId && messages.some((message) => message.id === streamingId)

  const selectChat = React.useCallback(
    (id: string | null) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (id) next.set('chatId', id)
          else next.delete('chatId')
          return next
        },
      ),
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
    const context = page ? `I am using the SBrowse browser on ${page}. ` : 'I am using the SBrowse browser. '
    const id = await sendMessage(chatId, `${context}${text}`)
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
                    onClick={() => setDraft(suggestion)}
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
            const waiting = assistant && message.id === streamingId && !message.content && !message.reasoning
            return (
              <Message key={message.id} align={assistant ? 'start' : 'end'}>
                <MessageContent>
                  {waiting ? (
                    <Bubble variant="muted" className="flex gap-1 py-3" role="status" aria-label="Sensei is replying">
                      <i className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-.2s]" />
                      <i className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-.1s]" />
                      <i className="size-1.5 animate-bounce rounded-full bg-current" />
                    </Bubble>
                  ) : (
                    <Bubble variant={assistant ? 'muted' : 'default'}>
                      {assistant ? message.content : <span className="whitespace-pre-wrap">{message.content}</span>}
                    </Bubble>
                  )}
                  {assistant && message.reasoning && !message.content && <p className="mt-1 px-2 text-xs text-muted-foreground">Thinking…</p>}
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
          onStop={stopReply}
          placeholder="Ask Sensei about this page…"
          history={messages.filter((message) => message.role === 'user').map((message) => message.content)}
        />
      </div>
    </section>
  )
}
