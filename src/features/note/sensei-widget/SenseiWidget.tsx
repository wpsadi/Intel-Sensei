import { HistoryIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'

import { AI_MODELS } from '@/ai/providers'
import { warmSandbox } from '@/ai/sandbox/client'
import { useInstalledSkills } from '@/ai/skills/skills'
import senseiLogo from '@/assets/sensei.svg'
import { ContextRing } from '@/components/context-ring'
import { QueuedMessages } from '@/components/queued-messages'
import { CopyMessage, ReplyActions } from '@/components/reply-actions'
import { TypingDots } from '@/components/typing-dots'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UserBubble } from '@/components/user-bubble'
import { SNOTE_AGENT_CONTEXT_LIMIT } from '@/constants/ai'
import { ChatReasoning } from '@/features/ask-sensei/components/chat-reasoning'
import { ChatSearches } from '@/features/ask-sensei/components/chat-searches'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { skillSuggestions } from '@/features/skills/suggest'

import { widgetChatsRepo } from '../db/repo'
import type { WidgetChat } from '../db/types'
import { pageTitle } from '../editor/nodes/page-utils'
import { useNoteStore } from '../note.store'
import { compactSenseiChat, sendSensei, setNoteContext, stopSensei, useSenseiRuns } from './agent'
import { WidgetComposer } from './WidgetComposer'

const SUGGESTIONS = ['Summarize this note', 'How many blocks are on this page?', 'Add a to-do list of next steps']

/**
 * Floating Sensei chat in the bottom-right of S-Note. Sensei works on the user's notes through the WebMCP
 * tools, so the chat is also a live test of them. Chats are saved and listed in the history; replies run in a worker
 * and keep going while the widget is closed.
 */
export function SenseiWidget() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const currentPageId = matchPath('/s-note/:pageId', pathname)?.params.pageId
  // The Python environment starts in the background on every load, so it is ready when Sensei needs it.
  useEffect(() => warmSandbox(), [])
  // Typing / lists the skills every app shares.
  const skills = useInstalledSkills()
  const openSkillSettings = () => {
    const params = new URLSearchParams(window.location.search)
    params.set('settings', 'open')
    params.set('section', 'skills')
    navigate({ search: `?${params}` })
  }
  const noteTitle = useNoteStore((s) => (currentPageId && s.pages[currentPageId] ? pageTitle(s.pages[currentPageId].title) : undefined))

  const [open, setOpen] = useState(false)
  const live = useSenseiRuns((s) => s.live)
  const viewedId = useSenseiRuns((s) => s.viewedId)
  const saved = useSenseiRuns((s) => s.saved)
  const [chats, setChats] = useState<WidgetChat[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const chat = (viewedId && live[viewedId]) || (chats.find((c) => c.id === viewedId) ?? null)
  const messages = chat?.messages ?? []
  const usage = [...messages].reverse().find((m) => m.contextTokens)
  const busy = !!chat && !!live[chat.id]
  const anyBusy = Object.keys(live).length > 0
  const setViewed = (id: string | null) => useSenseiRuns.setState({ viewedId: id })

  setNoteContext({ currentPageId, go: navigate })

  useEffect(() => {
    void widgetChatsRepo.all().then(setChats)
  }, [saved])

  // Braces matter: Chrome's scrollIntoView returns a promise, and an effect may only return a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [open])

  const send = (text: string) => void sendSensei(text, chat, noteTitle)

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <section className="flex h-[min(600px,calc(100svh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <header className="flex items-center gap-2 border-b px-3 py-2">
            <span className="flex size-8 items-center justify-center rounded-full border bg-background">
              <img src={senseiLogo} alt="" className="size-5 brightness-0 dark:invert" />
            </span>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="text-sm font-medium">Sensei</span>
              <span className="truncate text-xs text-muted-foreground">{noteTitle ? `On “${noteTitle}”` : 'S-Note assistant'}</span>
            </div>
            <Button variant="ghost" size="icon-xs" title="New chat" onClick={() => setViewed(null)}>
              <PlusIcon />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" title="Chat history" />}>
                <HistoryIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="z-[60] w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>History</DropdownMenuLabel>
                  {chats.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No chats yet</div>}
                  {chats.map((c) => (
                    <DropdownMenuItem key={c.id} className="normal-case tracking-normal" onClick={() => setViewed(c.id)}>
                      <span className="flex-1 truncate">{c.title || 'Untitled'}</span>
                      {live[c.id] && <TypingDots className="mb-1" />}
                      <button
                        type="button"
                        aria-label="Delete chat"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                        disabled={!!live[c.id]}
                        onClick={async (e) => {
                          e.stopPropagation()
                          await widgetChatsRepo.remove(c.id)
                          setChats(await widgetChatsRepo.all())
                          if (viewedId === c.id) setViewed(null)
                        }}
                      >
                        <Trash2Icon className="size-3" />
                      </button>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-xs" title="Close" onClick={() => setOpen(false)}>
              <XIcon />
            </Button>
          </header>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 p-3">
              {!messages.length && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <img src={senseiLogo} alt="" className="size-10 brightness-0 dark:invert" />
                  <p className="text-sm text-muted-foreground">Ask me to read, write or organize your notes.</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="group/user flex flex-col items-end">
                    <UserBubble text={m.content} />
                    <CopyMessage text={m.content} />
                  </div>
                ) : (
                  <div key={m.id} className="mr-4 flex flex-col text-sm">
                    <ChatReasoning
                      reasoning={m.reasoning}
                      steps={m.steps}
                      isStreaming={busy && m === messages.at(-1) && !m.content}
                      duration={m.reasoningSeconds}
                      defaultOpen={false}
                      className="mb-0"
                    />
                    {!!m.searches?.length && <ChatSearches searches={m.searches} defaultOpen={false} className="mb-0" />}
                    {m.content ? (
                      <div id={`tts-${m.id}`}>
                        <Markdown>{m.content}</Markdown>
                      </div>
                    ) : (
                      !m.error &&
                      busy &&
                      m === messages.at(-1) &&
                      !m.reasoning &&
                      !m.steps?.length &&
                      !m.searches?.length && <TypingDots className="h-3" />
                    )}
                    {m.error && <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{m.error}</p>}
                    {m.content && !(busy && m === messages.at(-1)) && <ReplyActions text={m.content} speakId={`tts-${m.id}`} />}
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-2">
            <QueuedMessages chatId={chat?.id ?? null} />
            <WidgetComposer
              onSend={send}
              suggest={(trigger, query) => ({
                title: 'Skills',
                items: trigger === '/' ? skillSuggestions(skills, query, openSkillSettings) : [],
              })}
              streaming={busy}
              onStop={() => chat && stopSensei(chat.id)}
              autoFocus={open}
              toolbarStart={
                <div className="mr-auto">
                  <ContextRing
                    onCompact={async () => chat && compactSenseiChat(chat)}
                    compactDisabled={!messages.length ? 'Nothing to compact yet' : busy ? 'Wait for the reply to finish' : undefined}
                    used={
                      chat?.summary
                        ? Math.ceil(chat.summary.text.length / 4) + 1500
                        : (usage?.contextTokens ?? Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4))
                    }
                    max={SNOTE_AGENT_CONTEXT_LIMIT}
                    modelId={AI_MODELS.chatId}
                    compactions={messages.reduce((n, m) => n + (m.compactions ?? 0), 0)}
                  />
                </div>
              }
            />
          </div>
        </section>
      )}

      <button
        type="button"
        title={open ? 'Close Sensei' : 'Ask Sensei'}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-14 items-center justify-center rounded-full border bg-background shadow-lg transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {open ? (
          <XIcon className="size-6 text-foreground" />
        ) : (
          <img src={senseiLogo} alt="Sensei" className="size-8 brightness-0 dark:invert" />
        )}
        {/* Replies keep going while the widget is closed. */}
        {!open && anyBusy && <TypingDots className="absolute -top-1 -right-1 h-4 rounded-full border bg-background px-1 pb-0.5" />}
      </button>
    </div>
  )
}
