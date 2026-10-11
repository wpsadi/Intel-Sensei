import type { FromWorker, StreamPart, ToWorker } from './protocol'

export type { StreamPart, ToolSpec } from './protocol'

type Start = Omit<Extract<ToWorker, { type: 'start' }>, 'type' | 'runId'>
type Done = Extract<FromWorker, { type: 'done' }>

interface Pass {
  onPart: (p: StreamPart) => void
  execTool: (name: string, args: unknown) => unknown
  done: (d: Done) => void
}

let worker: Worker | null = null
const passes = new Map<string, Pass>()

function agentWorker() {
  if (!worker) {
    worker = new Worker(new URL('./agent.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = async (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      const pass = passes.get(msg.runId)
      if (msg.type === 'part') pass?.onPart(msg.part)
      else if (msg.type === 'done') {
        passes.delete(msg.runId)
        pass?.done(msg)
      } else if (msg.type === 'tool-exec') {
        const reply = (r: { result?: unknown; error?: string }) => worker?.postMessage({ type: 'tool-result', callId: msg.callId, ...r } satisfies ToWorker)
        try {
          if (!pass) throw new Error('The run has ended')
          reply({ result: await pass.execTool(msg.name, msg.args) })
        } catch (error) {
          reply({ error: error instanceof Error ? error.message : String(error) })
        }
      }
    }
  }
  return worker
}

/**
 * Streams one agent pass (a tool loop) in the shared worker. Parts arrive in `onPart`; tool calls run here through
 * `execTool`. Resolves with the pass's response messages once it ends, is aborted or fails.
 */
export function streamInWorker(start: Start, opts: { signal: AbortSignal; onPart: (p: StreamPart) => void; execTool: (name: string, args: unknown) => unknown }): Promise<Done> {
  const runId = crypto.randomUUID()
  return new Promise((done) => {
    passes.set(runId, { onPart: opts.onPart, execTool: opts.execTool, done })
    const w = agentWorker()
    w.postMessage({ type: 'start', runId, ...start } satisfies ToWorker)
    if (opts.signal.aborted) w.postMessage({ type: 'abort', runId } satisfies ToWorker)
    else opts.signal.addEventListener('abort', () => w.postMessage({ type: 'abort', runId } satisfies ToWorker), { once: true })
  })
}
