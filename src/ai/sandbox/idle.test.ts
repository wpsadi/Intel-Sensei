import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** A worker that answers every request at once, so the client's own timing can be tested without Pyodide. */
class FakeWorker {
  static alive = 0
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  constructor() {
    FakeWorker.alive++
  }
  postMessage(request: { id: number; op: string }) {
    const result = request.op === 'shell' ? { output: 'ok\n', code: 0, cwd: '/home/user' } : { paths: [] }
    queueMicrotask(() => this.onmessage?.({ data: { id: request.id, ok: true, result } } as MessageEvent))
  }
  terminate() {
    FakeWorker.alive--
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('Worker', FakeWorker)
  FakeWorker.alive = 0
  vi.resetModules()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const load = () => import('./client')

describe('the environment stops when nothing uses it', () => {
  it('is stopped after a minute without use, and starts again on the next use', async () => {
    const sandbox = await load()
    sandbox.warmSandbox('chat-1')
    await vi.advanceTimersByTimeAsync(10)
    expect(sandbox.sandboxStatus('chat-1')).toBe('ready')
    expect(FakeWorker.alive).toBe(1)

    await vi.advanceTimersByTimeAsync(sandbox.SANDBOX_IDLE_MS + 10)
    expect(sandbox.sandboxStatus('chat-1')).toBe('idle')
    expect(FakeWorker.alive).toBe(0)

    // A command starts it again and runs.
    const run = sandbox.runShellCommand('ls', undefined, { session: 'chat-1' })
    await vi.advanceTimersByTimeAsync(10)
    expect((await run).output).toBe('ok\n')
    expect(FakeWorker.alive).toBe(1)
  })

  it('counts from the last command, not from the start', async () => {
    const sandbox = await load()
    sandbox.warmSandbox('chat-1')
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(sandbox.SANDBOX_IDLE_MS - 5_000)
    const run = sandbox.runShellCommand('ls', undefined, { session: 'chat-1' })
    await vi.advanceTimersByTimeAsync(10)
    await run
    await vi.advanceTimersByTimeAsync(sandbox.SANDBOX_IDLE_MS - 5_000)
    expect(sandbox.sandboxStatus('chat-1')).toBe('ready')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sandbox.sandboxStatus('chat-1')).toBe('idle')
  })

  it('stays alive while a task holds it, and stops a minute after the task ends', async () => {
    const sandbox = await load()
    sandbox.warmSandbox('chat-1')
    const release = sandbox.holdSandbox('chat-1')
    await vi.advanceTimersByTimeAsync(sandbox.SANDBOX_IDLE_MS * 3)
    expect(sandbox.sandboxStatus('chat-1')).toBe('ready')
    release()
    release() // releasing twice must not release another task's hold
    await vi.advanceTimersByTimeAsync(sandbox.SANDBOX_IDLE_MS - 1_000)
    expect(sandbox.sandboxStatus('chat-1')).toBe('ready')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(sandbox.sandboxStatus('chat-1')).toBe('idle')
  })

  it('keeps each chat on its own clock', async () => {
    const sandbox = await load()
    sandbox.warmSandbox('a')
    await vi.advanceTimersByTimeAsync(30_000)
    sandbox.warmSandbox('b')
    await vi.advanceTimersByTimeAsync(31_000)
    expect(sandbox.sandboxStatus('a')).toBe('idle')
    expect(sandbox.sandboxStatus('b')).toBe('ready')
  })
})
