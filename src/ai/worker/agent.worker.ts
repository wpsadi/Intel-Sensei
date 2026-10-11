import { type JSONSchema7, type LanguageModel, type Tool, ToolLoopAgent, type ToolSet, jsonSchema, stepCountIs, tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogle } from '@ai-sdk/google'
import type { FromWorker, ToWorker } from './protocol'

/**
 * Runs agent model calls off the main thread. Tools still run on the main thread, since they change the app:
 * each call is posted back and the result awaited.
 */
const post = (msg: FromWorker) => self.postMessage(msg)
const controllers = new Map<string, AbortController>()
const pendingTools = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function modelFor(msg: Extract<ToWorker, { type: 'start' }>): LanguageModel {
  return msg.provider === 'openai' ? createOpenAI({ apiKey: msg.key, baseURL: msg.baseURL })(msg.model) : createGoogle({ apiKey: msg.key, baseURL: msg.baseURL })(msg.model)
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
            value: [{ type: 'text' as const, text: 'Rendered view:' }, { type: 'file' as const, mediaType: output.mediaType, data: { type: 'data' as const, data: output.image } }],
          }),
        }),
      } as never) as Tool,
    ]),
  )
  try {
    const agent = new ToolLoopAgent({
      model: modelFor(msg),
      instructions: msg.instructions,
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
      else if (p.type === 'tool-result') part({ type: 'tool-result', toolCallId: p.toolCallId, toolName: p.toolName, output: msg.tools[p.toolName]?.imageOutput ? null : p.output })
      else if (p.type === 'tool-error') part({ type: 'tool-error', toolCallId: p.toolCallId, toolName: p.toolName, error: String(p.error) })
      else if (p.type === 'error' && !controller.signal.aborted) part({ type: 'error', error: errorText(p.error) })
    }
    const messages = controller.signal.aborted ? [] : (await result.response).messages
    post({ type: 'done', runId: msg.runId, messages, aborted: controller.signal.aborted })
  } catch (error) {
    post({ type: 'done', runId: msg.runId, messages: [], aborted: controller.signal.aborted, error: controller.signal.aborted ? undefined : errorText(error) })
  } finally {
    controllers.delete(msg.runId)
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  if (msg.type === 'start') void runPass(msg)
  else if (msg.type === 'abort') controllers.get(msg.runId)?.abort()
  else if (msg.type === 'tool-result') {
    const p = pendingTools.get(msg.callId)
    pendingTools.delete(msg.callId)
    if (msg.error !== undefined) p?.reject(new Error(msg.error))
    else p?.resolve(msg.result)
  }
}
