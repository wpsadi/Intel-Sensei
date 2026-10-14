/**
 * The sandbox: Python (Pyodide, compiled to WebAssembly) with an in-memory filesystem and a small shell on top.
 * Nothing here touches the page: `sandbox.worker.ts` loads Pyodide and calls these functions, and the tests call
 * them with the same Pyodide build.
 */
import SHELL_PY from './shell.py?raw'

/** Pinned so every visitor runs the same Python. Bump both together after testing. */
export const PYODIDE_VERSION = '0.29.5'
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

/** Where files live. Attached files are put here under their own names. */
export const SANDBOX_HOME = '/home/user'
/** Largest file accepted into the sandbox. */
export const FILE_MAX_BYTES = 30 * 1024 * 1024
/** A command that runs longer than this is stopped. */
export const COMMAND_TIMEOUT_MS = 100_000
/** Most characters of a file `paste_file` writes into a note. */
export const PASTE_MAX_CHARS = 400_000

/** The part of the Pyodide API the engine uses, so a test can pass the real build and the worker can pass its own. */
export interface PyodideLike {
  FS: {
    writeFile(path: string, data: Uint8Array): void
    readFile(path: string): Uint8Array
    analyzePath(path: string): { exists: boolean }
  }
  globals: { set(name: string, value: unknown): void }
  runPython(code: string): unknown
  runPythonAsync(code: string): Promise<unknown>
  loadPackage(name: string): Promise<unknown>
}

/** Writes text to a file in the sandbox, making its folders. A relative path counts from the home folder. */
export function writeTextFile(py: PyodideLike, path: string, text: string, append = false) {
  const full = path.startsWith('/') ? path : `${SANDBOX_HOME}/${path}`
  const previous = append && py.FS.analyzePath(full).exists ? py.FS.readFile(full) : new Uint8Array()
  const added = new TextEncoder().encode(text)
  const bytes = new Uint8Array(previous.length + added.length)
  bytes.set(previous)
  bytes.set(added, previous.length)
  py.globals.set('_arg', full.slice(0, full.lastIndexOf('/')) || '/')
  py.runPython('import os; os.makedirs(_arg, exist_ok=True)')
  py.FS.writeFile(full, bytes)
  return full
}

export interface ExecResult {
  /** What the command or code printed, errors included, cut to a readable length. */
  output: string
  /** 0 for success. */
  code: number
  /** The current folder after the call. */
  cwd: string
}

/** Loads the shell. Call once, before anything else. */
export async function prepare(py: PyodideLike) {
  await py.loadPackage('micropip')
  py.runPython(SHELL_PY)
}

async function exec(py: PyodideLike, call: string, arg: string): Promise<ExecResult> {
  py.globals.set('_arg', arg)
  return JSON.parse((await py.runPythonAsync(`await ${call}(_arg)`)) as string) as ExecResult
}

/** Runs a shell command line, such as `ls -l | head -5` or `python script.py`. */
export const runShell = (py: PyodideLike, command: string) => exec(py, 'run_shell', command)

/** A name that is safe as a single file name inside the sandbox. */
export function safeName(name: string) {
  return (
    name
      .replace(/[\\/\0]/g, '_')
      .replace(/^\.+$/, '_')
      .trim() || 'file'
  )
}

/** Writes a file into the home folder and returns its path. A name already taken gets " (2)", " (3)" and so on. */
export function mountFile(py: PyodideLike, name: string, bytes: Uint8Array) {
  const clean = safeName(name)
  const dot = clean.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, '']
  let path = `${SANDBOX_HOME}/${clean}`
  for (let n = 2; py.FS.analyzePath(path).exists; n++) path = `${SANDBOX_HOME}/${stem} (${n})${ext}`
  py.FS.writeFile(path, bytes)
  return path
}

/** The bytes of a file in the sandbox; a relative path counts from the home folder. */
export function readFile(py: PyodideLike, path: string) {
  const full = path.startsWith('/') ? path : `${SANDBOX_HOME}/${path}`
  if (!py.FS.analyzePath(full).exists) throw new Error(`${path}: No such file`)
  return py.FS.readFile(full)
}
