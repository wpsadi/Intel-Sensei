import { type ModelMessage, asSchema } from 'ai'
import { toast } from 'sonner'
import { create } from 'zustand'

import { generateChatTitle, generateFileTitle } from '@/ai/inference/title'
import { MEMORY_INSTRUCTIONS, createMemoryTool, memoryPrompt, memoryScope } from '@/ai/memory'
import { MAX_AGENT_STEPS } from '@/ai/agent-limits'
import { AI_MODELS, type Provider, toolSelectorChoice } from '@/ai/providers'
import { isModelMedia, warmForFiles } from '@/ai/sandbox/attachments'
import { holdSandbox, sandboxUnavailable } from '@/ai/sandbox/client'
import { type PendingMessage, demoteSteering, removePending, submitWhileBusy, takeNextPending, useSendQueue } from '@/ai/send-queue'
import { skillContextFor } from '@/ai/skills/invoke'
import { SKILLS_INSTRUCTIONS, createSkillTools, skillsPrompt } from '@/ai/skills/tools'
import { GENERAL_INSTRUCTIONS, createGeneralTools, localTools } from '@/ai/tools/general'
import { thinkingOnly } from '@/ai/utils/thinking'
import { type ToolSpec, streamInWorker } from '@/ai/worker/client'
import { S3D_AGENT_CONTEXT_LIMIT } from '@/constants/ai'
import type { ChatPlan, ChatQuestion, ChatTodoList, ChatToolStep } from '@/features/note/db/types'

import { chatsRepo, uid } from '../db'
import { readFile } from '../files'
import { isPlaceholderName } from '../model'
import { useS3D } from '../store'
import type { AgentAttachment, AgentChat, AgentMessage } from '../types'
import { agentDescriptions, agentSchemas } from './agent-tools'
import { askQuestions } from './ask-questions-store'
import { askUser } from './ask-user-store'
import { createFileTools, mountAttachments } from './file-tools'
import { type AgentMode, approveTool, needsApproval, toolAllowed } from './modes'
import { goalInstructions, modeInstructions } from './skills'
import { DESCRIPTIONS, SYSTEM_PROMPT, createdIds, impl, schemas, touchedIds } from './tools-impl'
import { VERDICT_DESCRIPTION, VERIFIER_TOOLS, verdictSchema, verifierInstructions } from './verifier'

/**
 * Steps one request may take: the same limit as every agent. An ordinary run shares it across its passes. A /goal run only
 * ends when a separate verifier agrees, so each of its passes gets its own. A pass that uses its steps was cut off, so the
 * run goes on in a new pass.
 */
const MAX_STEPS = MAX_AGENT_STEPS
/** Passes in one run: a safety net so a model that never finishes still stops. */
const MAX_PASSES = 30
/** A /goal run may take far more passes: it only ends when the goal is achieved, the user stops it, or it stalls. */
const MAX_GOAL_PASSES = 80
/** How the agent works with files: on disk through tools, not in its context. */
const FILE_INSTRUCTIONS = `Files: files the user attached are in the sandbox home folder under their own names; read and process them with the terminal and Python (pdftotext, pandas, PIL-style scripts) instead of expecting them in front of you. A script's result becomes part of the design with export_file, which gives an s3d-file: ref for place_image (pictures) or a model object's src in add_objects (GLB/GLTF). import_file copies a file already in the design (an image node's or model's src) into the sandbox.`
/** Offered on every request, whatever the dynamic tool selection picks. */
const TOOLS_ALWAYS = [
  'get_document',
  'get_scene',
  'verify_design',
  'update_todos',
  'complete_goal',
  'write_plan',
  'ask_questions',
  'ask_user',
  'lookup_capability',
  'use_skill',
]
/** Independent checks of a /goal run; each one that fails sends the worker back to work. */
const MAX_VERIFICATIONS = 8
/**
 * How hard the chat model thinks, in the provider's own terms. Claude thinks adaptively and `effort` sets how deep; its
 * summarized thinking streams while the model works, so a long think shows progress instead of a silent pause. Gemini
 * takes a thinking level. Other providers use their defaults.
 */
const agentOptions = (
  provider: Provider,
  effort: 'low' | 'medium' | 'high' | 'max',
): Record<string, Record<string, unknown>> | undefined =>
  provider === 'anthropic'
    ? { anthropic: { thinking: { type: 'adaptive', display: 'summarized' }, effort } }
    : provider === 'google'
      ? { google: { thinkingConfig: { thinkingLevel: effort === 'max' ? 'high' : effort, includeThoughts: true } } }
      : undefined

/** A pass that sends nothing (only keep-alive pings) for this long, while no tool is running, has stalled. */
const STALL_MS = 150_000
/** Stalled passes retried before the run gives up. */
const MAX_STALL_RETRIES = 2

const LOG = '[S3D agent]'
const secs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`)

/** Tool names as plain words for the steps list, e.g. "add_frame" → "Add frame". */
const stepLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')
const resultDetail = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text && text.length > 1200 ? `${text.slice(0, 1200)}…` : text
}

/**
 * Agent runs live here, outside the panel, so it keeps going when the panel unmounts (e.g. switching to the
 * Layers tab) and only stop when the user stops them. Each chat runs on its own, so several can generate at once.
 * `live` holds the chats being generated by id, `viewedId` the chat the panel shows (null for a new chat), and
 * `saved` bumps whenever a chat is written so the history list can refresh.
 */
export const useAgentRun = create<{ live: Record<string, AgentChat>; viewedId: string | null; saved: number }>()(() => ({
  live: {},
  viewedId: null,
  saved: 0,
}))

const aborts = new Map<string, () => void>()
/** Sends a message into the running reply of a chat, by chat id. */
const steerers = new Map<string, (message: PendingMessage) => void>()
/** What a queued message needs to run later, by its pending id: its files, the access mode and the @mention context. */
const queuedExtras = new Map<string, { files: AgentAttachment[]; mode: AgentMode; context?: string }>()

/**
 * Runs live in the tab that started them, but every tab of the app shows them: the running tab broadcasts each
 * update, other tabs mirror it, and Stop in any tab reaches the tab doing the work.
 */
type AgentSync = { kind: 'live'; chat: AgentChat } | { kind: 'end'; id: string } | { kind: 'stop'; id: string } | { kind: 'hello' }
const agentChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('s3d-agent') : null
const pending = new Map<string, AgentChat>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
/** Updates stream token by token, so they go out at most every 120 ms. */
function broadcastLive(chat: AgentChat) {
  pending.set(chat.id, chat)
  flushTimer ??= setTimeout(() => {
    flushTimer = null
    for (const c of pending.values()) agentChannel?.postMessage({ kind: 'live', chat: c } satisfies AgentSync)
    pending.clear()
  }, 120)
}
function broadcastEnd(id: string) {
  pending.delete(id)
  agentChannel?.postMessage({ kind: 'end', id } satisfies AgentSync)
}
agentChannel?.addEventListener('message', (e: MessageEvent<AgentSync>) => {
  const msg = e.data
  if (msg.kind === 'live') {
    if (!aborts.has(msg.chat.id)) useAgentRun.setState((s) => ({ live: { ...s.live, [msg.chat.id]: msg.chat } }))
  } else if (msg.kind === 'end') {
    if (!aborts.has(msg.id)) useAgentRun.setState((s) => ({ live: without(s.live, msg.id), saved: s.saved + 1 }))
  } else if (msg.kind === 'stop') aborts.get(msg.id)?.()
  else if (msg.kind === 'hello') {
    // A tab just opened: tell it about the runs this tab is doing.
    for (const id of aborts.keys()) {
      const c = useAgentRun.getState().live[id]
      if (c) agentChannel?.postMessage({ kind: 'live', chat: c } satisfies AgentSync)
    }
  }
})
agentChannel?.postMessage({ kind: 'hello' } satisfies AgentSync)

export const stopAgent = (chatId: string) => {
  const local = aborts.get(chatId)
  if (local) return local()
  agentChannel?.postMessage({ kind: 'stop', id: chatId } satisfies AgentSync)
}

/** What one run's tool calls created, changed and added to the undo history. */
interface RunTrack {
  signal: AbortSignal
  mode: AgentMode
  docId: string
  chatId: string
  /** Files attached anywhere in this chat; they are put in the sandbox before it is used. */
  attachments: () => AgentAttachment[]
  goal?: string
  completeGoal: (summary: string, evidence: string) => void
  setPlan: (plan: ChatPlan) => void
  setTodos: (todos: ChatTodoList) => void
  created: string[]
  touched: string[]
  /** History length before the run's first step and after its last; `interleaved` when another run's step fell between. */
  start?: number
  end?: number
  interleaved: boolean
}

/**
 * Canvas tools run one at a time across all runs, each as its own undo step, so what a call created or changed is
 * credited to the run that made it. Tools that only wait on the user or the network stay outside the line.
 */
let toolLine: Promise<unknown> = Promise.resolve()
const UNLOCKED = new Set(['ask_user', 'search_3d_models'])

/** Checks a tool call against the mode and its schema, asks the user when the mode needs it, then runs it. */
async function runTool(name: string, args: unknown, track: RunTrack) {
  if (name === 'complete_goal' && !track.goal) throw new Error('There is no goal to complete.')
  if (!toolAllowed(track.mode, name)) throw new Error(`${name} is not available in this mode. Use only the tools you were given.`)
  const shared = await general
  if (name === 'memory') {
    // Each program has its own memory, apart from every other program and app.
    return createMemoryTool({ chatId: track.chatId, scope: memoryScope.s3d(track.docId) }).execute!(
      args as never,
      {
        abortSignal: track.signal,
        toolCallId: crypto.randomUUID(),
        messages: [],
      } as never,
    )
  }
  if (SANDBOX_TOOLS.includes(name) || name === 'export_file') {
    // Mounting files would wait for Python to load: say it is booting instead.
    const wait = sandboxUnavailable()
    if (wait) return wait
  }
  if (name === 'export_file' || name === 'import_file') {
    const fileTools = createFileTools(track.docId)
    await mountAttachments(track.attachments(), track.signal)
    return fileTools[name].execute!(args as never, { abortSignal: track.signal, toolCallId: crypto.randomUUID(), messages: [] } as never)
  }
  if (shared.has(name)) {
    if (SANDBOX_TOOLS.includes(name)) await mountAttachments(track.attachments(), track.signal)
    return shared.call(name, args, track.signal)
  }
  if (name in agentSchemas) return agentTool(name as keyof typeof agentSchemas, args, track)
  const tool = name as keyof typeof impl
  const parsed = schemas[tool].safeParse(args)
  if (!parsed.success) throw new Error(`Invalid input for ${name}: ${parsed.error.message}`)
  // Waiting for the user happens before joining the canvas line, so it never holds up another run.
  if (needsApproval(track.mode, name)) {
    const asked = performance.now()
    await approveTool(track.docId, { chatId: track.chatId, tool: name, label: stepLabel(name), args: parsed.data }, track.signal)
    console.info(LOG, `${name}: waited ${secs(performance.now() - asked)} for approval`)
  }
  const started = performance.now()
  try {
    return await execTool(tool, parsed.data, track)
  } finally {
    console.info(LOG, `${name}: ran in ${secs(performance.now() - started)}`)
  }
}

/** Tools about the conversation: the plan, the to-do list and questions for the user. */
async function agentTool(name: keyof typeof agentSchemas, args: unknown, track: RunTrack) {
  const parsed = agentSchemas[name].safeParse(args)
  if (!parsed.success) throw new Error(`Invalid input for ${name}: ${parsed.error.message}`)
  if (name === 'write_plan') {
    track.setPlan(parsed.data as ChatPlan)
    return 'The plan is shown to the user. Stop now: write one sentence saying they can build it, and do not build anything.'
  }
  if (name === 'update_todos') {
    const list = parsed.data as ChatTodoList
    track.setTodos({ ...list, title: list.title ?? 'To-do' })
    const left = list.items.filter((i) => i.status !== 'completed').length
    return left ? `Saved. ${left} of ${list.items.length} still to do; keep going.` : 'Saved. Every item is completed.'
  }
  if (name === 'complete_goal') {
    const { summary, evidence } = parsed.data as { summary: string; evidence: string }
    track.completeGoal(summary, evidence)
    return 'Recorded. A separate verifier will now check the real result against the goal; if it finds problems you will be sent back to fix them.'
  }
  const { questions } = parsed.data as { questions: ChatQuestion[] }
  const answers = await askQuestions(track.chatId, questions, track.signal)
  return 'dismissed' in answers
    ? { dismissed: true, note: 'The user closed the questions. Choose sensible defaults, or stop and say so.' }
    : answers
}

async function execTool(name: keyof typeof impl, args: unknown, track: RunTrack) {
  if (name === 'ask_user') return askUser(args as never, track.signal)
  const call = () => (impl[name] as (a: unknown) => unknown)(args)
  if (UNLOCKED.has(name)) return call()
  const turn = toolLine.then(async () => {
    const st = useS3D.getState()
    const before = st.past.length
    const c0 = createdIds.length
    const t0 = touchedIds.length
    st.beginGesture()
    try {
      return await call()
    } finally {
      useS3D.getState().endGesture()
      track.created.push(...createdIds.splice(c0))
      track.touched.push(...touchedIds.splice(t0))
      const after = useS3D.getState().past.length
      if (after > before) {
        if (track.end !== undefined && track.end !== before) track.interleaved = true
        track.start ??= before
        track.end = after
      }
    }
  })
  toolLine = turn.catch(() => {})
  return turn
}

/** Web search, scraping and the sandbox: the same tools the other agents have. They never touch the canvas. */
const general = localTools({ ...createGeneralTools(), memory: createMemoryTool(), ...createFileTools(''), ...createSkillTools() })
/** The sandbox tools read the chat's attached files from the sandbox, so they are put there first. */
const SANDBOX_TOOLS = ['terminal', 'write_file', 'import_file']

let toolSpecs: Promise<Record<string, ToolSpec>> | null = null
const getToolSpecs = () =>
  (toolSpecs ??= Promise.all([
    ...(Object.keys(impl) as (keyof typeof impl)[]).map(
      async (name) =>
        [
          name,
          {
            description: DESCRIPTIONS[name],
            schema: await asSchema(schemas[name] as never).jsonSchema,
            imageOutput: name === 'render_scene' || name === 'render_timeline' || name === 'capture_image',
          } satisfies ToolSpec,
        ] as const,
    ),
    ...(Object.keys(agentSchemas) as (keyof typeof agentSchemas)[]).map(
      async (name) =>
        [
          name,
          { description: agentDescriptions[name], schema: await asSchema(agentSchemas[name] as never).jsonSchema } satisfies ToolSpec,
        ] as const,
    ),
  ]).then(async (entries) => Object.fromEntries([...entries, ...Object.entries((await general).specs)])))

/** The tools a mode offers; the rest are not even shown to the model. */
const toolsFor = async (mode: AgentMode, goal?: string) =>
  Object.fromEntries(
    Object.entries(await getToolSpecs()).filter(([name]) => toolAllowed(mode, name) && (name !== 'complete_goal' || !!goal)),
  ) as Record<string, ToolSpec>

/* ---------- run ---------- */

async function toModel(m: AgentMessage): Promise<ModelMessage> {
  if (m.role === 'assistant') {
    // The plan lives beside the text, so spell it out for the model or it could not build it later.
    const plan = m.plan
      ? `\n\nPlan "${m.plan.title}":\n${m.plan.description ? `${m.plan.description}\n` : ''}${m.plan.steps.map((st, i) => `${i + 1}. ${st.title}${st.details ? ` (${st.details})` : ''}`).join('\n')}`
      : ''
    return { role: 'assistant', content: (m.text + plan).trim() }
  }
  const parts: Exclude<Extract<ModelMessage, { role: 'user' }>['content'], string> = [
    { type: 'text', text: m.goal ? `Goal: ${m.goal}` : m.text },
  ]
  if (m.context) parts.push({ type: 'text', text: m.context })
  // 3D models cannot be sent to the model as files; it places them in a scene by ref instead.
  const named = (m.attachments ?? []).map((a) => a.name)
  if (named.length)
    parts.push({
      type: 'text',
      text: `Attached files (in the sandbox home folder; any that is not a picture is only a reference, read through load_skill "files" and the terminal): ${named.join(', ')}`,
    })
  const models = (m.attachments ?? []).filter((a) => /\.(glb|gltf)$/i.test(a.name))
  if (models.length)
    parts.push({
      type: 'text',
      text: `Attached 3D models (use as model objects with src): ${models.map((a) => `${a.name} → ${a.ref}`).join(', ')}`,
    })
  for (const a of m.attachments ?? []) {
    // Pictures, audio and video are shown to the model; every other file stays a reference for the sandbox.
    if (!isModelMedia(a.type)) continue
    const blob = await readFile(a.ref)
    if (blob) parts.push({ type: 'file', data: new Uint8Array(await blob.arrayBuffer()), mediaType: a.type })
  }
  return { role: 'user', content: parts }
}

function selectionContext() {
  const st = useS3D.getState()
  const sel = st.selection.map((id) => st.doc.nodes[id]).filter(Boolean)
  const open = st.sceneEdit
  const openNode = open && st.doc.nodes[open.nodeId]
  return openNode
    ? `\n\nThe user has the 3D scene "${openNode.name}" (sceneId=${openNode.id}) open in the 3D editor and is looking at it. Unless they clearly ask for something new and separate, every request is about THIS scene: call get_scene, then add_objects / update_objects / delete_objects / set_scene with this sceneId. Do not call create_scene or 2D tools.${open.selected ? ` Selected object: id=${open.selected}; "this"/"it" means that object.` : ''}`
    : sel.length
      ? `\n\nCurrent selection (edit these when the user says "this"/"selected"): ${sel.map((n) => `${n.name} [${n.type}] id=${n.id}${n.type === 'shape3d' || n.type === 'model3d' ? ' (a 3D scene: edit it with get_scene/update_objects using this id as sceneId)' : ''}`).join(', ')}`
      : '\n\nNothing is selected.'
}

const without = (live: Record<string, AgentChat>, id: string) => {
  const { [id]: _, ...rest } = live
  return rest
}

async function save(c: AgentChat) {
  await chatsRepo.put(c)
  useAgentRun.setState((s) => ({ saved: s.saved + 1 }))
}

/** Starts the agent on `base` (a new chat when null) and shows it. It keeps running in the background until it ends or is stopped. */
export async function runAgent(
  text: string,
  files: AgentAttachment[],
  base: AgentChat | null,
  docId: string,
  mode: AgentMode,
  context?: string,
) {
  if (!text.trim()) return
  // A reply is running: the message waits for it, or steers it (Settings → Chat). Files and /goal runs always wait.
  if (base && useAgentRun.getState().live[base.id]) {
    const steerable = !files.length && !/^\/goal\b/i.test(text.trim())
    const pending = submitWhileBusy(
      base.id,
      { text },
      steerable ? (message) => steerers.get(base.id)?.({ ...message, text: context ? `${text}\n\n${context}` : text }) : undefined,
    )
    queuedExtras.set(pending.id, { files, mode, context })
    return
  }
  // "/goal <what to achieve>" keeps the agent working until it declares the goal achieved.
  const slash = /^\/goal(?:\s+([\s\S]*))?$/i.exec(text.trim())
  const goal = slash ? (slash[1] ?? '').trim() : undefined
  if (slash && !goal) {
    toast.info('Say what to achieve: /goal build a low-poly cow and export it')
    return
  }
  // A message that starts with /skill-name carries that skill's instructions to the model, next to the @mention context.
  const skillContext = await skillContextFor(text)
  const fullContext = [context, skillContext].filter(Boolean).join('\n\n') || undefined
  if (goal && (mode === 'ask' || mode === 'plan')) {
    toast.info(`/goal builds things, so it needs Edit or Full access mode (now ${mode}).`)
    return
  }
  // Same chat model as Ask Sensei and S-Note, from Settings → AI models.
  const ai = AI_MODELS.chat
  const userMsg: AgentMessage = {
    id: uid(),
    role: 'user',
    text,
    attachments: files,
    createdAt: Date.now(),
    ...(fullContext && { context: fullContext }),
    ...(goal && { goal }),
  }
  const assistant: AgentMessage = {
    id: uid(),
    role: 'assistant',
    text: '',
    mode,
    createdAt: Date.now(),
    ...(goal && { goal, goalState: 'working' as const }),
  }
  const current = base ?? { id: uid(), docId, title: text.slice(0, 40), messages: [], updatedAt: Date.now() }
  let c: AgentChat = { ...current, messages: [...current.messages, userMsg, assistant], updatedAt: Date.now() }
  const update = (patch: Partial<AgentMessage>) => {
    c = { ...c, messages: c.messages.map((m) => (m.id === assistant.id ? { ...m, ...patch } : m)) }
    useAgentRun.setState((s) => ({ live: { ...s.live, [c.id]: c } }))
    if (aborts.has(c.id)) broadcastLive(c)
  }
  if (!ai.key) {
    useAgentRun.setState({ viewedId: c.id })
    update({ error: 'Add a key for your chat provider in Settings → AI providers to use the S3D agent.' })
    await save(c)
    useAgentRun.setState((s) => ({ live: without(s.live, c.id) }))
    return
  }
  useAgentRun.setState((s) => ({ live: { ...s.live, [c.id]: c }, viewedId: c.id }))
  // Saved now so the chat shows in the history while it generates.
  await save(c)
  // A new chat keeps the start of the request as its title until it is named, as in Ask Sensei. Titles use the
  // quick Gemini model, so without a Gemini key the chat keeps the start of the request.
  const titleKey = AI_MODELS.title.key
  if (!base && titleKey)
    void generateChatTitle(`User: ${goal ?? text}`)
      .then(async (title) => {
        if (!title) return
        if (useAgentRun.getState().live[c.id]) {
          c = { ...c, title }
          useAgentRun.setState((s) => ({ live: { ...s.live, [c.id]: c } }))
          await save(c)
        } else {
          const saved = await chatsRepo.get(c.id)
          if (saved) await save({ ...saved, title })
        }
      })
      .catch(() => {})
  // The file is named from the same request, as its own call to the title provider, but only while it still has its automatic
  // "Untitled" name and the user has never renamed it.
  const openDoc = useS3D.getState().doc
  if (titleKey && openDoc.id === docId && !openDoc.nameLocked && isPlaceholderName(openDoc.name))
    void generateFileTitle(goal ?? text)
      .then((title) => (title ? useS3D.getState().autoNameDoc(docId, title) : undefined))
      .catch(() => {})
  void work()

  async function work() {
    const controller = new AbortController()
    aborts.set(c.id, () => controller.abort())
    // Stopping the agent also withdraws a question it is waiting on.
    let todos: ChatTodoList | undefined
    let planWritten = false
    let goalDone = false
    let goalSummary = ''
    let goalEvidence = ''
    const track: RunTrack = {
      signal: controller.signal,
      mode,
      docId,
      chatId: c.id,
      attachments: () => c.messages.flatMap((m) => m.attachments ?? []),
      created: [],
      touched: [],
      interleaved: false,
      goal,
      completeGoal: (summary, evidence) => {
        goalDone = true
        goalSummary = summary
        goalEvidence = evidence
      },
      setPlan: (plan) => {
        planWritten = true
        update({ plan })
      },
      setTodos: (list) => {
        todos = list
        update({ todos: list })
      },
    }
    // The run keeps the Python environment alive; it stops a minute after the last use.
    const releaseSandbox = holdSandbox()
    try {
      warmForFiles(c.messages.flatMap((m) => m.attachments ?? []))
      const skills = await skillsPrompt().catch(() => '')
      const memory = await memoryPrompt({ chatId: c.id, scope: memoryScope.s3d(docId) }).catch(() => '')
      const instructions =
        SYSTEM_PROMPT +
        modeInstructions(mode) +
        (goal ? goalInstructions(goal) : '') +
        `\n\n${GENERAL_INSTRUCTIONS}\n\n${FILE_INSTRUCTIONS}\n\n${SKILLS_INSTRUCTIONS}${skills ? `\n${skills}` : ''}\n\n${MEMORY_INSTRUCTIONS}\nThis memory belongs to this 3D/design file only.${memory ? `\n\n${memory}` : ''}` +
        selectionContext()
      const tools = await toolsFor(mode, goal)
      const cut = c.summary ? c.messages.findIndex((m) => m.id === c.summary!.uptoId) + 1 : 0
      let messages: ModelMessage[] = [
        ...(c.summary && cut > 0
          ? [{ role: 'user' as const, content: `Summary of the earlier conversation (compacted):\n\n${c.summary.text}` }]
          : []),
        ...(await Promise.all(
          c.messages
            .slice(Math.max(0, cut))
            .filter((m) => m.id !== assistant.id && !m.error && (m.role === 'user' || m.text.trim() || m.plan))
            .map(toModel),
        )),
      ]
      const started = Date.now()
      let reply = ''
      let thoughts = ''
      let thinking = true
      let steps: ChatToolStep[] = []
      const setStep = (step: ChatToolStep) => {
        const previous = steps.find((x) => x.id === step.id)
        step = { ...step, at: previous?.at ?? thinkingOnly(thoughts).length }
        steps = previous ? steps.map((x) => (x.id === step.id ? step : x)) : [...steps, step]
        update({ steps })
      }

      /** Finishes the to-do items that are only verification, once the agent's own verify_design came back clean. */
      const completeVerifyTodos = () => {
        if (!todos) return
        const isVerify = (t: string) => /verif|review|check|render/i.test(t)
        if (todos.items.some((i) => i.status !== 'completed' && !isVerify(i.title))) return
        if (todos.items.every((i) => i.status === 'completed')) return
        track.setTodos({ ...todos, items: todos.items.map((i) => ({ ...i, status: 'completed' as const })) })
      }
      const verdicts: NonNullable<AgentMessage['verification']> = []
      let goalVerified = false

      /** The verifier: a fresh agent with only the goal and the worker's claim. It looks, then submits a verdict. */
      const verifyGoal = async (round: number): Promise<{ achieved: boolean; summary: string; problems: string[] }> => {
        const scenes = [...new Set([...track.created, ...track.touched])].filter((id) =>
          ['shape3d', 'model3d'].includes(useS3D.getState().doc.nodes[id]?.type ?? ''),
        )
        const brief = `Goal: ${goal}\n\nThe worker says it is achieved: ${goalSummary}\nIts evidence: ${goalEvidence}\n${scenes.length ? `3D scenes it worked on: ${scenes.map((id) => `"${useS3D.getState().doc.nodes[id]?.name}" (sceneId=${id})`).join(', ')}.` : 'Look at the document with get_document.'}\n\nVerify this against the real state now and submit your verdict.`
        const allowed = new Set([...VERIFIER_TOOLS, 'submit_verdict'])
        const all = await getToolSpecs()
        const vtools: Record<string, ToolSpec> = {
          ...Object.fromEntries(Object.entries(all).filter(([n]) => VERIFIER_TOOLS.includes(n))),
          submit_verdict: { description: VERDICT_DESCRIPTION, schema: await asSchema(verdictSchema as never).jsonSchema },
        }
        let verdict: { achieved: boolean; summary: string; problems: string[] } | null = null
        let vMessages: ModelMessage[] = [{ role: 'user', content: brief }]
        const label = (name: string) =>
          `Verifier · ${name === 'submit_verdict' ? 'Verdict' : stepLabel(name)}${round > 1 ? ` (check ${round})` : ''}`
        for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
          let err: string | undefined
          const res = await streamInWorker(
            {
              provider: ai.provider,
              key: ai.key,
              baseURL: ai.baseURL,
              model: ai.model,
              instructions: verifierInstructions,
              maxSteps: 30,
              tools: vtools,
              messages: vMessages,
              providerOptions: agentOptions(ai.provider, 'medium'),
              contextLimit: S3D_AGENT_CONTEXT_LIMIT,
            },
            {
              signal: controller.signal,
              execTool: async (name, args) => {
                if (!allowed.has(name)) throw new Error(`${name} is not available to the verifier`)
                if (name === 'submit_verdict') {
                  const parsed = verdictSchema.safeParse(args)
                  if (!parsed.success) throw new Error(`Invalid verdict: ${parsed.error.message}`)
                  verdict = parsed.data
                  return 'Verdict recorded. You are done.'
                }
                return runTool(name, args, track)
              },
              onPart: (part) => {
                if (part.type === 'tool-call')
                  setStep({ id: `v${round}-${part.toolCallId}`, name: part.toolName, label: label(part.toolName), status: 'running' })
                else if (part.type === 'tool-result')
                  setStep({
                    id: `v${round}-${part.toolCallId}`,
                    name: part.toolName,
                    label: label(part.toolName),
                    detail: resultDetail(part.output),
                    status: 'done',
                  })
                else if (part.type === 'tool-error')
                  setStep({
                    id: `v${round}-${part.toolCallId}`,
                    name: part.toolName,
                    label: label(part.toolName),
                    detail: part.error,
                    status: 'failed',
                  })
                else if (part.type === 'error') err = part.error
              },
            },
          )
          if (err ?? res.error) throw new Error(err ?? res.error)
          if (controller.signal.aborted) throw new Error('aborted')
          vMessages = [
            ...(res.replaced ? res.messages : [...vMessages, ...res.messages]),
            { role: 'user', content: 'Call submit_verdict now with your verdict.' },
          ]
        }
        return (
          verdict ?? {
            achieved: false,
            summary: 'The verifier gave no verdict.',
            problems: [
              'The verification could not be completed; re-check the whole goal yourself from every angle, then call complete_goal again.',
            ],
          }
        )
      }
      let compactions = 0
      let toolTotal = 0
      let modelTotal = 0
      const runStarted = performance.now()
      let stallRetries = 0
      let idle = 0
      let calls = 0
      // Tool calls made by the earlier passes of this request. A parallel call counts each time, so the limit is never passed.
      let used = 0
      for (let pass = 0; pass < (goal ? MAX_GOAL_PASSES : MAX_PASSES); pass++) {
        // Each pass ends with its own summary; the last pass's summary is the reply.
        let passReply = ''
        calls = 0
        // What this pass may still take, and the budget it is warned against at 75%.
        const budget = { used: goal ? 0 : used, max: MAX_STEPS }
        const passLimit = Math.max(1, budget.max - budget.used)
        // Timing for the console: when each call started, and where the current model step began.
        const callStarted = new Map<string, number>()
        let stepMark = performance.now()
        let modelOpen = true
        let stepModelMs = 0
        const passStarted = performance.now()
        goalDone = false
        if (goal) update({ goalState: 'working' })
        let streamError: string | undefined
        // Call to answer, including waits for approval and for other runs' canvas edits.
        const logAnswered = (name: string, id: string, error?: string) => {
          const took = performance.now() - (callStarted.get(id) ?? performance.now())
          toolTotal += took
          console.info(LOG, `${name}: answered in ${secs(took)}${error ? ` (failed: ${error})` : ''}`)
        }
        // Watchdog: the provider sometimes keeps the stream open with pings and never answers. Each part resets the
        // timer, a running tool pauses it, and a stall aborts only this pass so it can be retried.
        const passCtl = new AbortController()
        const onRunAbort = () => passCtl.abort()
        controller.signal.addEventListener('abort', onRunAbort, { once: true })
        let toolsRunning = 0
        let stalled = false
        let lastPart = performance.now()
        const watchdog = setInterval(() => {
          if (toolsRunning || performance.now() - lastPart < STALL_MS) return
          stalled = true
          console.warn(LOG, `pass ${pass + 1}: no response from the provider for ${secs(STALL_MS)}, retrying`)
          passCtl.abort()
        }, 5000)
        const result = await streamInWorker(
          {
            provider: ai.provider,
            key: ai.key,
            baseURL: ai.baseURL,
            model: ai.model,
            instructions,
            maxSteps: passLimit,
            stepBudget: budget,
            tools,
            // ~110 tools: the model picks the ones the request needs and the rest stay out of every step.
            toolSelect: { model: toolSelectorChoice(), alwaysInclude: TOOLS_ALWAYS, max: 25 },
            messages,
            providerOptions: agentOptions(ai.provider, 'medium'),
            contextLimit: S3D_AGENT_CONTEXT_LIMIT,
          },
          {
            signal: passCtl.signal,
            onRun: (run) => {
              const send = (message: PendingMessage) => {
                const extras = queuedExtras.get(message.id)
                run.steer(message.id, extras?.context ? `${message.text}\n\n${extras.context}` : message.text)
              }
              steerers.set(c.id, send)
              // Steering messages sent between passes, or taken by none, go into this one.
              for (const message of useSendQueue.getState().items[c.id] ?? []) if (message.steer) send(message)
            },
            execTool: async (name, args) => {
              toolsRunning++
              try {
                const output = await runTool(name, args, track)
                // A clean verify_design is the verification step, so finish the to-do items that are only that.
                if (name === 'verify_design' && (output as { ok?: boolean } | undefined)?.ok) completeVerifyTodos()
                return output
              } finally {
                toolsRunning--
                lastPart = performance.now()
              }
            },
            onPart: (part) => {
              lastPart = performance.now()
              if (part.type === 'text-delta') {
                // Thinking is over once the first words arrive.
                if (thinking) {
                  thinking = false
                  update({ reasoningSeconds: Math.max(1, Math.round((Date.now() - started) / 1000)) })
                }
                passReply += part.text
                update({ text: passReply })
              } else if (part.type === 'reasoning-start') {
                // Each step thinks afresh; keep its thoughts as their own paragraph.
                if (thoughts) thoughts += '\n\n'
              } else if (part.type === 'reasoning-delta') {
                thoughts += part.text
                update({ reasoning: thinkingOnly(thoughts) })
              } else if (part.type === 'tool-call') {
                calls++
                // The model's part of a step ends when it asks for its first tool.
                if (modelOpen) {
                  modelOpen = false
                  stepModelMs = performance.now() - stepMark
                }
                callStarted.set(part.toolCallId, performance.now())
                setStep({ id: part.toolCallId, name: part.toolName, label: stepLabel(part.toolName), status: 'running' })
              } else if (part.type === 'tool-result') {
                logAnswered(part.toolName, part.toolCallId)
                setStep({
                  id: part.toolCallId,
                  name: part.toolName,
                  label: stepLabel(part.toolName),
                  detail: resultDetail(part.output),
                  status: 'done',
                })
              } else if (part.type === 'tool-error') {
                logAnswered(part.toolName, part.toolCallId, part.error)
                setStep({ id: part.toolCallId, name: part.toolName, label: stepLabel(part.toolName), detail: part.error, status: 'failed' })
              } else if (part.type === 'usage') {
                // A step that called no tools was the model's alone, up to its end.
                const now = performance.now()
                const modelMs = modelOpen ? now - stepMark : stepModelMs
                modelTotal += modelMs
                console.info(
                  LOG,
                  `model step: ${secs(modelMs)} thinking/writing · ${part.inputTokens} in / ${part.outputTokens} out tokens`,
                )
                stepMark = now
                modelOpen = true
                update({ contextTokens: part.contextTokens })
              } else if (part.type === 'compacted') {
                compactions++
                update({ compactions })
                setStep({
                  id: `compact-${compactions}`,
                  name: 'compact',
                  label: 'Compacted context',
                  detail: `${Math.round(part.beforeTokens / 1000)}k → ${Math.round(part.afterTokens / 1000)}k tokens`,
                  status: 'done',
                })
              } else if (part.type === 'steered') {
                // The model took a steering message in: it shows in the chat, above the reply it is steering.
                const pending = useSendQueue.getState().items[c.id]?.find((item) => item.id === part.id)
                if (!pending) return
                removePending(c.id, pending.id)
                const extras = queuedExtras.get(pending.id)
                queuedExtras.delete(pending.id)
                const steered: AgentMessage = {
                  id: pending.id,
                  role: 'user',
                  text: pending.text,
                  createdAt: Date.now(),
                  ...(extras?.context && { context: extras.context }),
                }
                const at = c.messages.findIndex((m) => m.id === assistant.id)
                c = { ...c, messages: [...c.messages.slice(0, at), steered, ...c.messages.slice(at)] }
                useAgentRun.setState((s) => ({ live: { ...s.live, [c.id]: c } }))
                if (aborts.has(c.id)) broadcastLive(c)
              } else if (part.type === 'error') streamError = part.error
            },
          },
        )
        clearInterval(watchdog)
        controller.signal.removeEventListener('abort', onRunAbort)
        if (stalled && !controller.signal.aborted) {
          stallRetries++
          setStep({
            id: `stall-${stallRetries}`,
            name: 'stall',
            label: 'Provider stopped responding',
            detail: stallRetries > MAX_STALL_RETRIES ? 'Gave up' : 'Retrying',
            status: 'failed',
          })
          if (stallRetries > MAX_STALL_RETRIES)
            throw new Error(
              `The model provider stopped responding (${MAX_STALL_RETRIES + 1} times, ${secs(STALL_MS)} each). Try again, or lower the effort.`,
            )
          pass--
          continue
        }
        if (streamError ?? result.error) throw new Error(streamError ?? result.error)
        console.info(LOG, `pass ${pass + 1}: ${secs(performance.now() - passStarted)} · ${calls} tool calls`)
        used += calls
        if (passReply.trim()) reply = passReply.trim()
        if (controller.signal.aborted) throw new Error('aborted')
        messages = result.replaced ? result.messages : [...messages, ...result.messages]

        // A plan ends the turn: the user decides whether to build it.
        if (planWritten) break

        // Keep going while the to-do list has open items, or the pass was cut off by the step limit.
        const open = todos?.items.filter((i) => i.status !== 'completed') ?? []
        // An ordinary run that has used all its steps stops here and says what is left.
        if (!goal && used >= MAX_STEPS) {
          reply = `${reply || 'Stopped.'}\n\nI reached the limit of ${MAX_STEPS} steps for one request.${open.length ? ` Still to do: ${open.map((i) => i.title).join('; ')}.` : ''} Ask me to continue.`
          break
        }
        const cutOff = calls >= passLimit
        if (((mode === 'edit' || mode === 'full') && open.length) || cutOff) {
          idle = calls ? 0 : idle + 1
          // Two passes in a row that did nothing: the model will not move on, so stop and say so.
          if (idle >= 2) {
            reply = `${reply || 'Stopped.'}\n\n${open.length ? `${open.length} to-do ${open.length === 1 ? 'item is' : 'items are'} still not completed: ${open.map((i) => i.title).join('; ')}.` : 'The work may be unfinished.'} Ask me to continue.`
            break
          }
          messages.push({
            role: 'user',
            content: `${open.length ? `Your to-do list still has ${open.length} item${open.length === 1 ? '' : 's'} not completed:\n${open.map((i) => `- [${i.status}] ${i.title}`).join('\n')}\n` : ''}${cutOff ? 'Your last pass was cut off by the tool-call limit. ' : ''}Continue working now from where you stopped. Do the next item, call update_todos as each one is finished, and end with verification (render_scene + verify_design, fix what it reports). Do not write a final summary until every item is completed.`,
          })
          continue
        }
        // A goal run is finished only by a separate verifier agreeing; until then the worker keeps going.
        if (goal) {
          if (goalDone) {
            update({ goalState: 'verifying' })
            const round = verdicts.length + 1
            const verdict = await verifyGoal(round)
            verdicts.push({ round, ...verdict })
            update({ verification: verdicts })
            if (verdict.achieved) {
              update({ goalState: 'achieved' })
              goalVerified = true
              break
            }
            if (round >= MAX_VERIFICATIONS) {
              reply = `${reply || 'Stopped.'}\n\nThe verifier still finds problems after ${MAX_VERIFICATIONS} checks:\n${verdict.problems.map((p) => `- ${p}`).join('\n')}`
              break
            }
            idle = 0
            messages.push({
              role: 'user',
              content: `An independent verifier checked the result against the goal "${goal}" and says it is NOT achieved yet.\nVerifier summary: ${verdict.summary}\nProblems to fix:\n${verdict.problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nFix every problem (the verifier checks the real scene, not your claims), update your to-do list, check your work from every angle, then call complete_goal again.`,
            })
            continue
          }
          idle = calls ? 0 : idle + 1
          if (idle >= 2) {
            reply = `${reply || 'Stopped.'}\n\nThe goal is not marked achieved: "${goal}". Ask me to continue.`
            break
          }
          messages.push({
            role: 'user',
            content: `The goal is not achieved yet: "${goal}". Do not stop and do not ask me to continue. Work out what is still missing (your to-do list, every angle with render_views, verify_design), do it, and when you believe the goal is fully achieved call complete_goal. A separate verifier will then check it.`,
          })
          continue
        }
        break
      }
      if (goal && goalVerified) reply = goalSummary || reply
      else if (goal && !controller.signal.aborted) update({ goalState: 'stopped' })
      if (
        (mode === 'edit' || mode === 'full') &&
        todos?.items.some((i) => i.status !== 'completed') &&
        !controller.signal.aborted &&
        !reply.includes('not completed')
      ) {
        reply = `${reply || 'Stopped.'}\n\nSome to-do items are not completed yet. Ask me to continue.`
      }
      console.info(LOG, `run done in ${secs(performance.now() - runStarted)} · model ${secs(modelTotal)} · tools ${secs(toolTotal)}`)
      update({ text: reply || 'Done.' })
    } catch (error) {
      if (!controller.signal.aborted) update({ error: error instanceof Error ? error.message : String(error) })
      else update({ text: (c.messages.find((m) => m.id === assistant.id)?.text ?? '') + '\n\n_Stopped._' })
    } finally {
      releaseSandbox()
      update({ workedSeconds: Math.max(1, Math.round((Date.now() - assistant.createdAt) / 1000)) })
      // One undo for the whole reply works only while its steps sit together on top of the history.
      if (track.start !== undefined && !track.interleaved) update({ changes: track.start, changesEnd: track.end })
      const made = track.created.filter((id) => useS3D.getState().doc.nodes[id])
      // A run finishing in the background leaves the view alone.
      if (made.length && useAgentRun.getState().viewedId === c.id) useS3D.getState().zoomToFit(made)
      aborts.delete(c.id)
      await save(c)
      broadcastEnd(c.id)
      useAgentRun.setState((s) => ({ live: without(s.live, c.id) }))
      steerers.delete(c.id)
      // The next message sent meanwhile goes now; steering messages the run never took are sent like queued ones.
      demoteSteering()
      const next = takeNextPending(c.id)
      if (next) {
        const extras = queuedExtras.get(next.message.id)
        queuedExtras.delete(next.message.id)
        void runAgent(next.message.text, extras?.files ?? [], c, docId, extras?.mode ?? mode, extras?.context)
      }
    }
  }
}

/**
 * Compacts a chat on request: the model summarizes everything so far, and later replies see only that summary plus
 * newer messages. The chat itself still shows every message.
 */
export async function compactChat(chat: AgentChat) {
  const ai = AI_MODELS.chat
  if (!ai.key) throw new Error('Add a key for your chat provider in Settings first.')
  if (useAgentRun.getState().live[chat.id]) throw new Error('Wait for the reply to finish, or stop it, before compacting.')
  const last = chat.messages.at(-1)
  if (!last) return chat
  const cut = chat.summary ? chat.messages.findIndex((m) => m.id === chat.summary!.uptoId) + 1 : 0
  const transcript = chat.messages
    .slice(Math.max(0, cut))
    .filter((m) => !m.error)
    .map((m) => {
      const plan = m.plan ? `\nPlan "${m.plan.title}": ${m.plan.steps.map((st) => st.title).join('; ')}` : ''
      const todos = m.todos ? `\nTo-dos: ${m.todos.items.map((i) => `[${i.status}] ${i.title}`).join('; ')}` : ''
      return `${m.role.toUpperCase()}: ${m.text}${plan}${todos}${m.context ? `\n${m.context}` : ''}`
    })
    .join('\n\n')
  let text = ''
  let err: string | undefined
  const res = await streamInWorker(
    {
      provider: ai.provider,
      key: ai.key,
      baseURL: ai.baseURL,
      model: ai.model,
      tools: {},
      instructions:
        'Compress this design-agent conversation so the agent can continue it. Keep the user requests and goals word for word, decisions, constraints, every scene/object/node id mentioned with what it is, what is done, what is still to do, open problems and the to-do state. Write compact markdown.',
      messages: [{ role: 'user', content: `${chat.summary ? `Earlier summary:\n${chat.summary.text}\n\n` : ''}${transcript}` }],
      providerOptions: agentOptions(ai.provider, 'low'),
    },
    {
      signal: new AbortController().signal,
      execTool: () => {
        throw new Error('No tools')
      },
      onPart: (p) => {
        if (p.type === 'text-delta') text += p.text
        else if (p.type === 'error') err = p.error
      },
    },
  )
  if (err ?? res.error) throw new Error(err ?? res.error)
  if (!text.trim()) throw new Error('The model returned no summary.')
  const next: AgentChat = { ...chat, summary: { text: text.trim(), uptoId: last.id }, updatedAt: Date.now() }
  await save(next)
  return next
}
