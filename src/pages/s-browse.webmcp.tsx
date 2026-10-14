import { useLayoutEffect } from 'react'

import { screenshotOf, screenshotsOn } from './s-browse.screenshot'

type ModelContext = { registerTool(tool: object, options?: { signal?: AbortSignal }): unknown; unregisterTool?(name: string): void }
type Action = (action: string, payload?: Record<string, unknown>) => void
const getContext = () =>
  (document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext
const result = (text: string, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) })

export function SBrowseWebMcp({ page, send, getIframe }: { page: string | null; send: Action; getIframe: () => HTMLIFrameElement | null }) {
  useLayoutEffect(() => {
    const context = getContext()
    if (!context) return
    const controller = new AbortController()
    const tools = [
      {
        name: 'view_window',
        description: 'Returns a screenshot of the page currently open in the SBrowse iframe, so you can see it before acting.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          const iframe = getIframe()
          if (!iframe) return result('No page is open in SBrowse.', true)
          if (!screenshotsOn())
            return result('Screenshots are off. Ask the user to press "Allow screenshots" in the SBrowse CUA tab, then try again.', true)
          try {
            const data = await screenshotOf(iframe)
            return data ? { content: [{ type: 'image', data, mimeType: 'image/png' }] } : result('Could not capture the page.', true)
          } catch (error) {
            return result(error instanceof Error ? error.message : 'Could not capture the page.', true)
          }
        },
      },
      {
        name: 'move_cursor',
        description: 'Moves the CUA pointer to screen coordinates in the embedded page.',
        inputSchema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'Horizontal pixel coordinate.' },
            y: { type: 'number', description: 'Vertical pixel coordinate.' },
          },
          required: ['x', 'y'],
        },
        execute: async (args: unknown) => {
          const a = args as { x?: number; y?: number }
          if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return result('x and y are required.', true)
          send('mousemove', { x: a.x, y: a.y })
          return result(`Cursor moved to ${a.x}, ${a.y}.`)
        },
      },
      {
        name: 'click_iframe',
        description: 'Clicks a coordinate in the embedded page after the agent has inspected it.',
        inputSchema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'Horizontal pixel coordinate.' },
            y: { type: 'number', description: 'Vertical pixel coordinate.' },
          },
          required: ['x', 'y'],
        },
        execute: async (args: unknown) => {
          const a = args as { x?: number; y?: number }
          if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return result('x and y are required.', true)
          send('click', { x: a.x, y: a.y })
          return result(`Clicked ${a.x}, ${a.y}.`)
        },
      },
      {
        name: 'type_iframe',
        description: 'Types text into the focused element in the embedded page.',
        inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Text to type.' } }, required: ['text'] },
        execute: async (args: unknown) => {
          const text = (args as { text?: string }).text
          if (typeof text !== 'string') return result('text is required.', true)
          send('type', { text })
          return result('Text sent to the embedded page.')
        },
      },
      {
        name: 'press_key',
        description: 'Sends one keyboard key to the focused element in the embedded page.',
        inputSchema: {
          type: 'object',
          properties: { key: { type: 'string', description: 'Key name such as Enter or Escape.' } },
          required: ['key'],
        },
        execute: async (args: unknown) => {
          const key = (args as { key?: string }).key
          if (!key) return result('key is required.', true)
          send('keypress', { key })
          return result(`Pressed ${key}.`)
        },
      },
    ]
    for (const tool of tools) context.registerTool(tool, { signal: controller.signal })
    return () => {
      controller.abort()
      tools.forEach((tool) => context.unregisterTool?.(tool.name))
    }
  }, [send, page, getIframe])
  return null
}
