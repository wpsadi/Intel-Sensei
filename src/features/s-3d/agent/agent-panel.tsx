import { useEffect, useRef, useState } from 'react'
import { AlertCircleIcon, HistoryIcon, PaperclipIcon, PlusIcon, Trash2Icon, Undo2Icon, XIcon } from 'lucide-react'
import senseiLogo from '@/assets/sensei.svg'
import { Button } from '@/components/ui/button'
import { TypingDots } from '@/components/typing-dots'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatReasoning } from '@/features/ask-sensei/components/chat-reasoning'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { WidgetComposer } from '@/features/note/sensei-widget/WidgetComposer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { chatsRepo } from '../db'
import { pickFiles, storeFile } from '../files'
import { useS3D } from '../store'
import type { AgentAttachment, AgentChat, AgentMessage } from '../types'
import { runAgent, stopAgent, useAgentRun } from './runner'

const SUGGESTIONS = ['Model a low-poly tree on a grassy island', 'Make a modern desk lamp', 'Build a cozy room with a sofa and a table', 'Put a 3D product hero inside a landing page']

/**
 * The design agent in the S3D left sidebar, laid out like the S-Note Sensei widget:
 * thinking, tool calls and the reply stream into one message, and chats are saved per file.
 * The run itself lives in `runner.ts` (model calls in a worker), so it carries on while this panel is closed.
 */
export function AgentPanel() {
  const docId = useS3D((s) => s.doc.id)
  const selection = useS3D((s) => s.selection)
  const nodes = useS3D((s) => s.doc.nodes)
  const live = useAgentRun((s) => s.live)
  const historyLength = useS3D((s) => s.past.length)
  const viewedId = useAgentRun((s) => s.viewedId)
  const saved = useAgentRun((s) => s.saved)
  const [chats, setChats] = useState<AgentChat[]>([])
  const [attachments, setAttachments] = useState<AgentAttachment[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const chat = (viewedId && live[viewedId]) || (chats.find((c) => c.id === viewedId) ?? null)
  const setViewed = (id: string | null) => useAgentRun.setState({ viewedId: id })

  useEffect(() => {
    void chatsRepo.list(docId).then(setChats)
  }, [docId, saved])

  // Another file's chat is not shown here, unless it is the one still generating.
  useEffect(() => {
    const { viewedId, live } = useAgentRun.getState()
    if (viewedId && !live[viewedId]) void chatsRepo.list(docId).then((list) => !list.some((c) => c.id === viewedId) && setViewed(null))
  }, [docId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [chat?.messages])

  const run = (text: string, files: AgentAttachment[], base?: AgentChat) => {
    setAttachments([])
    void runAgent(text, files, base ?? chat, docId)
  }

  const persist = async (c: AgentChat) => {
    await chatsRepo.put(c)
    useAgentRun.setState((s) => ({ saved: s.saved + 1 }))
  }

  const retry = (msg: AgentMessage) => {
    if (!chat) return
    const i = chat.messages.findIndex((m) => m.id === msg.id)
    const user = chat.messages[i - 1]
    if (!user) return
    run(user.text, user.attachments ?? [], { ...chat, messages: chat.messages.slice(0, i - 1) })
  }

  // A reply's edits undo together only while nothing else has been added to the history after them.
  const canUndo = (m: AgentMessage) => m.changesEnd === undefined || historyLength === m.changesEnd
  const undo = async (msg: AgentMessage) => {
    if (!canUndo(msg)) return
    const st = useS3D.getState()
    if (msg.changesEnd === undefined) st.undo()
    else while (useS3D.getState().past.length > msg.changes!) useS3D.getState().undo()
    if (chat) await persist({ ...chat, messages: chat.messages.map((m) => (m.id === msg.id ? { ...m, changes: undefined, text: m.text + '\n\n_Undone._' } : m)) })
  }

  const attach = async () => {
    const files = await pickFiles('image/*,video/*,application/pdf,.svg,.glb,.gltf', true)
    const added = await Promise.all(files.map(async (f) => ({ ref: await storeFile(f, f.name, docId), name: f.name, type: f.type })))
    setAttachments((a) => [...a, ...added])
  }

  const selNames = selection.map((id) => nodes[id]?.name).filter(Boolean)
  const last = chat?.messages.at(-1)
  const generating = !!chat && !!live[chat.id]

  return (
        <section className="flex h-full min-h-0 flex-col text-sm">
          <header className="flex items-center justify-end gap-1 border-b px-2 py-1">
            <Button variant="ghost" size="icon-xs" title="New chat" onClick={() => setViewed(null)}><PlusIcon /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" title="Chat history" />}><HistoryIcon /></DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
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
                          await chatsRepo.remove(c.id)
                          setChats(await chatsRepo.list(docId))
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
          </header>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 p-3">
              {!chat?.messages.length && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <img src={senseiLogo} alt="" className="size-10 brightness-0 dark:invert" />
                  <p className="text-sm text-muted-foreground">Describe a screen, layout or edit. The agent builds it on the canvas.</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => run(s, [])} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {chat?.messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="ml-8 self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                    {m.text}
                    {!!m.attachments?.length && <div className="mt-1 text-xs opacity-80">📎 {m.attachments.map((a) => a.name).join(', ')}</div>}
                  </div>
                ) : (
                  <div key={m.id} className="mr-4 flex flex-col text-sm">
                    <ChatReasoning reasoning={m.reasoning} steps={m.steps} isStreaming={generating && m === last && !m.text} duration={m.reasoningSeconds} defaultOpen={false} className="mb-0" />
                    {m.text ? <Markdown>{m.text}</Markdown> : !m.error && generating && m === last && !m.reasoning && !m.steps?.length && <TypingDots className="h-3" />}
                    {m.error && (
                      <div className="flex flex-col gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <div className="flex gap-1"><AlertCircleIcon className="size-3.5 shrink-0" />{m.error}</div>
                        <Button variant="outline" size="xs" className="self-start" onClick={() => retry(m)} disabled={generating}>Retry</Button>
                      </div>
                    )}
                    {m.changes !== undefined && (
                      <Button variant="ghost" size="xs" className="mt-1 self-start" onClick={() => void undo(m)} disabled={!canUndo(m)} title={canUndo(m) ? undefined : 'Other edits were made since; use Undo in the menu instead'}><Undo2Icon />Undo changes</Button>
                    )}
                  </div>
                ),
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Keys typed here must not reach the canvas shortcuts. */}
          <div className="flex flex-col gap-1.5 border-t p-2" onKeyDown={(e) => e.stopPropagation()}>
            {(selNames.length > 0 || attachments.length > 0) && (
              <div className="flex flex-wrap gap-1 text-xs">
                {selNames.slice(0, 2).map((n, i) => <span key={i} className="max-w-24 truncate rounded-full bg-accent px-2 py-0.5">{n}</span>)}
                {selNames.length > 2 && <span className="rounded-full bg-accent px-2 py-0.5">+{selNames.length - 2}</span>}
                {attachments.map((a) => (
                  <span key={a.ref} className="flex max-w-28 items-center gap-0.5 rounded-full border px-2 py-0.5">
                    <span className="truncate">{a.name}</span>
                    <button type="button" aria-label="Remove" onClick={() => setAttachments((x) => x.filter((y) => y.ref !== a.ref))}><XIcon className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <WidgetComposer
              onSend={(text) => run(text, attachments)}
              streaming={generating}
              onStop={() => chat && stopAgent(chat.id)}
              placeholder={selNames.length ? 'Edit the selection…' : 'Ask the agent to design…'}
              toolbarStart={<Button variant="ghost" size="icon-sm" className="mr-auto" aria-label="Attach files" onClick={() => void attach()}><PaperclipIcon /></Button>}
            />
          </div>
        </section>
  )
}
