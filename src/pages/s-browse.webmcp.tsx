import { useLayoutEffect } from 'react'
import { z } from 'zod'

import { COMPUTER_DESCRIPTION, type ComputerHost, type ComputerInput, computerInput, runComputer } from './s-browse.computer'

type ModelContext = { registerTool(tool: object, options?: { signal?: AbortSignal }): unknown; unregisterTool?(name: string): void }
const getContext = () =>
  (document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext

/** The same computer tool, for agents outside this app that read `document.modelContext`. */
export function SBrowseWebMcp({ page, host }: { page: string | null; host: ComputerHost }) {
  useLayoutEffect(() => {
    const context = getContext()
    if (!context) return
    const controller = new AbortController()
    const respond = async (input: ComputerInput) => {
      const { note, shot } = await runComputer(host, input)
      return {
        content: [
          ...(note ? [{ type: 'text', text: note }] : []),
          ...(shot ? [{ type: 'image', data: shot.data, mimeType: 'image/png' }] : []),
        ],
        ...(note && !shot ? { isError: true } : {}),
      }
    }
    const tools = [
      {
        name: 'view_window',
        description: 'Returns a screenshot of the page currently open in the SBrowse iframe, so you can see it before acting.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => respond({ action: 'screenshot' }),
      },
      {
        name: 'computer',
        description: COMPUTER_DESCRIPTION,
        inputSchema: z.toJSONSchema(computerInput),
        execute: (args: unknown) => {
          const parsed = computerInput.safeParse(args)
          return parsed.success
            ? respond(parsed.data)
            : Promise.resolve({ content: [{ type: 'text', text: parsed.error.message }], isError: true })
        },
      },
    ]
    for (const tool of tools) context.registerTool(tool, { signal: controller.signal })
    return () => {
      controller.abort()
      tools.forEach((tool) => context.unregisterTool?.(tool.name))
    }
  }, [host, page])
  return null
}
