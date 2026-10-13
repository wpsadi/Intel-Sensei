import type { ModelMessage } from 'ai'

/** Messages between the main thread (`client.ts`) and `agent.worker.ts`. */
export type ToWorker =
  | {
      type: 'start'
      runId: string
      provider: 'openai' | 'google' | 'anthropic'
      key: string
      baseURL?: string
      model: string
      instructions: string
      maxSteps?: number
      /** Passed to the model as `providerOptions`; plain data only. */
      providerOptions?: Record<string, Record<string, unknown>>
      tools: Record<string, ToolSpec>
      messages: ModelMessage[]
      /** Context window in tokens. When a step would come near it, older messages are summarized (compaction). */
      contextLimit?: number
    }
  | { type: 'abort'; runId: string }
  | { type: 'tool-result'; callId: string; result?: unknown; error?: string }

export interface ToolSpec {
  description: string
  /** JSON schema of the input. */
  schema: unknown
  /** The result is `{ image, mediaType }` and goes back to the model as a picture rather than base64 text. */
  imageOutput?: boolean
}

export type StreamPart =
  | { type: 'text-delta' | 'reasoning-delta'; text: string }
  | { type: 'reasoning-start' }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: string }
  | { type: 'error'; error: string }
  /** How full the context was after a model step: its input plus its output. */
  | { type: 'usage'; contextTokens: number; inputTokens: number; outputTokens: number }
  /** Tokens one model call was billed for, for the usage log. `compaction` marks the summary call. */
  | { type: 'spend'; compaction?: boolean; inputTokens: number; outputTokens: number; reasoningTokens?: number; cachedTokens?: number; cacheWriteTokens?: number }
  /** Older messages were summarized to make room. */
  | { type: 'compacted'; beforeTokens: number; afterTokens: number }

export type FromWorker =
  | { type: 'part'; runId: string; part: StreamPart }
  | { type: 'tool-exec'; runId: string; callId: string; name: string; args: unknown }
  /** `replaced`: compaction rewrote the history, so `messages` is the whole new history, not only this pass's replies. */
  | { type: 'done'; runId: string; messages: ModelMessage[]; replaced?: boolean; aborted: boolean; error?: string }
