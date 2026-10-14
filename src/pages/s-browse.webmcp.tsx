import { useLayoutEffect } from 'react'

type ModelContext = { registerTool(tool: object, options?: { signal?: AbortSignal }): unknown; unregisterTool?(name: string): void }
type Action = (action: string, payload?: Record<string, unknown>) => void
const getContext = () => ((document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext)
const result = (text: string, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) })

export function SBrowseWebMcp({ page, send }: { page: string | null; send: Action }) {
  useLayoutEffect(() => {
    const context = getContext()
    if (!context) return
    const controller = new AbortController()
    const tools = [
      { name: 'view_window', description: 'Requests a visual snapshot of the currently embedded page so an agent can inspect its window before acting.', inputSchema: { type: 'object', properties: {} }, execute: async () => { send('screenshot'); return result('Screenshot requested from the embedded page.') } },
      { name: 'move_cursor', description: 'Moves the CUA pointer to screen coordinates in the embedded page.', inputSchema: { type: 'object', properties: { x: { type: 'number', description: 'Horizontal pixel coordinate.' }, y: { type: 'number', description: 'Vertical pixel coordinate.' } }, required: ['x', 'y'] }, execute: async (args: unknown) => { const a = args as { x?: number; y?: number }; if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return result('x and y are required.', true); send('mousemove', { x: a.x, y: a.y }); return result(`Cursor moved to ${a.x}, ${a.y}.`) } },
      { name: 'click_iframe', description: 'Clicks a coordinate in the embedded page after the agent has inspected it.', inputSchema: { type: 'object', properties: { x: { type: 'number', description: 'Horizontal pixel coordinate.' }, y: { type: 'number', description: 'Vertical pixel coordinate.' } }, required: ['x', 'y'] }, execute: async (args: unknown) => { const a = args as { x?: number; y?: number }; if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return result('x and y are required.', true); send('click', { x: a.x, y: a.y }); return result(`Clicked ${a.x}, ${a.y}.`) } },
      { name: 'type_iframe', description: 'Types text into the focused element in the embedded page.', inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Text to type.' } }, required: ['text'] }, execute: async (args: unknown) => { const text = (args as { text?: string }).text; if (typeof text !== 'string') return result('text is required.', true); send('type', { text }); return result('Text sent to the embedded page.') } },
      { name: 'press_key', description: 'Sends one keyboard key to the focused element in the embedded page.', inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'Key name such as Enter or Escape.' } }, required: ['key'] }, execute: async (args: unknown) => { const key = (args as { key?: string }).key; if (!key) return result('key is required.', true); send('keypress', { key }); return result(`Pressed ${key}.`) } },
    ]
    for (const tool of tools) context.registerTool(tool, { signal: controller.signal })
    return () => { controller.abort(); tools.forEach((tool) => context.unregisterTool?.(tool.name)) }
  }, [send, page])
  return null
}
