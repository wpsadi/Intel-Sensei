import { type JSONSchema7, type LanguageModel, type ModelMessage, type Tool, generateText, jsonSchema, tool } from 'ai'

/**
 * Dynamic tool selection. Before an agent's first step, the chat model reads the request and the tool list and picks the
 * tools that are relevant; only those go to the model (`activeTools`), so a big toolbox does not cost tokens on every
 * step or tempt the model into the wrong tool. Nothing here touches the main thread, so the worker can use it too.
 *
 * The chosen set only grows during a run, so the tool list the provider sees stays stable and its prompt cache holds.
 * A tool the selector missed is added by the model itself with `request_tools`.
 */

export const REQUEST_TOOLS = 'request_tools'

export interface ToolEntry {
  name: string
  description: string
}

type Usage = {
  inputTokens?: number
  outputTokens?: number
  outputTokenDetails?: { reasoningTokens?: number }
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }
}

/** The catalog of a tool map, with each description cut to its first sentence so the selector prompt stays small. */
export const catalogOf = (tools: Record<string, { description?: string }>): ToolEntry[] =>
  Object.entries(tools).map(([name, t]) => ({ name, description: (t.description ?? '').split(/(?<=[.!?])\s/)[0].slice(0, 160) }))

/** The text of the newest user message, which is what the selector reads to decide. */
export function lastUserText(messages: ModelMessage[]) {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return last.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
}

export interface ToolSelectorOptions {
  /** The model that makes the choice: the same one the agent chats with. */
  model: LanguageModel
  catalog: ToolEntry[]
  /** Tools that are always offered. */
  alwaysInclude?: string[]
  /** The most tools the selector may pick, on top of `alwaysInclude`. */
  max?: number
  /** With no more tools than this, selection is skipped and every tool is offered. */
  minTools?: number
  providerOptions?: Record<string, Record<string, unknown>>
  signal?: AbortSignal
  /** Tokens the selection call was billed for. */
  onUsage?: (usage: Usage) => void
}

export function createToolSelector({
  model,
  catalog,
  alwaysInclude = [],
  max = 12,
  minTools = 12,
  providerOptions,
  signal,
  onUsage,
}: ToolSelectorOptions) {
  const known = new Set(catalog.map((t) => t.name))
  const enabled = catalog.length > minTools
  const active = new Set(alwaysInclude.filter((n) => known.has(n)))
  let selected = false
  let failed = false

  /** Lets the model add tools the selector left out. It takes effect on the next step. */
  const requestTool: Tool = tool({
    description: `Turn on tools that are not available right now. Call this when you need one. Tools you can turn on: ${catalog
      .map((t) => t.name)
      .join(', ')}.`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: { names: { type: 'array', items: { type: 'string' }, description: 'Tool names to turn on' } },
      required: ['names'],
    } satisfies JSONSchema7),
    execute: async (args: unknown) => {
      const names = ((args as { names?: string[] }).names ?? []).filter((n) => known.has(n))
      for (const n of names) active.add(n)
      return names.length ? `Turned on ${names.join(', ')}. You can call them from your next step.` : 'No tool with those names.'
    },
  } as never)

  async function pick(request: string) {
    const rest = catalog.filter((t) => !alwaysInclude.includes(t.name))
    try {
      const { text, usage } = await generateText({
        model,
        abortSignal: signal,
        providerOptions: providerOptions as never,
        system: `You pick which tools an AI agent needs for a request. Reply with a JSON array of tool names only, no prose. Pick every tool the request could need and no others, at most ${max}. When unsure whether a tool is needed, include it.`,
        prompt: `Request:\n${request.slice(0, 4000)}\n\nTools:\n${rest.map((t) => `- ${t.name}: ${t.description}`).join('\n')}`,
      })
      onUsage?.(usage)
      const list = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as unknown
      return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string' && known.has(n)).slice(0, max) : []
    } catch (error) {
      if (signal?.aborted) throw error
      // A failed selection must never block the agent: it gets every tool.
      console.warn('[tool-selector] selection failed, offering all tools', error)
      return null
    }
  }

  return {
    enabled,
    /** Add this to the agent's tools when `enabled`. */
    requestTool,
    /**
     * The tools to offer on this step. The first call selects from `request`; later calls reuse the set, and
     * `extend` (a steering message arrived) adds what the new message needs.
     */
    async activeTools(request: string, extend = false): Promise<string[] | undefined> {
      if (!enabled || failed) return undefined
      if (!selected || extend) {
        const picked = await pick(request)
        selected = true
        if (!picked) failed = true
        else for (const n of picked) active.add(n)
      }
      return [...active, REQUEST_TOOLS]
    },
  }
}
