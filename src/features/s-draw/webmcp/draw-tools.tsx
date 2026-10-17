import { useTheme } from 'next-themes'
import { useWebMCP } from 'use-webmcp-tool'

import { useDrawStore } from '../s-draw.store'
import { schemas, toolDefinitions } from './schemas'
import { executeDrawTool } from './tools'

function DrawTool({ tool }: { tool: (typeof toolDefinitions)[number] }) {
  const { setTheme } = useTheme()
  const ready = useDrawStore((state) => state.ready)
  useWebMCP({
    ...tool,
    enabled: ready,
    execute: async (args: unknown, { signal }) => {
      const result = await executeDrawTool(tool.name as keyof typeof schemas, args, signal)
      if (tool.name === 'sdraw_set_view') {
        const { theme } = schemas.sdraw_set_view.parse(args ?? {})
        if (theme) setTheme(theme)
      }
      return result
    },
  })
  return null
}

export function DrawTools() {
  return (
    <>
      {toolDefinitions.map((tool) => (
        <DrawTool key={tool.name} tool={tool} />
      ))}
    </>
  )
}
