import { LoaderIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import senseiLogo from '@/assets/sensei.svg'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { ChatSearches } from '@/features/ask-sensei/components/chat-searches'
import { ChatToolSteps } from '@/features/ask-sensei/components/chat-tool-steps'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { pageTitle } from '../editor/nodes/pages'
import { useNoteStore } from '../note.store'
import type { ChatSearch, ChatToolStep } from '../db/types'
import type { NoteToolContext } from '../webmcp/note-tools'
import { runSensei } from './agent'
import { WidgetComposer } from './WidgetComposer'

interface WidgetMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  /** Seconds Sensei thought before its first words. */
  reasoningSeconds?: number
  steps?: ChatToolStep[]
  searches?: ChatSearch[]
  error?: string
}

const SUGGESTIONS = ['Summarize this note', 'How many blocks are on this page?', 'Add a to-do list of next steps']

/**
 * Floating Sensei chat in the bottom-right of S-Note. Sensei works on the user's notes through the WebMCP
 * tools, so the chat is also a live test of them. The conversation lasts until the page reloads.
 */
export function SenseiWidget() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const currentPageId = matchPath('/s-note/:pageId', pathname)?.params.pageId
  const noteTitle = useNoteStore((s) => (currentPageId && s.pages[currentPageId] ? pageTitle(s.pages[currentPageId].title) : undefined))

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Tools read the latest route when they run, so a reply that opens another note keeps working on it.
  const ctx = useRef<NoteToolContext>({ go: navigate })
  ctx.current = { currentPageId, go: navigate }

  // Braces matter: Chrome's scrollIntoView returns a promise, and an effect may only return a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, open])

  const patchLast = (patch: Partial<WidgetMessage>) =>
    setMessages((list) => list.map((m, i) => (i === list.length - 1 ? { ...m, ...patch } : m)))

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const apiKey = GEMINI_KEY.value
    const history = [...messages, { id: crypto.randomUUID(), role: 'user' as const, content: question }]
    setMessages([...history, { id: crypto.randomUUID(), role: 'assistant', content: '' }])
    if (!apiKey) {
      patchLast({ error: 'Add your Gemini API key in Settings first.' })
      return
    }

    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    const started = Date.now()
    let thinking = true
    try {
      const reply = await runSensei({
        apiKey,
        messages: history.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
        ctx: () => ctx.current,
        noteTitle,
        onText: (soFar) => {
          // Thinking is over once the first words arrive.
          if (thinking) {
            thinking = false
            patchLast({ reasoningSeconds: Math.max(1, Math.round((Date.now() - started) / 1000)) })
          }
          patchLast({ content: soFar })
        },
        onReasoning: (reasoning) => patchLast({ reasoning }),
        onSteps: (steps) => patchLast({ steps }),
        onSearches: (searches) => patchLast({ searches }),
        signal: controller.signal,
      })
      patchLast({ content: reply || (controller.signal.aborted ? 'Stopped.' : 'Done.') })
    } catch (error) {
      if (!controller.signal.aborted) patchLast({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

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
            <Button variant="ghost" size="icon-xs" title="Clear chat" disabled={busy || !messages.length} onClick={() => setMessages([])}>
              <Trash2Icon />
            </Button>
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
                      <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="ml-8 self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                    {m.content}
                  </div>
                ) : (
                  <div key={m.id} className="mr-4 flex flex-col text-sm">
                    {m.reasoning && (
                      <Reasoning isStreaming={busy && m === messages.at(-1) && !m.content} duration={m.reasoningSeconds} defaultOpen={false} className="mb-0">
                        <ReasoningTrigger />
                        <ReasoningContent>{m.reasoning}</ReasoningContent>
                      </Reasoning>
                    )}
                    {!!m.searches?.length && <ChatSearches searches={m.searches} defaultOpen={false} className="mb-0" />}
                    {!!m.steps?.length && <ChatToolSteps steps={m.steps} defaultOpen={false} className="mb-0" />}
                    {m.content ? <Markdown>{m.content}</Markdown> : !m.error && busy && <LoaderIcon className="size-4 animate-spin text-muted-foreground" />}
                    {m.error && <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{m.error}</p>}
                  </div>
                ),
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-2">
            <WidgetComposer onSend={(text) => void send(text)} streaming={busy} onStop={() => abortRef.current?.abort()} autoFocus={open} />
          </div>
        </section>
      )}

      <button
        type="button"
        title={open ? 'Close Sensei' : 'Ask Sensei'}
        onClick={() => setOpen((v) => !v)}
        className="flex size-14 items-center justify-center rounded-full border bg-background shadow-lg transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {open ? <XIcon className="size-6 text-foreground" /> : <img src={senseiLogo} alt="Sensei" className="size-8 brightness-0 dark:invert" />}
      </button>
    </div>
  )
}
