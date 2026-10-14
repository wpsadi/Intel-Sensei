import { create } from 'zustand'

import { settingsRepo } from '../db'

/**
 * How much the agent may do.
 * ask: read and answer, never change anything. plan: research and write a plan. edit: build, asking before each kind
 * of change. full: build without asking.
 */
export type AgentMode = 'ask' | 'plan' | 'edit' | 'full'

export const MODES: { id: AgentMode; label: string; hint: string }[] = [
  { id: 'ask', label: 'Ask', hint: 'Answers questions about your work. Changes nothing.' },
  { id: 'plan', label: 'Plan', hint: 'Researches and writes a plan with to-dos. Changes nothing.' },
  { id: 'edit', label: 'Edit', hint: 'Builds and edits, asking before each kind of change.' },
  { id: 'full', label: 'Full access', hint: 'Builds and edits without asking.' },
]

/** Tools that only look: allowed in every mode, and never need approval. */
const READ = [
  'get_document',
  'get_scene',
  'list_pages',
  'render_scene',
  'render_views',
  'render_turntable',
  'snapshot_view',
  'render_timeline',
  'verify_design',
  'search_3d_models',
  'ask_user',
  'ask_questions',
  // The general tools: they work in their own sandbox or on the web, never on the file.
  'webSearch',
  'scrape',
  'terminal',
  'write_file',
  'load_skill',
  'sandbox_status',
  'view_image',
  'memory',
  'import_file',
  'export_file',
]
/** Moves around the canvas without changing the design: allowed to build modes without approval. */
const NAVIGATE = ['select_nodes', 'set_page']

const ALLOWED: Record<AgentMode, (name: string) => boolean> = {
  ask: (n) => READ.includes(n),
  plan: (n) => READ.includes(n) || n === 'write_plan' || n === 'update_todos',
  edit: (n) => n !== 'write_plan',
  full: (n) => n !== 'write_plan',
}

/** Whether `mode` offers this tool to the agent at all. */
export const toolAllowed = (mode: AgentMode, name: string) => ALLOWED[mode](name)

/** Whether a call must be approved by the user first: only in edit mode, and only for tools that change the file. */
export const needsApproval = (mode: AgentMode, name: string) =>
  mode === 'edit' && !READ.includes(name) && !NAVIGATE.includes(name) && name !== 'update_todos' && name !== 'complete_goal'

const MODE_KEY = 's3d:agent-mode'
const readMode = (): AgentMode => {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return MODES.some((m) => m.id === v) ? (v as AgentMode) : 'edit'
  } catch {
    return 'edit'
  }
}

export const useAgentMode = create<{ mode: AgentMode; set: (m: AgentMode) => void }>()((set) => ({
  mode: readMode(),
  set(mode) {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      // The mode is a convenience; losing it is fine.
    }
    set({ mode })
  },
}))

/* ---------- approvals ---------- */

export interface ApprovalRequest {
  chatId: string
  tool: string
  label: string
  args: unknown
}
export type ApprovalAnswer = 'once' | 'file' | 'deny'
/** `remote`: shown here, but the run waiting on it is in another tab. */
type Pending = { id: string; request: ApprovalRequest; resolve: (a: ApprovalAnswer) => void; remote?: boolean }

/**
 * `allowed` is the per-file list of tools the user said "always allow" for; it is kept with the file, so another file
 * asks again. `queue` holds calls waiting on the user, across chats.
 */
export const useApprovals = create<{ allowed: Record<string, string[]>; queue: Pending[] }>()(() => ({ allowed: {}, queue: [] }))

const approvalKey = (docId: string) => `approvals:${docId}`

export async function loadApprovals(docId: string) {
  if (useApprovals.getState().allowed[docId]) return
  const list = await settingsRepo.get<string[]>(approvalKey(docId), [])
  useApprovals.setState((s) => ({ allowed: { ...s.allowed, [docId]: list } }))
}

async function saveApprovals(docId: string, list: string[]) {
  useApprovals.setState((s) => ({ allowed: { ...s.allowed, [docId]: list } }))
  channel?.postMessage({ kind: 'allowed', docId, list } satisfies Sync)
  await settingsRepo.set(approvalKey(docId), list)
}

export const clearApprovals = (docId: string) => saveApprovals(docId, [])

/** Resolves once the call may run. Throws a message the agent can act on when the user says no or stops the run. */
export async function approveTool(docId: string, request: ApprovalRequest, signal: AbortSignal) {
  await loadApprovals(docId)
  if (useApprovals.getState().allowed[docId]?.includes(request.tool)) return
  const answer = await new Promise<ApprovalAnswer>((resolve) => {
    if (signal.aborted) return resolve('deny')
    const p: Pending = { id: crypto.randomUUID(), request, resolve }
    useApprovals.setState((s) => ({ queue: [...s.queue, p] }))
    channel?.postMessage({ kind: 'open', id: p.id, request } satisfies Sync)
    signal.addEventListener('abort', () => settle(p, 'deny'), { once: true })
  })
  if (answer === 'deny')
    throw new Error(`The user did not allow ${request.label}. Do not retry it; say what you could not do and ask how they want to proceed.`)
  if (answer === 'file') await saveApprovals(docId, [...(useApprovals.getState().allowed[docId] ?? []), request.tool])
}

export function settle(p: Pending, a: ApprovalAnswer) {
  if (!useApprovals.getState().queue.includes(p)) return
  useApprovals.setState((s) => ({ queue: s.queue.filter((x) => x !== p) }))
  p.resolve(a)
  // Every tab drops the request once any tab answered it.
  channel?.postMessage({ kind: 'close', id: p.id } satisfies Sync)
}

/* ---------- other tabs ---------- */

/** Approvals show in every tab of the app; whichever tab answers, the run in its own tab gets the answer. */
type Sync =
  | { kind: 'open'; id: string; request: ApprovalRequest }
  | { kind: 'answer'; id: string; answer: ApprovalAnswer }
  | { kind: 'close'; id: string }
  | { kind: 'allowed'; docId: string; list: string[] }
  | { kind: 'hello' }
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('s3d-agent-approvals') : null
const drop = (id: string) => useApprovals.setState((s) => ({ queue: s.queue.filter((x) => x.id !== id) }))
channel?.addEventListener('message', (e: MessageEvent<Sync>) => {
  const msg = e.data
  const { queue } = useApprovals.getState()
  if (msg.kind === 'open') {
    if (queue.some((p) => p.id === msg.id)) return
    const p: Pending = {
      id: msg.id,
      request: msg.request,
      remote: true,
      resolve: (answer) => channel?.postMessage({ kind: 'answer', id: msg.id, answer } satisfies Sync),
    }
    useApprovals.setState((s) => ({ queue: [...s.queue, p] }))
  } else if (msg.kind === 'answer') {
    const p = queue.find((x) => x.id === msg.id && !x.remote)
    if (p) settle(p, msg.answer)
  } else if (msg.kind === 'close') drop(msg.id)
  else if (msg.kind === 'allowed') useApprovals.setState((s) => ({ allowed: { ...s.allowed, [msg.docId]: msg.list } }))
  else for (const p of queue) if (!p.remote) channel?.postMessage({ kind: 'open', id: p.id, request: p.request } satisfies Sync)
})
channel?.postMessage({ kind: 'hello' } satisfies Sync)
