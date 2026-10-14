import { Skills } from '@/ai/skills/skills'

import { COMMAND_TIMEOUT_MS, type ExecResult, FILE_MAX_BYTES } from './engine'
import type { SandboxRequest, SandboxResponse, SandboxResult } from './sandbox.worker'

type Pending = { resolve: (result: SandboxResult) => void; reject: (error: Error) => void }
/** A request without its id, which the client assigns. */
type Request = SandboxRequest extends infer R ? (R extends SandboxRequest ? Omit<R, 'id'> : never) : never

/** Loading Pyodide for the first time is allowed longer than a command, and does not count against a command's time. */
const BOOT_TIMEOUT_MS = 180_000
const TIMED_OUT = `The command was stopped after ${COMMAND_TIMEOUT_MS / 1000} seconds. The sandbox was reset to stop it: files you created are gone, and files attached to the chat are put back on the next command. Do less per command, for example one page range, head or grep instead of the whole file, then run it again.`
/** An environment nothing has used for this long is stopped. The next use starts it again and restores the session. */
export const SANDBOX_IDLE_MS = 60_000
/** After a failed start, wait this long before trying again. */
const RETRY_AFTER_MS = 30_000

export type SandboxStatus = 'idle' | 'booting' | 'ready' | 'unavailable'
export const SANDBOX_BOOTING =
  'Booting up the environment. It is not ready yet: carry on with what you can do without it, and try again in a few seconds.'
export const SANDBOX_UNAVAILABLE = 'Not available at the moment.'

/** The environment agents share when they have no session of their own (S-Note, S-3D). */
export const DEFAULT_SESSION = 'default'

/** Who ran something: the user typing in a terminal, or an agent through its tools. */
export type SandboxSource = 'user' | 'ai'

/** Where a command or file write came from, so it can be recorded and shown in the right terminal. */
export interface RunContext {
  session?: string
  source?: SandboxSource
  terminalId?: string
  /** A step of restoring a session: it is not recorded again, and does not wait for the restore it belongs to. */
  replay?: boolean
}

/** One recorded step in a session: enough to run it again and get the same files. */
export type SandboxOp = {
  id: string
  session: string
  terminalId: string
  source: SandboxSource
  at: number
} & (
  | { kind: 'shell'; command: string; output: string; code: number; /** The current folder once it finished. */ cwd?: string }
  | { kind: 'write'; path: string; content: string; append: boolean }
)

export type SandboxEvent = { phase: 'start' | 'end'; op: SandboxOp; failed?: string }
type Listener = (event: SandboxEvent) => void
const listeners = new Set<Listener>()
/** Hears every command and file write of every session, as it starts and as it ends. Returns a way to stop. */
export function onSandboxEvent(listener: Listener) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
const emit = (event: SandboxEvent) => listeners.forEach((listener) => listener(event))

/** Puts a session back the way it was before anything runs in it: set by the app that records sessions. */
let restorer: ((session: string, signal: AbortSignal) => Promise<void>) | null = null
export const setSandboxRestorer = (fn: typeof restorer) => void (restorer = fn)

/** One Python environment with its own files: a worker, and what was put in it. */
class Session {
  worker: Worker | null = null
  /** The worker is loaded. */
  booted: Promise<unknown> | null = null
  /** Booted and restored, so commands can run. */
  ready: Promise<unknown> | null = null
  status: SandboxStatus = 'idle'
  failedAt = 0
  nextId = 1
  pending = new Map<number, Pending>()
  /** Files already put into the current worker, by where they came from. A restarted worker starts empty, so this resets too. */
  mounted = new Map<string, string>()
  restoring: AbortController | null = null
  /** What the skills folder in the current worker holds, so it is rewritten only when a skill changed. */
  skillsKey = ''
  /** Tasks that are running and need the environment, such as a reply being written. */
  holds = 0
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  readonly id: string
  constructor(id: string) {
    this.id = id
  }

  private fail(id: number, error: Error) {
    this.pending.get(id)?.reject(error)
    this.pending.delete(id)
  }

  /** Throws the worker away, files and variables with it. Calls still waiting fail, and the next call starts a fresh worker. */
  restart(reason: string) {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.restoring?.abort()
    this.restoring = null
    this.worker?.terminate()
    this.worker = null
    this.booted = null
    this.ready = null
    this.status = 'idle'
    this.mounted.clear()
    this.skillsKey = ''
    for (const id of [...this.pending.keys()]) this.fail(id, new Error(reason))
  }

  private getWorker() {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./sandbox.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = (event: MessageEvent<SandboxResponse>) => {
      const reply = event.data
      const waiting = this.pending.get(reply.id)
      if (!waiting) return
      this.pending.delete(reply.id)
      if (reply.ok) waiting.resolve(reply.result)
      else waiting.reject(new Error(reply.error))
    }
    worker.onerror = (event) => this.restart(event.message ? `The sandbox stopped: ${event.message}` : 'The sandbox stopped')
    return worker
  }

  /** Sends one request to the worker and gives up after `limit`, restarting it since Python cannot be interrupted in place. */
  send(request: Request, signal: AbortSignal | undefined, transfer: Transferable[], limit: number, timeoutMessage: string) {
    if (signal?.aborted) return Promise.reject(new DOMException('Stopped', 'AbortError'))
    return new Promise<SandboxResult>((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.fail(id, new Error(timeoutMessage))
        this.restart('The sandbox was reset. Try the command again.')
      }, limit)
      const onAbort = () => this.fail(id, new DOMException('Stopped', 'AbortError'))
      const settle = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve: (result) => (settle(), resolve(result)),
        reject: (error) => (settle(), reject(error)),
      })
      this.getWorker().postMessage({ id, ...request }, transfer)
    })
  }

  /** Marks the environment as used and starts the countdown to stopping it again. */
  touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    if (this.status === 'idle' || this.status === 'unavailable') return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      // Work in flight, or a task that is running, keeps it alive; so does a start that is still going.
      if (this.holds > 0 || this.pending.size > 0 || this.status === 'booting') return this.touch()
      this.restart('The environment was stopped after a minute without use')
    }, SANDBOX_IDLE_MS)
  }

  /** Keeps the environment alive until the returned function is called. */
  hold() {
    this.holds++
    this.touch()
    let done = false
    return () => {
      if (done) return
      done = true
      this.holds = Math.max(0, this.holds - 1)
      this.touch()
    }
  }

  /** Where this environment stands. A failed start is retried after a pause, so it reads as idle again by then. */
  getStatus(): SandboxStatus {
    if (this.status === 'unavailable' && Date.now() - this.failedAt > RETRY_AFTER_MS) this.status = 'idle'
    return this.status
  }

  /** Starts loading Python in the background, once, then restores what the session had. It never waits. */
  warm() {
    if (this.getStatus() !== 'idle') return
    this.status = 'booting'
    this.touch()
    const booted: Promise<unknown> = this.send(
      { op: 'ping' },
      undefined,
      [],
      BOOT_TIMEOUT_MS,
      'The sandbox could not start. Check the connection and try again.',
    )
    this.booted = booted
    const controller = new AbortController()
    this.restoring = controller
    const ready: Promise<unknown> = booted
      .then(() => restorer?.(this.id, controller.signal))
      .then(
        () => {
          if (this.ready === ready) {
            this.status = 'ready'
            this.touch()
          }
        },
        (error) => {
          if (this.ready === ready) {
            this.status = 'unavailable'
            this.failedAt = Date.now()
            this.ready = null
            this.booted = null
          }
          throw error
        },
      )
    this.ready = ready
    ready.catch(() => {})
  }

  /** Writes the installed skills to `skills/` in the environment, so the terminal finds them. Skipped when nothing changed. */
  private async syncSkills(signal?: AbortSignal) {
    try {
      const skills = await Skills.list()
      const key = skills.map((skill) => `${skill.name}@${skill.updatedAt}`).join('|')
      if (key === this.skillsKey) return
      await this.send(
        { op: 'skills', skills: skills.map(({ name, description, body }) => ({ name, description, body })) },
        signal,
        [],
        COMMAND_TIMEOUT_MS,
        TIMED_OUT,
      )
      this.skillsKey = key
    } catch (error) {
      if (signal?.aborted) throw error
      // Skills are a convenience: the command itself still runs.
    }
  }

  /** A command's clock starts once Pyodide is loaded, so a slow first load never eats into its time. */
  async call(request: Request, signal?: AbortSignal, transfer: Transferable[] = [], replay = false): Promise<SandboxResult> {
    if (this.getStatus() === 'unavailable') throw new Error(SANDBOX_UNAVAILABLE)
    this.warm()
    // A restore runs its own steps while it is still `ready`'s pending part, so those wait for the worker only.
    this.touch()
    await (replay ? this.booted : this.ready)
    await this.syncSkills(signal)
    try {
      return await this.send(request, signal, transfer, COMMAND_TIMEOUT_MS, TIMED_OUT)
    } finally {
      this.touch()
    }
  }
}

const sessions = new Map<string, Session>()
const sessionOf = (id = DEFAULT_SESSION) => {
  let session = sessions.get(id)
  if (!session) sessions.set(id, (session = new Session(id)))
  return session
}

/** Where a session's environment stands. */
export const sandboxStatus = (session?: string) => sessionOf(session).getStatus()

/** Starts loading Python for a session in the background, once. It never waits: ask `sandboxStatus` when it is ready. */
export const warmSandbox = (session?: string) => sessionOf(session).warm()

/**
 * Keeps a session's environment alive while a task that needs it runs, such as a reply being written. Call the returned
 * function when the task ends; the environment is then stopped after a minute without use.
 */
export const holdSandbox = (session?: string) => sessionOf(session).hold()

/** Throws a session's environment away, such as when its chat is deleted. */
export function disposeSandbox(session: string) {
  sessions.get(session)?.restart('The sandbox was closed')
  sessions.delete(session)
}

/** Throws the environment away and starts a new one, which is restored from the session's record. */
export function resetSandbox(session?: string) {
  const s = sessionOf(session)
  s.restart('The sandbox was reset')
  s.warm()
}

/**
 * What to tell the agent when the environment cannot be used right now, or null when it can. A tool calls this first,
 * so a cold start answers at once ("booting up") instead of holding the whole reply while Python loads.
 */
export function sandboxUnavailable(session?: string): string | null {
  const s = sessionOf(session)
  s.warm()
  const now = s.getStatus()
  return now === 'ready' ? null : now === 'unavailable' ? SANDBOX_UNAVAILABLE : SANDBOX_BOOTING
}

/** Runs a shell command in a session. It is recorded and shown in its terminal unless it is part of a restore. */
export async function runShellCommand(command: string, signal?: AbortSignal, ctx: RunContext = {}) {
  const session = ctx.session ?? DEFAULT_SESSION
  const op = {
    id: crypto.randomUUID(),
    session,
    terminalId: ctx.terminalId ?? 'agent',
    source: ctx.source ?? 'ai',
    at: Date.now(),
    kind: 'shell' as const,
    command,
    output: '',
    code: 0,
  }
  if (!ctx.replay) emit({ phase: 'start', op })
  try {
    const result = (await sessionOf(session).call({ op: 'shell', command }, signal, [], ctx.replay)) as ExecResult
    if (!ctx.replay) emit({ phase: 'end', op: { ...op, output: result.output, code: result.code, cwd: result.cwd } })
    return result
  } catch (error) {
    if (!ctx.replay)
      emit({ phase: 'end', op: { ...op, output: '', code: 1 }, failed: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

/** Writes text to a file in a session and returns its full path. */
export async function writeSandboxFile(path: string, text: string, append = false, signal?: AbortSignal, ctx: RunContext = {}) {
  const session = ctx.session ?? DEFAULT_SESSION
  const op = {
    id: crypto.randomUUID(),
    session,
    terminalId: ctx.terminalId ?? 'agent',
    source: ctx.source ?? 'ai',
    at: Date.now(),
    kind: 'write' as const,
    path,
    content: text,
    append,
  }
  if (!ctx.replay) emit({ phase: 'start', op })
  try {
    const result = (await sessionOf(session).call({ op: 'write', path, text, append }, signal, [], ctx.replay)) as { path: string }
    if (!ctx.replay) emit({ phase: 'end', op })
    return result.path
  } catch (error) {
    if (!ctx.replay) emit({ phase: 'end', op, failed: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

export interface SandboxFile {
  /** Where the file came from, so it is mounted once. */
  key: string
  name: string
  load: () => Promise<Blob | null>
  /** Replaced in place when it changes, and not writable from the terminal. */
  readonly?: boolean
}

/** Puts files into a session's home folder, skipping any already there. Files over the size limit are skipped. */
export async function mountFiles(files: SandboxFile[], signal?: AbortSignal, session?: string, replay = false) {
  const s = sessionOf(session)
  const fresh = files.filter((file) => !s.mounted.has(file.key))
  if (!fresh.length) return
  const loaded: { key: string; name: string; bytes: Uint8Array; readonly?: boolean }[] = []
  for (const file of fresh) {
    const blob = await file.load()
    if (!blob || blob.size > FILE_MAX_BYTES) continue
    loaded.push({ key: file.key, name: file.name, bytes: new Uint8Array(await blob.arrayBuffer()), readonly: file.readonly })
  }
  if (!loaded.length) return
  const { paths } = (await s.call(
    { op: 'mount', files: loaded.map(({ name, bytes, readonly }) => ({ name, bytes, readonly })) },
    signal,
    loaded.map((file) => file.bytes.buffer),
    replay,
  )) as { paths: string[] }
  loaded.forEach((file, index) => s.mounted.set(file.key, paths[index]))
}

/** The bytes of a file in a session. */
export async function readSandboxFile(path: string, signal?: AbortSignal, session?: string) {
  return ((await sessionOf(session).call({ op: 'read', path }, signal)) as { bytes: Uint8Array }).bytes
}

/** Puts a file from a note into a session's home folder and returns its path. */
export async function importMedia(name: string, blob: Blob, signal?: AbortSignal, session?: string) {
  if (blob.size > FILE_MAX_BYTES) throw new Error('The file is larger than 30 MB')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const { paths } = (await sessionOf(session).call({ op: 'mount', files: [{ name, bytes }] }, signal, [bytes.buffer])) as {
    paths: string[]
  }
  return paths[0]
}
