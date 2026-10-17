// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DRAW_WEBMCP_HELP, hasDrawWebMCP, loadDrawTools } from './webmcp'

afterEach(() => {
  delete (navigator as unknown as { modelContextTesting?: unknown }).modelContextTesting
  delete (document as unknown as { modelContext?: unknown }).modelContext
})

describe('SDraw WebMCP consumer', () => {
  it.each([false, true])('unwraps capture images for worker vision, JSON encoded: %s', async (encoded) => {
    const result = {
      content: [
        { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
        { type: 'text', text: 'Selected region' },
      ],
    }
    Object.defineProperty(navigator, 'modelContextTesting', {
      configurable: true,
      value: {
        listTools: () => [{ name: 'sdraw_capture_view', inputSchema: {} }],
        executeTool: async () => (encoded ? JSON.stringify(result) : result),
      },
    })
    const [tool] = await loadDrawTools()
    expect(await tool.call({ scope: 'selection' })).toEqual({ image: 'aW1hZ2U=', mediaType: 'image/png' })
  })

  it('unwraps native capture images and preserves capture failure text', async () => {
    const executeTool = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ content: [{ type: 'image', data: 'cG5n', mimeType: 'image/png' }] }))
      .mockResolvedValueOnce(JSON.stringify({ isError: true, content: [{ type: 'text', text: 'Select some elements first.' }] }))
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: { getTools: async () => [{ name: 'sdraw_capture_view' }], executeTool },
    })
    const [tool] = await loadDrawTools()
    expect(await tool.call({})).toEqual({ image: 'cG5n', mediaType: 'image/png' })
    expect(await tool.call({})).toBe('Select some elements first.')
  })

  it('uses native registered tool handles and object arguments when supported', async () => {
    const tool = { name: 'sdraw_get_document', description: 'Read', inputSchema: { type: 'object' } }
    const executeTool = vi.fn().mockResolvedValue('done')
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { getTools: async () => [tool], executeTool } })
    expect(hasDrawWebMCP()).toBe(true)
    const signal = new AbortController().signal
    const tools = await loadDrawTools(signal)
    await tools[0].call({ scope: 'selection' })
    expect(executeTool).toHaveBeenCalledWith(tool, { scope: 'selection' }, { signal })
  })
  it('requires the browser execution API without invoking application handlers', async () => {
    expect(hasDrawWebMCP()).toBe(false)
    await expect(loadDrawTools()).rejects.toThrow(DRAW_WEBMCP_HELP)
  })

  it('offers only registered drawing tools and executes through the browser', async () => {
    const executeTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'done' }] })
    Object.defineProperty(navigator, 'modelContextTesting', {
      configurable: true,
      value: {
        listTools: vi.fn().mockResolvedValue([
          { name: 'delete_note', inputSchema: {} },
          { name: 'sdraw_update_elements', description: 'Edit drawing', inputSchema: '{"type":"object"}' },
        ]),
        executeTool,
      },
    })
    const tools = await loadDrawTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].schema).toEqual({ type: 'object' })
    await tools[0].call({ ids: ['selected'] })
    expect(executeTool).toHaveBeenCalledWith('sdraw_update_elements', '{"ids":["selected"]}')
  })

  it('reports tools not yet registered instead of using a direct fallback', async () => {
    Object.defineProperty(navigator, 'modelContextTesting', { configurable: true, value: { listTools: () => [], executeTool: vi.fn() } })
    await expect(loadDrawTools()).rejects.toThrow('SDraw tools are still loading')
  })
})
