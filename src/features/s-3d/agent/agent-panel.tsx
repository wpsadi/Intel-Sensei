import {
  AlertCircleIcon,
  ChevronDownIcon,
  HistoryIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AI_MODELS } from '@/ai/providers'
import { warmForFiles } from '@/ai/sandbox/attachments'
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
import { S3D_AGENT_CONTEXT_LIMIT } from '@/constants/ai'
import { ChatPlanCard, ChatTodoQueue } from '@/features/ask-sensei/components/chat-plan'
import { ChatReasoning } from '@/features/ask-sensei/components/chat-reasoning'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { type ComposerSuggestion, WidgetComposer } from '@/features/note/sensei-widget/WidgetComposer'

import { chatsRepo } from '../db'
import { pickFiles, storeFile } from '../files'
import { sceneOf } from '../render/scene3d'
import { useS3D } from '../store'
import type { AgentAttachment, AgentChat, AgentMessage } from '../types'
import { ApprovalDock } from './approval-dock'
import { QuestionsDock } from './ask-questions'
import { useAsking } from './ask-questions-store'
import { GoalBanner, VerificationCards } from './goal-ui'
import { type AgentMode, MODES, clearApprovals, loadApprovals, useAgentMode, useApprovals } from './modes'
import { compactChat, runAgent, stopAgent, useAgentRun } from './runner'
import { WorkedFor, WorkingNow } from './worked-for'

/** Slash commands the chat box offers. */
const COMMANDS = [{ id: 'goal', hint: 'Keep working until a goal is achieved' }]

interface Element {
  id: string
  name: string
  kind: string
  sceneId?: string
}

/** What @ can point at: the objects of the open 3D scene, otherwise the layers on the current page. */
function elements(): Element[] {
  const st = useS3D.getState()
  const open = st.sceneEdit
  const node = open && st.doc.nodes[open.nodeId]
  if (node)
    return sceneOf(node).objects.map((o) => ({
      id: o.id,
      name: o.name,
      kind: o.geometry ? `${o.kind} · ${o.geometry}` : o.kind,
      sceneId: node.id,
    }))
  const out: Element[] = []
  const walk = (ids: string[]) =>
    ids.forEach((id) => {
      const n = st.doc.nodes[id]
      if (!n) return
      out.push({ id: n.id, name: n.name, kind: n.type })
      walk(n.children)
    })
  walk(st.doc.pages.find((p) => p.id === st.pageId)?.children ?? [])
  return out
}

const squash = (v: string) => v.toLowerCase().replace(/\s+/g, '')

function suggest(trigger: '/' | '@', query: string): { title: string; items: ComposerSuggestion[] } {
  const q = squash(query)
  if (trigger === '/') {
    return {
      title: 'Slash Commands',
      items: COMMANDS.filter((c) => c.id.startsWith(q)).map((c) => ({ id: c.id, label: `/${c.id}`, hint: c.hint, insert: `/${c.id}` })),
    }
  }
  const all = elements().filter((e) => squash(e.name).includes(q))
  all.sort((a, b) => Number(squash(b.name).startsWith(q)) - Number(squash(a.name).startsWith(q)))
  return { title: 'Elements', items: all.slice(0, 30).map((e) => ({ id: e.id, label: e.name, hint: e.kind, insert: `@${e.name}` })) }
}

/** The elements @mentioned in a message, with their ids, for the model (the chat shows only what the user typed). */
function mentionContext(text: string) {
  const lower = text.toLowerCase()
  const hit = elements()
    .filter((e) => e.name && lower.includes(`@${e.name.toLowerCase()}`))
    .sort((a, b) => b.name.length - a.name.length)
  if (!hit.length) return undefined
  return `Elements the user pointed at with @ (use these ids):\n${hit.map((e) => `- "${e.name}" id=${e.id} [${e.kind}]${e.sceneId ? ` in 3D scene sceneId=${e.sceneId}` : ''}`).join('\n')}`
}

const MODE_ICON: Record<AgentMode, typeof PencilIcon> = {
  ask: MessageCircleQuestionIcon,
  plan: ListChecksIcon,
  edit: PencilIcon,
  full: ShieldCheckIcon,
}

const SUGGESTIONS = [
  'Model a low-poly tree on a grassy island',
  'Make a modern desk lamp',
  'Build a cozy room with a sofa and a table',
  'Put a 3D product hero inside a landing page',
]

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
  const [todosOpen, setTodosOpen] = useState(true)
  const mode = useAgentMode((s) => s.mode)
  const setMode = useAgentMode((s) => s.set)
  const approvedCount = useApprovals((s) => s.allowed[docId]?.length ?? 0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const chat = (viewedId && live[viewedId]) || (chats.find((c) => c.id === viewedId) ?? null)
  const setViewed = (id: string | null) => useAgentRun.setState({ viewedId: id })

  useEffect(() => {
    void chatsRepo.list(docId).then(setChats)
  }, [docId, saved])
  useEffect(() => {
    void loadApprovals(docId)
  }, [docId])

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
    void runAgent(text, files, base ?? chat, docId, mode, mentionContext(text))
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
    if (chat)
      await persist({
        ...chat,
        messages: chat.messages.map((m) => (m.id === msg.id ? { ...m, changes: undefined, text: m.text + '\n\n_Undone._' } : m)),
      })
  }

  const attach = async () => {
    const files = await pickFiles('image/*,video/*,application/pdf,.svg,.glb,.gltf', true)
    const added = await Promise.all(files.map(async (f) => ({ ref: await storeFile(f, f.name, docId), name: f.name, type: f.type })))
    warmForFiles(added)
    setAttachments((a) => [...a, ...added])
  }

  const selNames = selection.map((id) => nodes[id]?.name).filter(Boolean)
  const last = chat?.messages.at(-1)
  const generating = !!chat && !!live[chat.id]
  const asking = useAsking(chat?.id ?? null)
  const todos = [...(chat?.messages ?? [])].reverse().find((m) => m.todos)?.todos
  // The list stays up while there is work left; the question form takes its place while the agent waits for answers.
  const showTodos = !!todos && !asking && (generating || todos.items.some((i) => i.status !== 'completed'))
  // Every message sent in this file, oldest first, for Up/Down in the box.
  const history = useMemo(() => {
    const all = new Map(chats.map((c) => [c.id, c]))
    for (const c of Object.values(live)) all.set(c.id, c)
    const sent = [...all.values()]
      .flatMap((c) => c.messages.filter((m) => m.role === 'user'))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => m.text)
    return sent.filter((t, i) => t !== sent[i - 1])
  }, [chats, live])
  const usageMsg = [...(chat?.messages ?? [])].reverse().find((m) => m.contextTokens)
  // Until a reply reports real usage (new chats, older saved chats), estimate from the text: ~4 characters a token.
  const afterSummary = chat?.summary ? chat.messages.slice(chat.messages.findIndex((m) => m.id === chat.summary!.uptoId) + 1) : null
  const contextUsed = afterSummary
    ? Math.ceil((chat!.summary!.text.length + afterSummary.reduce((n, m) => n + m.text.length, 0)) / 4) + 2000
    : (usageMsg?.contextTokens ?? Math.ceil((chat?.messages ?? []).reduce((n, m) => n + m.text.length + (m.reasoning?.length ?? 0), 0) / 4))
  const ModeIcon = MODE_ICON[mode]
  const build = (m: AgentMode) => {
    setMode(m)
    void runAgent('Build the plan above, following its steps.', [], chat, docId, m)
  }

  return (
    <section className="flex h-full min-h-0 flex-col text-sm">
      <header className="flex items-center justify-end gap-1 border-b px-2 py-1">
        <Button variant="ghost" size="icon-xs" title="New chat" onClick={() => setViewed(null)}>
          <PlusIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" title="Chat history" />}>
            <HistoryIcon />
          </DropdownMenuTrigger>
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
                  <button key={s} type="button" onClick={() => run(s, [])} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat?.messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="group/user flex flex-col items-end">
                <UserBubble
                  markdown
                  text={m.text}
                  footer={
                    !!m.attachments?.length && (
                      <div className="mt-1 text-xs opacity-80 [overflow-wrap:anywhere]">
                        📎 {m.attachments.map((a) => a.name).join(', ')}
                      </div>
                    )
                  }
                />
                <CopyMessage text={m.text} />
              </div>
            ) : (
              <div key={m.id} className="mr-4 flex flex-col text-sm">
                <WorkedFor startedAt={m.createdAt} seconds={m.workedSeconds} running={generating && m === last} />
                <ChatReasoning
                  toolCount={false}
                  reasoning={m.reasoning}
                  steps={m.steps}
                  isStreaming={generating && m === last && !m.text}
                  duration={m.reasoningSeconds}
                  defaultOpen={false}
                  className="mb-0"
                />
                <VerificationCards message={m} />
                {m.plan && (
                  <>
                    <ChatPlanCard plan={m.plan} isStreaming={generating && m === last} />
                    {m === last && !generating && (
                      <div className="mb-2 flex gap-1.5">
                        <Button size="xs" onClick={() => build('edit')}>
                          <PencilIcon />
                          Build (ask before changes)
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => build('full')}>
                          <ShieldCheckIcon />
                          Build (full access)
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {m.text && (
                  <div id={`tts-${m.id}`}>
                    <Markdown>{m.text}</Markdown>
                  </div>
                )}
                {!m.error && generating && m === last && <WorkingNow message={m} />}
                {m.error && (
                  <div className="flex flex-col gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                    <div className="flex gap-1">
                      <AlertCircleIcon className="size-3.5 shrink-0" />
                      {m.error}
                    </div>
                    <Button variant="outline" size="xs" className="self-start" onClick={() => retry(m)} disabled={generating}>
                      Retry
                    </Button>
                  </div>
                )}
                {m.text && !(generating && m === last) && <ReplyActions text={m.text} speakId={`tts-${m.id}`} />}
                {m.changes !== undefined && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="mt-1 self-start"
                    onClick={() => void undo(m)}
                    disabled={!canUndo(m)}
                    title={canUndo(m) ? undefined : 'Other edits were made since; use Undo in the menu instead'}
                  >
                    <Undo2Icon />
                    Undo changes
                  </Button>
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
            {selNames.slice(0, 2).map((n, i) => (
              <span key={i} className="max-w-24 truncate rounded-full bg-accent px-2 py-0.5">
                {n}
              </span>
            ))}
            {selNames.length > 2 && <span className="rounded-full bg-accent px-2 py-0.5">+{selNames.length - 2}</span>}
            {attachments.map((a) => (
              <span key={a.ref} className="flex max-w-28 items-center gap-0.5 rounded-full border px-2 py-0.5">
                <span className="truncate">{a.name}</span>
                <button type="button" aria-label="Remove" onClick={() => setAttachments((x) => x.filter((y) => y.ref !== a.ref))}>
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {chat && <ApprovalDock chatId={chat.id} />}
        {chat && <QuestionsDock chatId={chat.id} />}
        {generating && last && <GoalBanner message={last} />}
        {showTodos && <ChatTodoQueue todos={todos} open={todosOpen} onOpenChange={setTodosOpen} />}
        {chat && <QueuedMessages chatId={chat.id} />}
        <WidgetComposer
          onSend={(text) => run(text, attachments)}
          suggest={suggest}
          history={history}
          streaming={generating}
          onStop={() => chat && stopAgent(chat.id)}
          placeholder={
            selNames.length
              ? 'Edit the selection…  (/ for commands, @ for elements)'
              : 'Ask the agent to design…  (/ for commands, @ for elements)'
          }
          toolbarStart={
            <div className="mr-auto flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="Attach files" onClick={() => void attach()}>
                <PaperclipIcon />
              </Button>
              <ContextRing
                onCompact={async () => chat && compactChat(chat)}
                compactDisabled={
                  !chat?.messages.length ? 'Nothing to compact yet' : generating ? 'Wait for the reply to finish' : undefined
                }
                used={contextUsed}
                max={S3D_AGENT_CONTEXT_LIMIT}
                modelId={AI_MODELS.chatId}
                compactions={chat?.messages.reduce((n, m) => n + (m.compactions ?? 0), 0)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="xs" title="Agent mode" />}>
                  <ModeIcon />
                  {MODES.find((m) => m.id === mode)?.label}
                  <ChevronDownIcon className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Mode</DropdownMenuLabel>
                    {MODES.map((m) => {
                      const Icon = MODE_ICON[m.id]
                      return (
                        <DropdownMenuItem key={m.id} className="items-start normal-case tracking-normal" onClick={() => setMode(m.id)}>
                          <Icon className="mt-0.5" />
                          <span className="flex flex-col">
                            <span className={m.id === mode ? 'font-semibold' : ''}>{m.label}</span>
                            <span className="text-[11px] text-muted-foreground">{m.hint}</span>
                          </span>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuGroup>
                  {approvedCount > 0 && (
                    <DropdownMenuItem className="normal-case tracking-normal" onClick={() => void clearApprovals(docId)}>
                      Reset {approvedCount} approved tool{approvedCount === 1 ? '' : 's'} for this file
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      </div>
    </section>
  )
}
