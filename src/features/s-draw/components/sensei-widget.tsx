import { HistoryIcon, PlusIcon, TerminalIcon, Trash2Icon, XIcon } from 'lucide-react'
import { type HTMLAttributes, useEffect, useRef, useState } from 'react'

import senseiLogo from '@/assets/sensei.svg'
import { ContextRing } from '@/components/context-ring'
import { QueuedMessages } from '@/components/queued-messages'
import { TypingDots } from '@/components/typing-dots'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UserBubble } from '@/components/user-bubble'
import { ChatReasoning } from '@/features/ask-sensei/components/chat-reasoning'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { TerminalPanel } from '@/features/ask-sensei/terminal/terminal-panel'
import { WidgetComposer } from '@/features/note/sensei-widget/WidgetComposer'
import { skillSuggestions } from '@/features/skills/suggest'

import { DRAW_CONTEXT_LIMIT, disposeDrawSensei, drawSandboxSession, sendDrawSensei, stopDrawSensei, useDrawRuns } from '../agent/agent'
import { drawChats } from '../agent/chats'
import { DEFAULT_DRAW_SKILLS } from '../agent/default-skills'
import { DRAW_WEBMCP_HELP, hasDrawWebMCP } from '../agent/webmcp'
import { useDrawStore } from '../s-draw.store'
import type { IDrawChat } from '../s-draw.types'
import { titleDrawSheet } from '../sheet-title'

interface SenseiWidgetProps {
  fileId: string
  chatId: string | null
  onChatChange: (id: string | null) => void
  title?: string
  context: () => string | Promise<string>
}

const mountedWidgets = new Map<string, number>()

export function SenseiWidget({ fileId, chatId, onChatChange, title = 'SDraw', context }: SenseiWidgetProps) {
  const [open, setOpen] = useState(!!chatId)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalPosition, setTerminalPosition] = useState<{ x: number; y: number } | null>(null)
  const terminal = useRef<HTMLDivElement>(null)
  const terminalDrag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const moveTerminal = (x: number, y: number) => {
    const rect = terminal.current?.getBoundingClientRect()
    if (!rect) return
    setTerminalPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    })
  }
  const terminalDragHandle: HTMLAttributes<HTMLDivElement> = {
    className: 'touch-none select-none cursor-grab active:cursor-grabbing',
    tabIndex: 0,
    'aria-label': 'Move terminal',
    onPointerDown: (event) => {
      if (event.button !== 0 || (event.target as Element).closest('button, a, input, select')) return
      const rect = terminal.current?.getBoundingClientRect()
      if (!rect) return
      terminalDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    },
    onPointerMove: (event) => {
      const drag = terminalDrag.current
      if (!drag || drag.pointerId !== event.pointerId) return
      moveTerminal(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)
    },
    onPointerUp: () => {
      terminalDrag.current = null
    },
    onPointerCancel: () => {
      terminalDrag.current = null
    },
    onLostPointerCapture: () => {
      terminalDrag.current = null
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-16, 0],
        ArrowRight: [16, 0],
        ArrowUp: [0, -16],
        ArrowDown: [0, 16],
      }
      const delta = directions[event.key]
      const rect = terminal.current?.getBoundingClientRect()
      if (!delta || !rect) return
      event.preventDefault()
      moveTerminal(rect.left + delta[0], rect.top + delta[1])
    },
  }

  useEffect(() => {
    if (!terminalOpen) return
    const keepVisible = () => {
      const rect = terminal.current?.getBoundingClientRect()
      if (rect) moveTerminal(rect.left, rect.top)
    }
    const observer = new ResizeObserver(keepVisible)
    if (terminal.current) observer.observe(terminal.current)
    window.addEventListener('resize', keepVisible)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', keepVisible)
      terminalDrag.current = null
    }
  }, [terminalOpen])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chats, setChats] = useState<IDrawChat[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [error, setError] = useState('')
  const live = useDrawRuns((state) => state.live)
  const recent = useDrawRuns((state) => state.recent)
  const saved = useDrawRuns((state) => state.saved)
  const end = useRef<HTMLDivElement>(null)
  const candidate = (chatId && (live[chatId] || recent[chatId])) || chats.find((chat) => chat.id === chatId)
  const chat = candidate?.fileId === fileId ? candidate : null
  const missingChat = !!chatId && historyLoaded && !chat
  const busy = !!chat && !!live[chat.id]
  const messages = chat?.messages ?? []
  const liveTranscript = useRef<{ role: 'user' | 'assistant' | null; id: string }>({ role: null, id: '' })
  const voiceChatId = useRef<string | null>(chatId)
  const voiceChat = useRef<IDrawChat | null>(chat)
  useEffect(() => {
    liveTranscript.current = { role: null, id: '' }
    voiceChatId.current = chatId
    voiceChat.current = chat
  }, [chatId])
  const onLiveTranscript = (role: 'user' | 'assistant' | 'thought', text: string) => {
    if (role === 'thought') return
    const idForTranscript = voiceChatId.current ?? crypto.randomUUID()
    if (!voiceChatId.current) {
      voiceChatId.current = idForTranscript
      onChatChange(idForTranscript)
    }
    if (liveTranscript.current.role !== role) liveTranscript.current = { role, id: crypto.randomUUID() }
    const id = liveTranscript.current.id
    const apply = (saved: IDrawChat | undefined) => {
      const base = voiceChat.current ?? saved ?? { id: idForTranscript, fileId, title: 'Voice call', messages: [], updatedAt: Date.now() }
      const existing = base.messages.find((message) => message.id === id)
      const next = existing
        ? base.messages.map((message) => (message.id === id ? { ...message, content: `${message.content}${text}` } : message))
        : [...base.messages, { id, role, content: text }]
      const updated = { ...base, messages: next, updatedAt: Date.now() }
      voiceChat.current = updated
      void drawChats.put(updated)
      useDrawRuns.setState((state) => ({ ...state, saved: state.saved + 1 }))
    }
    if (voiceChat.current) apply(voiceChat.current)
    else void drawChats.get(fileId, idForTranscript).then(apply)
  }
  const supported = hasDrawWebMCP()
  const send = (text: string) => {
    if (chatId && !chat) return
    const sheetId = useDrawStore.getState().activeId
    void sendDrawSensei(text, chat, context, fileId, onChatChange)
      .then(() => {
        if (!busy) return titleDrawSheet(fileId, sheetId, text, true)
      })
      .catch(() => {})
  }

  useEffect(() => {
    mountedWidgets.set(fileId, (mountedWidgets.get(fileId) ?? 0) + 1)
    return () => {
      mountedWidgets.set(fileId, (mountedWidgets.get(fileId) ?? 1) - 1)
      queueMicrotask(() => {
        if (!mountedWidgets.get(fileId)) {
          mountedWidgets.delete(fileId)
          disposeDrawSensei(fileId)
        }
      })
    }
  }, [fileId])

  useEffect(() => {
    let mounted = true
    void drawChats
      .all(fileId)
      .then((chats) => {
        if (mounted) {
          setChats(chats)
          setHistoryLoaded(true)
        }
      })
      .catch((error: unknown) => mounted && setError(String(error)))
    return () => {
      mounted = false
    }
  }, [saved, fileId])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [open, messages.length])

  return (
    <>
      {terminalOpen && (
        <div
          ref={terminal}
          style={terminalPosition ? { left: terminalPosition.x, top: terminalPosition.y, bottom: 'auto' } : undefined}
          className="fixed bottom-20 left-4 z-[60] w-[min(760px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-background shadow-2xl"
          aria-label="SDraw floating terminal"
        >
          <TerminalPanel chatId={drawSandboxSession(fileId)} onClose={() => setTerminalOpen(false)} dragHandleProps={terminalDragHandle} />
        </div>
      )}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
        {open && (
          <section
            aria-label="SDraw Sensei"
            className="flex h-[min(600px,calc(100svh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b px-3 py-2">
              <img src={senseiLogo} alt="" className="size-6 brightness-0 dark:invert" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Sensei</div>
                <div className="truncate text-xs text-muted-foreground">{title}</div>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={terminalOpen ? 'Close SDraw terminal' : 'Open SDraw terminal'}
                aria-expanded={terminalOpen}
                title="Agent terminal"
                onClick={() => setTerminalOpen((open) => !open)}
              >
                <TerminalIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="New drawing chat"
                onClick={() => {
                  onChatChange(null)
                  setHistoryOpen(false)
                }}
              >
                <PlusIcon />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Drawing chat history" onClick={() => setHistoryOpen((open) => !open)}>
                <HistoryIcon />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Close Sensei" onClick={() => setOpen(false)}>
                <XIcon />
              </Button>
            </header>
            {historyOpen && (
              <div className="max-h-48 overflow-y-auto border-b p-2">
                {!chats.length && <p className="p-2 text-xs text-muted-foreground">No chats yet</p>}
                {chats.map((item) => (
                  <div key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded p-2 text-left text-xs hover:bg-muted"
                      onClick={() => {
                        onChatChange(item.id)
                        setHistoryOpen(false)
                      }}
                    >
                      {item.title}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${item.title}`}
                      disabled={!!live[item.id]}
                      onClick={() => {
                        void drawChats
                          .remove(fileId, item.id)
                          .then(async () => {
                            setChats(await drawChats.all(fileId))
                            if (chatId === item.id) onChatChange(null)
                          })
                          .catch((error: unknown) => setError(String(error)))
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-3 p-3">
                {!supported && (
                  <p role="status" className="rounded-md border p-2 text-xs text-muted-foreground">
                    {DRAW_WEBMCP_HELP}
                  </p>
                )}
                {missingChat && (
                  <p role="alert" className="text-xs text-destructive">
                    This chat was not found in this drawing file. Start a new chat or choose one from history.
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                )}
                {!messages.length && (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <img src={senseiLogo} alt="" className="size-10 brightness-0 dark:invert" />
                    <p className="text-sm text-muted-foreground">
                      Ask me to draw or edit. Select part of your drawing to focus on that region.
                    </p>
                    {['Draw a simple flowchart', 'Explain this drawing'].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={!supported || (!!chatId && !chat)}
                        className="rounded-full border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        onClick={() => send(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((message) =>
                  message.role === 'user' ? (
                    <div key={message.id} className="flex justify-end">
                      <UserBubble text={message.content} />
                    </div>
                  ) : (
                    <div key={message.id} className="mr-3 text-sm">
                      <ChatReasoning
                        reasoning={message.reasoning}
                        steps={message.steps}
                        isStreaming={busy && message === messages.at(-1)}
                        defaultOpen={false}
                      />
                      {message.content && <Markdown>{message.content}</Markdown>}
                      {message.error && (
                        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          {message.error}
                        </p>
                      )}
                      {!message.error && busy && message === messages.at(-1) && !message.reasoning && !message.steps?.length && (
                        <TypingDots />
                      )}
                    </div>
                  ),
                )}
                <div ref={end} />
              </div>
            </ScrollArea>
            <div className="border-t p-2">
              <QueuedMessages chatId={chatId} />
              <WidgetComposer
                placeholder="Ask Sensei to draw… (/ for skills)"
                chatId={chatId}
                history={messages.filter((message) => message.role === 'user').map((message) => message.content)}
                onSend={send}
                suggest={(trigger, query) => ({
                  title: 'SDraw skills',
                  items:
                    trigger === '/'
                      ? skillSuggestions(DEFAULT_DRAW_SKILLS, query).map((item) => ({ ...item, hint: `SDraw default · ${item.hint}` }))
                      : [],
                })}
                streaming={busy}
                disabled={!supported || (!!chatId && !chat)}
                onStop={() => chat && stopDrawSensei(chat.id)}
                autoFocus
                liveScope={`${fileId}:${chatId ?? 'new'}`}
                liveSession={drawSandboxSession(fileId)}
                liveHistory={messages.map((message) => `${message.role === 'user' ? 'User' : 'Sensei'}: ${message.content}`).join('\n')}
                onLiveTranscript={onLiveTranscript}
                toolbarStart={
                  <ContextRing
                    used={
                      messages.at(-1)?.contextTokens ?? Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / 4)
                    }
                    max={DRAW_CONTEXT_LIMIT}
                  />
                }
              />
            </div>
          </section>
        )}
        <button
          type="button"
          aria-label={open ? 'Close drawing assistant' : 'Ask Sensei about drawing'}
          aria-expanded={open}
          onClick={() => setOpen((open) => !open)}
          className="relative flex size-14 items-center justify-center rounded-full border bg-background shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {open ? <XIcon className="size-6" /> : <img src={senseiLogo} alt="Sensei" className="size-8 brightness-0 dark:invert" />}
          {!open && Object.values(live).some((chat) => chat.fileId === fileId) && (
            <TypingDots className="absolute -top-1 -right-1 rounded-full border bg-background px-1" />
          )}
        </button>
      </div>
    </>
  )
}
