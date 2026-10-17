import type { WebMCP } from 'webmcp-types'

interface TestingTool {
  name: string
  description?: string
  inputSchema?: unknown
}

interface BrowserTestingConsumer {
  listTools(): unknown
  executeTool(name: string, input: string): unknown
}

const testingConsumer = () => (navigator as unknown as { modelContextTesting?: BrowserTestingConsumer }).modelContextTesting
const nativeConsumer = (): WebMCP.ModelContext | undefined => {
  const context = document.modelContext
  return typeof context?.getTools === 'function' && typeof context?.executeTool === 'function' ? context : undefined
}

export const DRAW_WEBMCP_HELP =
  'Drawing actions require browser WebMCP. Enable chrome://flags/#enable-webmcp-testing in a supported Chrome browser and restart it.'

export const hasDrawWebMCP = () => !!(nativeConsumer() || testingConsumer()?.executeTool)

function imageResult(name: string, result: unknown): unknown {
  if (name !== 'sdraw_capture_view') return result
  let parsed = result
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return parsed
    }
  }
  const response = parsed as { isError?: boolean; content?: { type: string; data?: string; mimeType?: string; text?: string }[] } | null
  const image = response?.content?.find((block) => block.type === 'image' && block.data && block.mimeType?.startsWith('image/'))
  if (!response?.isError && image) return { image: image.data, mediaType: image.mimeType }
  return (
    response?.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n') || 'Drawing preview was not available. Read the region with drawing tools instead.'
  )
}

export async function loadDrawTools(signal?: AbortSignal) {
  const native = nativeConsumer()
  if (native) {
    const tools = (await native.getTools()).filter((tool) => tool.name.startsWith('sdraw_'))
    if (!tools.length) throw new Error('SDraw tools are still loading. Wait for the canvas, then try again.')
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      schema: tool.inputSchema ?? {},
      call: async (input: unknown) => imageResult(tool.name, await native.executeTool(tool, (input ?? {}) as object, { signal })),
    }))
  }
  const testing = testingConsumer()
  if (!testing?.executeTool) throw new Error(DRAW_WEBMCP_HELP)
  const raw = await testing.listTools()
  const listed = (Array.isArray(raw) ? raw : (raw as { tools?: TestingTool[] } | undefined)?.tools) ?? []
  const tools = (listed as TestingTool[]).filter((tool) => tool.name.startsWith('sdraw_'))
  if (!tools.length) throw new Error('SDraw tools are still loading. Wait for the canvas, then try again.')
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    schema: typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : (tool.inputSchema ?? {}),
    call: async (input: unknown) => imageResult(tool.name, await testing.executeTool(tool.name, JSON.stringify(input ?? {}))),
  }))
}
