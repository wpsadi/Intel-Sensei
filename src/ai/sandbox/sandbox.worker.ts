/// <reference lib="webworker" />
import { type ExecResult, PYODIDE_INDEX_URL, type PyodideLike, mountFile, prepare, readFile, runShell, writeTextFile } from './engine'

/** What the page asks for. `id` pairs a request with its reply. */
export type SandboxRequest = { id: number } & (
  | { op: 'shell'; command: string }
  | { op: 'ping' }
  | { op: 'write'; path: string; text: string; append: boolean }
  | { op: 'mount'; files: { name: string; bytes: Uint8Array }[] }
  | { op: 'read'; path: string }
)
export type SandboxResult = ExecResult | { paths: string[] } | { bytes: Uint8Array } | { path: string }
export type SandboxResponse = { id: number; ok: true; result: SandboxResult } | { id: number; ok: false; error: string }

/** Pyodide loads once, on the first request, and is kept for the rest. A failed load is retried on the next request. */
let ready: Promise<PyodideLike> | null = null
function python() {
  ready ??= (async () => {
    // The Pyodide loader is fetched from the pinned CDN path; a bundler cannot resolve it at build time.
    const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)
    const py = (await loadPyodide({ indexURL: PYODIDE_INDEX_URL })) as PyodideLike
    await prepare(py)
    return py
  })().catch((error) => {
    ready = null
    throw error
  })
  return ready
}

/** A Python traceback ends with the exception line, which is the part worth showing. */
const errorLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).trim().split('\n').at(-1) || 'The sandbox failed'

self.onmessage = async (event: MessageEvent<SandboxRequest>) => {
  const request = event.data
  try {
    const py = await python()
    let result: SandboxResult
    if (request.op === 'shell') result = await runShell(py, request.command)
    else if (request.op === 'ping') result = { paths: [] }
    else if (request.op === 'write') result = { path: writeTextFile(py, request.path, request.text, request.append) }
    else if (request.op === 'mount') result = { paths: request.files.map((file) => mountFile(py, file.name, file.bytes)) }
    else result = { bytes: readFile(py, request.path) }
    self.postMessage({ id: request.id, ok: true, result } satisfies SandboxResponse)
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: errorLine(error) } satisfies SandboxResponse)
  }
}
