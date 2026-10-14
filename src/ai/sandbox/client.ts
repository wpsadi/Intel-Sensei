import { COMMAND_TIMEOUT_MS, type ExecResult, FILE_MAX_BYTES } from './engine'
import type { SandboxRequest, SandboxResponse, SandboxResult } from './sandbox.worker'

type Pending = { resolve: (result: SandboxResult) => void; reject: (error: Error) => void }
/** A request without its id, which the client assigns. */
type Request = SandboxRequest extends infer R ? (R extends SandboxRequest ? Omit<R, 'id'> : never) : never

/** Loading Pyodide for the first time is allowed longer than a command, and does not count against a command's time. */
const BOOT_TIMEOUT_MS = 180_000
const TIMED_OUT = `The command was stopped after ${COMMAND_TIMEOUT_MS / 1000} seconds. The sandbox was reset to stop it: files you created are gone, and files attached to the chat are put back on the next command. Do less per command, for example one page range, head or grep instead of the whole file, then run it again.`

/** After a failed start, wait this long before trying again. */
const RETRY_AFTER_MS = 30_000

export type SandboxStatus = 'idle' | 'booting' | 'ready' | 'unavailable'
export const SANDBOX_BOOTING =
  'Booting up the environment. It is not ready yet: carry on with what you can do without it, and try again in a few seconds.'
export const SANDBOX_UNAVAILABLE = 'Not available at the moment.'

let worker: Worker | null = null
let booted: Promise<unknown> | null = null
let status: SandboxStatus = 'idle'
let failedAt = 0
let nextId = 1
const pending = new Map<number, Pending>()
/** Files already put into the current worker, by where they came from. A restarted worker starts empty, so this resets too. */
const mounted = new Map<string, string>()

function fail(id: number, error: Error) {
  pending.get(id)?.reject(error)
  pending.delete(id)
}

/** Throws the worker away, files and variables with it. Calls still waiting fail, and the next call starts a fresh worker. */
function restart(reason: string) {
  worker?.terminate()
  worker = null
  booted = null
  status = 'idle'
  mounted.clear()
  for (const id of [...pending.keys()]) fail(id, new Error(reason))
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./sandbox.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<SandboxResponse>) => {
    const reply = event.data
    const waiting = pending.get(reply.id)
    if (!waiting) return
    pending.delete(reply.id)
    if (reply.ok) waiting.resolve(reply.result)
    else waiting.reject(new Error(reply.error))
  }
  worker.onerror = (event) => restart(event.message ? `The sandbox stopped: ${event.message}` : 'The sandbox stopped')
  return worker
}

/** Sends one request to the sandbox worker and gives up after `limit`, restarting the worker since Python cannot be interrupted in place. */
function send(
  request: Request,
  signal: AbortSignal | undefined,
  transfer: Transferable[],
  limit: number,
  timeoutMessage: string,
): Promise<SandboxResult> {
  if (signal?.aborted) return Promise.reject(new DOMException('Stopped', 'AbortError'))
  return new Promise<SandboxResult>((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      fail(id, new Error(timeoutMessage))
      restart('The sandbox was reset. Try the command again.')
    }, limit)
    const onAbort = () => fail(id, new DOMException('Stopped', 'AbortError'))
    const settle = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    pending.set(id, {
      resolve: (result) => (settle(), resolve(result)),
      reject: (error) => (settle(), reject(error)),
    })
    getWorker().postMessage({ id, ...request }, transfer)
  })
}

/** Where the environment stands. A failed start is retried after a pause, so it reads as idle again by then. */
export function sandboxStatus(): SandboxStatus {
  if (status === 'unavailable' && Date.now() - failedAt > RETRY_AFTER_MS) status = 'idle'
  return status
}

/** Starts loading Python in the background, once. It never waits: ask `sandboxStatus` when it is ready. */
export function warmSandbox() {
  if (sandboxStatus() !== 'idle') return
  status = 'booting'
  const attempt: Promise<unknown> = send(
    { op: 'ping' },
    undefined,
    [],
    BOOT_TIMEOUT_MS,
    'The sandbox could not start. Check the connection and try again.',
  ).then(
    (result) => {
      if (booted === attempt) status = 'ready'
      return result
    },
    (error) => {
      if (booted === attempt) {
        status = 'unavailable'
        failedAt = Date.now()
        booted = null
      }
      throw error
    },
  )
  booted = attempt
  attempt.catch(() => {})
}

/**
 * What to tell the agent when the environment cannot be used right now, or null when it can. A tool calls this first,
 * so a cold start answers at once ("booting up") instead of holding the whole reply while Python loads.
 */
export function sandboxUnavailable(): string | null {
  warmSandbox()
  const now = sandboxStatus()
  return now === 'ready' ? null : now === 'unavailable' ? SANDBOX_UNAVAILABLE : SANDBOX_BOOTING
}

/** A command's clock starts once Pyodide is loaded, so a slow first load never eats into its time. */
async function call(request: Request, signal?: AbortSignal, transfer: Transferable[] = []): Promise<SandboxResult> {
  if (sandboxStatus() === 'unavailable') throw new Error(SANDBOX_UNAVAILABLE)
  warmSandbox()
  await booted
  return send(request, signal, transfer, COMMAND_TIMEOUT_MS, TIMED_OUT)
}

export const runShellCommand = (command: string, signal?: AbortSignal) => call({ op: 'shell', command }, signal) as Promise<ExecResult>

/** Writes text to a file in the sandbox and returns its full path. */
export async function writeSandboxFile(path: string, text: string, append = false, signal?: AbortSignal) {
  return ((await call({ op: 'write', path, text, append }, signal)) as { path: string }).path
}

export interface SandboxFile {
  /** Where the file came from, so it is mounted once. */
  key: string
  name: string
  load: () => Promise<Blob | null>
}

/** Puts files into the sandbox's home folder, skipping any already there. Files over the size limit are skipped. */
export async function mountFiles(files: SandboxFile[], signal?: AbortSignal) {
  const fresh = files.filter((file) => !mounted.has(file.key))
  if (!fresh.length) return
  const loaded: { key: string; name: string; bytes: Uint8Array }[] = []
  for (const file of fresh) {
    const blob = await file.load()
    if (!blob || blob.size > FILE_MAX_BYTES) continue
    loaded.push({ key: file.key, name: file.name, bytes: new Uint8Array(await blob.arrayBuffer()) })
  }
  if (!loaded.length) return
  const { paths } = (await call(
    { op: 'mount', files: loaded.map(({ name, bytes }) => ({ name, bytes })) },
    signal,
    loaded.map((file) => file.bytes.buffer),
  )) as { paths: string[] }
  loaded.forEach((file, index) => mounted.set(file.key, paths[index]))
}

/** The bytes of a file in the sandbox. */
export async function readSandboxFile(path: string, signal?: AbortSignal) {
  return ((await call({ op: 'read', path }, signal)) as { bytes: Uint8Array }).bytes
}

/** Puts a file from a note into the sandbox's home folder and returns its path. */
export async function importMedia(name: string, blob: Blob, signal?: AbortSignal) {
  if (blob.size > FILE_MAX_BYTES) throw new Error('The file is larger than 30 MB')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const { paths } = (await call({ op: 'mount', files: [{ name, bytes }] }, signal, [bytes.buffer])) as { paths: string[] }
  return paths[0]
}
