import { type Tool, asSchema } from 'ai'

import { FIRECRAWL_INSTRUCTIONS, createFirecrawlMcpTools } from '@/ai/mcp/firecrawl'
import { SANDBOX_INSTRUCTIONS, type SandboxToolOptions, createSandboxTools } from '@/ai/sandbox/tools'
import { createScrapeTool } from '@/ai/tools/scrape'
import { createSearchTool } from '@/ai/tools/search'
import type { ToolSpec } from '@/ai/worker/protocol'

/** Added to the instructions of an agent that has the general tools. */
export const GENERAL_INSTRUCTIONS = `${SANDBOX_INSTRUCTIONS}\n\nWeb: webSearch finds current or factual information; scrape reads the text of one page or PDF from its link.\n\n${FIRECRAWL_INSTRUCTIONS}`

/**
 * The tools every agent can use whatever app it lives in: web search and scraping, and the sandbox with its terminal and
 * Python. App-specific tools (the canvas, notes) come on top of these.
 */
export const createGeneralTools = (options: SandboxToolOptions = {}): Record<string, Tool> => ({
  ...createFirecrawlMcpTools(),
  webSearch: createSearchTool(),
  scrape: createScrapeTool(options.session),
  ...createSandboxTools(options),
})

/** Tools that run on the main thread for an agent whose model runs in the worker: their specs, and a way to call them. */
export async function localTools(tools: Record<string, Tool>) {
  const specs: Record<string, ToolSpec> = {}
  for (const [name, t] of Object.entries(tools))
    specs[name] = {
      ...(name === 'view_image' && { imageOutput: true }),
      description: typeof t.description === 'string' ? t.description : '',
      schema: await asSchema(t.inputSchema).jsonSchema,
    }
  return {
    specs,
    has: (name: string) => name in tools,
    call: (name: string, args: unknown, abortSignal?: AbortSignal) =>
      tools[name].execute!(args as never, { abortSignal, toolCallId: crypto.randomUUID(), messages: [] } as never),
  }
}
