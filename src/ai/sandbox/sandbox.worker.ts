/// <reference lib="webworker" />
import {
  type ExecResult,
  PYODIDE_INDEX_URL,
  type PyodideLike,
  SANDBOX_HOME,
  mountFile,
  prepare,
  readFile,
  runShell,
  writeSkills,
  writeTextFile,
} from './engine'
import { installRuntimeAssetCache } from '@/lib/runtime-asset-cache'

installRuntimeAssetCache()

/** What the page asks for. `id` pairs a request with its reply. */
export type SandboxRequest = { id: number } & (
  | { op: 'shell'; command: string }
  | { op: 'ping' }
  | { op: 'write'; path: string; text: string; append: boolean }
  | { op: 'mount'; files: { name: string; bytes: Uint8Array; readonly?: boolean }[] }
  | { op: 'read'; path: string }
  | { op: 'skills'; skills: { name: string; description: string; body: string }[] }
  | { op: 'bundle'; files: { path: string; text: string }[] }
  | { op: 'swiftlatex'; command: string }
)
export type SandboxResult = ExecResult | { paths: string[] } | { bytes: Uint8Array } | { path: string }
export type SandboxResponse = { id: number; ok: true; result: SandboxResult } | { id: number; ok: false; error: string }

/**
 * SwiftLaTeX is an Emscripten worker that cannot run inside Pyodide itself. The
 * sandbox worker starts it as a child worker, copies the source into its virtual
 * filesystem, and writes the resulting PDF back to Pyodide. Keeping the child
 * alive means `latex --enable-swiftlatex` only downloads the WASM once per
 * sandbox session.
 */
type SwiftLatexMessage = {
  cmd?: string
  result?: string
  status?: number
  log?: string
  pdf?: ArrayBuffer
}

let swiftLatex: { worker: Worker; ready: Promise<void> } | null = null

const SWIFT_LATEX_SCRIPT = '/swiftlatex/swiftlatexpdftex.js'

function waitForSwiftMessage(worker: Worker, predicate: (message: SwiftLatexMessage) => boolean) {
  return new Promise<SwiftLatexMessage>((resolve, reject) => {
    const onMessage = (event: MessageEvent<SwiftLatexMessage>) => {
      if (!predicate(event.data)) {
        // The engine reports initialization failures as a message instead of
        // raising a Worker error. Do not leave the command waiting for the
        // sandbox timeout in that case.
        // Compilation failures carry `cmd: compile` and are returned to the
        // caller so it can preserve the TeX log and non-zero exit code.
        if (event.data.result !== 'failed' || event.data.cmd === 'compile') return
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
        reject(
          new Error([event.data.log?.trim(), `SwiftLaTeX exited with status ${event.data.status ?? 'unknown'}`].filter(Boolean).join('\n')),
        )
        return
      }
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      resolve(event.data)
    }
    const onError = (event: ErrorEvent) => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      reject(new Error(event.message || 'SwiftLaTeX worker stopped'))
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
  })
}

async function swiftLatexEngine() {
  if (swiftLatex) {
    await swiftLatex.ready
    return swiftLatex
  }
  const worker = new Worker(new URL(SWIFT_LATEX_SCRIPT, self.location.origin))
  const ready = waitForSwiftMessage(worker, (message) => message.result === 'ok').then(() => undefined)
  swiftLatex = { worker, ready }
  try {
    await ready
  } catch (error) {
    worker.terminate()
    swiftLatex = null
    throw error
  }
  return swiftLatex
}

const swiftError = (message: SwiftLatexMessage) =>
  [message.log?.trim(), `SwiftLaTeX exited with status ${message.status ?? 'unknown'}`].filter(Boolean).join('\n')

async function runSwiftLatex(py: PyodideLike, command: string): Promise<ExecResult> {
  const enable = /^(?:latex|tex)\s+--enable-swiftlatex$/i.test(command.trim())
  const match = command.trim().match(/^(?:latex|tex)\s+(?:--swiftlatex|--compile)\s+(.+)$/i)
  if (!enable && !match) {
    return {
      output: 'Usage: latex --enable-swiftlatex, then latex --swiftlatex file.tex\n',
      code: 2,
      cwd: SANDBOX_HOME,
    }
  }

  if (!enable && !swiftLatex) {
    return {
      output: 'SwiftLaTeX is not enabled. Run: latex --enable-swiftlatex\n',
      code: 2,
      cwd: SANDBOX_HOME,
    }
  }
  const engine = await swiftLatexEngine()
  if (enable) {
    return {
      output: 'SwiftLaTeX is enabled. Compile a source file with: latex --swiftlatex file.tex\n',
      code: 0,
      cwd: SANDBOX_HOME,
    }
  }

  // The command is intentionally a single-file operation. Shell quoting is
  // handled by the terminal before this bridge is called; reject paths that
  // could escape the sandbox's home directory.
  const requested = match![1].trim().replace(/^['"]|['"]$/g, '')
  if (!requested || requested.includes('\0') || requested.startsWith('/') || requested.split(/[\\/]/).includes('..')) {
    return { output: 'latex: expected a .tex source file\n', code: 2, cwd: SANDBOX_HOME }
  }
  const cwd = String(py.runPython('import os\nos.getcwd()') || SANDBOX_HOME)
  const sourcePath = `${cwd}/${requested}`
  if (!/\.(?:tex|latex)$/i.test(sourcePath)) {
    return { output: `${requested}: expected a .tex or .latex source file\n`, code: 2, cwd }
  }

  let source: Uint8Array
  try {
    source = readFile(py, sourcePath)
  } catch (error) {
    return { output: `${requested}: ${error instanceof Error ? error.message : String(error)}\n`, code: 1, cwd }
  }
  const filename = sourcePath.slice(sourcePath.lastIndexOf('/') + 1)
  const worker = engine.worker
  // writefile and setmainfile are synchronous from the engine's perspective;
  // the following compile message is queued after them.
  const resultPromise = waitForSwiftMessage(worker, (message) => message.cmd === 'compile')
  worker.postMessage({ cmd: 'writefile', url: filename, src: source }, [source.buffer])
  worker.postMessage({ cmd: 'setmainfile', url: filename })
  worker.postMessage({ cmd: 'compilelatex' })
  const result = await resultPromise
  if (result.result !== 'ok' || !result.pdf) {
    return { output: `${swiftError(result)}\n`, code: 1, cwd }
  }

  const outputPath = sourcePath.replace(/\.(?:tex|latex)$/i, '.pdf')
  py.globals.set('_swift_pdf_dir', outputPath.slice(0, outputPath.lastIndexOf('/')) || '/')
  py.runPython('import os; os.makedirs(_swift_pdf_dir, exist_ok=True)')
  py.FS.writeFile(outputPath, new Uint8Array(result.pdf))
  const log = result.log?.trim()
  const output = `${requested}: SwiftLaTeX compiled ${outputPath}\n${log ? `${log}\n` : ''}`
  return { output, code: 0, cwd }
}

/** Modules scripts and the PDF commands use most. They are not needed to start, so a failure here is ignored. */
async function preload(py: PyodideLike) {
  try {
    await py.loadPackage(['pillow', 'numpy', 'pandas'])
    await py.runPythonAsync('import micropip\nawait micropip.install("pypdf==6.19.0")')
  } catch {
    // Each one still loads on first use.
  }
}

/** Pyodide loads once, on the first request, and is kept for the rest. A failed load is retried on the next request. */
let ready: Promise<PyodideLike> | null = null
function python() {
  ready ??= (async () => {
    // The Pyodide loader is fetched from the pinned CDN path; a bundler cannot resolve it at build time.
    const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)
    const py = (await loadPyodide({ indexURL: PYODIDE_INDEX_URL })) as PyodideLike
    await prepare(py)
    // The usual modules load in the background, so the first script that needs them does not wait for a download.
    void preload(py)
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
    else if (request.op === 'skills') result = { path: writeSkills(py, request.skills) }
    else if (request.op === 'bundle') {
      for (const file of request.files) {
        if (
          !file.path.startsWith('bundled/') ||
          file.path.split('/').some((part) => !part || part === '..' || part === '.') ||
          file.path.includes('\\') ||
          file.path.includes('\0')
        )
          throw new Error('Invalid bundled file path')
        writeTextFile(py, file.path, file.text)
      }
      result = { paths: request.files.map((file) => `${SANDBOX_HOME}/${file.path}`) }
    } else if (request.op === 'mount') result = { paths: request.files.map((file) => mountFile(py, file.name, file.bytes, file.readonly)) }
    else if (request.op === 'swiftlatex') result = await runSwiftLatex(py, request.command)
    else result = { bytes: readFile(py, request.path) }
    self.postMessage({ id: request.id, ok: true, result } satisfies SandboxResponse)
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: errorLine(error) } satisfies SandboxResponse)
  }
}
