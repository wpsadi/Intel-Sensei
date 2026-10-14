import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import {
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
  type Tool,
  ToolLoopAgent,
  type ToolSet,
  generateText,
  jsonSchema,
  stepCountIs,
  tool,
} from 'ai'

import type { FromWorker, StreamPart, ToWorker } from './protocol'

/**
 * Runs agent model calls off the main thread. Tools still run on the main thread, since they change the app:
 * each call is posted back and the result awaited.
 */
const post = (msg: FromWorker) => self.postMessage(msg)
const controllers = new Map<string, AbortController>()
const steers = new Map<string, { id: string; text: string }[]>()
const pendingTools = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function modelFor(msg: Extract<ToWorker, { type: 'start' }>): LanguageModel {
  if (msg.provider === 'openai') return createOpenAI({ apiKey: msg.key, baseURL: msg.baseURL })(msg.model)
  // Anthropic refuses browser calls unless the request says it is deliberate; the key is the user's own, kept in their browser.
  if (msg.provider === 'anthropic')
    return createAnthropic({ apiKey: msg.key, baseURL: msg.baseURL, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(
      msg.model,
    )
  return createGoogle({ apiKey: msg.key, baseURL: msg.baseURL })(msg.model)
}

/** Rough tokens of a message list: text at ~4 characters a token, each image or file at a flat cost. */
function estimateTokens(messages: ModelMessage[]) {
  let chars = 0,
    files = 0
  const walk = (v: unknown) => {
    if (typeof v === 'string') chars += v.length
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.type === 'file' || o.type === 'image' || o.type === 'image-data' || o.type === 'file-data') return void files++
      Object.values(o).forEach(walk)
    }
  }
  walk(messages)
  return Math.ceil(chars / 4) + files * 1500
}

/** A message as plain text for the summarizer: files left out, long tool output cut. */
function asTranscript(m: ModelMessage) {
  const parts =
    typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content as { type: string; [k: string]: unknown }[])
  const lines = parts.map((p) => {
    if (p.type === 'text' || p.type === 'reasoning') return String(p.text ?? '')
    if (p.type === 'tool-call') return `[called ${p.toolName} ${JSON.stringify(p.input).slice(0, 600)}]`
    if (p.type === 'tool-result') return `[${p.toolName} returned ${JSON.stringify(p.output).slice(0, 800)}]`
    return `[${p.type}]`
  })
  return `${m.role.toUpperCase()}: ${lines.join('\n')}`
}

const KEEP_TAIL = 6

/**
 * Compaction: replaces everything but the last few messages with one summary written by the same model, so a long
 * run keeps going inside the context window. The kept tail never starts on a tool result, which needs its call.
 */
type Spend = Omit<Extract<StreamPart, { type: 'spend' }>, 'type'>

/** The billable token counts of a step, in the shape the usage log takes. */
function spendOf(usage: {
  inputTokens?: number
  outputTokens?: number
  outputTokenDetails?: { reasoningTokens?: number }
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }
}): Spend {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens || undefined,
    cachedTokens: usage.inputTokenDetails?.cacheReadTokens || undefined,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens || undefined,
  }
}

async function compact(model: LanguageModel, messages: ModelMessage[], signal: AbortSignal, onSpend: (usage: Spend) => void) {
  let cut = Math.max(1, messages.length - KEEP_TAIL)
  while (cut < messages.length && messages[cut].role === 'tool') cut++
  if (cut >= messages.length - 1) cut = Math.max(1, messages.length - 2)
  while (cut > 0 && messages[cut].role === 'tool') cut--
  const older = messages.slice(0, cut)
  if (!older.length) return messages
  const { text, usage } = await generateText({
    model,
    abortSignal: signal,
    system:
      "You compress an AI agent's working history so it can continue its task. Keep: the user's requests and goal word for word, decisions, constraints, every id that was created or changed (scenes, objects, nodes, pages, notes) with what it is, what is done and what is still to do, open problems, and the to-do list state. Drop chit-chat and raw data. Write compact markdown.",
    prompt: older.map(asTranscript).join('\n\n').slice(-400_000),
  })
  onSpend({ ...spendOf(usage), compaction: true })
  return [
    {
      role: 'user' as const,
      content: `Summary of the earlier conversation and work (older messages were compacted to fit the context window):\n\n${text}`,
    },
    ...messages.slice(cut),
  ]
}

async function runPass(msg: Extract<ToWorker, { type: 'start' }>) {
  const controller = new AbortController()
  controllers.set(msg.runId, controller)
  const part = (p: Extract<FromWorker, { type: 'part' }>['part']) => post({ type: 'part', runId: msg.runId, part: p })
  const tools: ToolSet = Object.fromEntries(
    Object.entries(msg.tools).map(([name, t]) => [
      name,
      tool({
        description: t.description,
        inputSchema: jsonSchema(t.schema as JSONSchema7),
        execute: (args: unknown, { toolCallId }: { toolCallId: string }) =>
          new Promise((resolve, reject) => {
            const callId = `${msg.runId}:${toolCallId}`
            pendingTools.set(callId, { resolve, reject })
            post({ type: 'tool-exec', runId: msg.runId, callId, name, args })
          }),
        ...(t.imageOutput && {
          toModelOutput: ({ output }: { output: { image: string; mediaType: string } }) => ({
            type: 'content' as const,
            value: [
              { type: 'text' as const, text: 'Rendered view:' },
              { type: 'file' as const, mediaType: output.mediaType, data: { type: 'data' as const, data: output.image } },
            ],
          }),
        }),
      } as never) as Tool,
    ]),
  )
  const model = modelFor(msg)
  // After a compaction the history is ours, not the SDK's; `latest` tracks it so the main thread gets it back.
  let latest: ModelMessage[] | null = null
  let lastContext = 0
  const limit = msg.contextLimit
  // Anthropic caches the prefix up to each marked block: one mark on the system prompt (reused across runs),
  // one on the last message (so each step only pays for what it added).
  const cache = msg.provider === 'anthropic'
  const ephemeral = { anthropic: { cacheControl: { type: 'ephemeral' } } }
  const withCache = (messages: ModelMessage[]) =>
    !cache || !messages.length
      ? messages
      : (messages.map((m, i) =>
          i === messages.length - 1 ? { ...m, providerOptions: { ...m.providerOptions, ...ephemeral } } : m,
        ) as ModelMessage[])
  try {
    const agent = new ToolLoopAgent({
      model,
      prepareStep: async ({
        messages: stepMessages,
        steps,
      }: {
        messages: ModelMessage[]
        steps: { usage?: { inputTokens?: number; outputTokens?: number } }[]
      }) => {
        // Steering messages join the history here, before the model's next step. The history is then ours, as after a
        // compaction, so the main thread gets all of it back.
        const arrived = steers.get(msg.runId)?.splice(0) ?? []
        let messages = stepMessages
        if (arrived.length) {
          messages = [...stepMessages, ...arrived.map(({ text }) => ({ role: 'user' as const, content: text }))]
          latest = messages
          for (const { id } of arrived) part({ type: 'steered', id })
        }
        if (!limit) return { messages: withCache(messages) }
        const last = steps.at(-1)?.usage
        const used = Math.max(last ? (last.inputTokens ?? 0) + (last.outputTokens ?? 0) : 0, estimateTokens(messages))
        if (used < limit * 0.8) {
          if (latest) latest = messages
          return { messages: withCache(messages) }
        }
        const next = await compact(model, messages, controller.signal, (u) => part({ type: 'spend', ...u }))
        const after = estimateTokens(next)
        part({ type: 'compacted', beforeTokens: used, afterTokens: after })
        latest = next
        return { messages: withCache(next) }
      },
      instructions:
        cache && msg.instructions ? { role: 'system', content: msg.instructions, providerOptions: ephemeral } : msg.instructions,
      tools,
      ...(msg.maxSteps && { stopWhen: stepCountIs(msg.maxSteps) }),
      providerOptions: msg.providerOptions as never,
    })
    const result = await agent.stream({ messages: msg.messages, abortSignal: controller.signal })
    for await (const p of result.fullStream) {
      if (p.type === 'text-delta' || p.type === 'reasoning-delta') part({ type: p.type, text: p.text })
      else if (p.type === 'reasoning-start') part({ type: 'reasoning-start' })
      else if (p.type === 'tool-call') part({ type: 'tool-call', toolCallId: p.toolCallId, toolName: p.toolName, input: p.input })
      // Images stay in the worker; the main thread only needs to know the call finished.
      else if (p.type === 'tool-result')
        part({
          type: 'tool-result',
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          output: msg.tools[p.toolName]?.imageOutput ? null : p.output,
        })
      else if (p.type === 'tool-error') part({ type: 'tool-error', toolCallId: p.toolCallId, toolName: p.toolName, error: String(p.error) })
      else if (p.type === 'finish-step') {
        const u = (p as { usage?: Parameters<typeof spendOf>[0] }).usage
        if (u) {
          part({ type: 'spend', ...spendOf(u) })
          lastContext = (u.inputTokens ?? 0) + (u.outputTokens ?? 0)
          part({ type: 'usage', contextTokens: lastContext, inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0 })
        }
      } else if (p.type === 'error' && !controller.signal.aborted) part({ type: 'error', error: errorText(p.error) })
    }
    const messages = controller.signal.aborted ? [] : (await result.response).messages
    if (latest && !controller.signal.aborted) {
      // The last step's own messages are not in `latest` yet: its reply, plus tool results if it called tools.
      const steps = await result.steps
      const tail = 1 + ((steps.at(-1)?.toolResults?.length ?? 0) > 0 ? 1 : 0)
      post({
        type: 'done',
        runId: msg.runId,
        messages: [...(latest as ModelMessage[]), ...messages.slice(-tail)],
        replaced: true,
        aborted: false,
      })
    } else post({ type: 'done', runId: msg.runId, messages, aborted: controller.signal.aborted })
  } catch (error) {
    post({
      type: 'done',
      runId: msg.runId,
      messages: [],
      aborted: controller.signal.aborted,
      error: controller.signal.aborted ? undefined : errorText(error),
    })
  } finally {
    controllers.delete(msg.runId)
    steers.delete(msg.runId)
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  if (msg.type === 'start') void runPass(msg)
  else if (msg.type === 'abort') controllers.get(msg.runId)?.abort()
  else if (msg.type === 'steer') {
    if (controllers.has(msg.runId)) steers.set(msg.runId, [...(steers.get(msg.runId) ?? []), { id: msg.id, text: msg.text }])
  } else if (msg.type === 'tool-result') {
    const p = pendingTools.get(msg.callId)
    pendingTools.delete(msg.callId)
    if (msg.error !== undefined) p?.reject(new Error(msg.error))
    else p?.resolve(msg.result)
  }
}
