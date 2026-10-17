// @vitest-environment jsdom
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setTheme = vi.hoisted(() => vi.fn())
vi.mock('next-themes', () => ({ useTheme: () => ({ setTheme }) }))

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY' },
  restoreElements: (elements: unknown[]) => elements,
  getSceneVersion: () => 0,
  getCommonBounds: () => [0, 0, 0, 0],
  newElementWith: vi.fn(),
  convertToExcalidrawElements: vi.fn(),
  serializeAsJSON: vi.fn(),
  exportToSvg: vi.fn(),
  exportToBlob: vi.fn(),
}))
vi.mock('../s-draw.db', () => ({ readDrawWorkspace: vi.fn(), writeDrawWorkspace: vi.fn().mockResolvedValue(undefined) }))

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

import { setDrawApi } from '../bridge'
import { useDrawStore } from '../s-draw.store'
import { DrawTools } from './draw-tools'
import manifestText from './schema.json?raw'
import { toolDefinitions } from './schemas'

type Result = { content: { type: string; text: string }[]; isError?: boolean }
type Tool = {
  name: string
  description: string
  annotations?: Record<string, boolean>
  execute(args: unknown, options: { signal: AbortSignal }): Promise<Result>
}
let registered: Map<string, Tool>
let signals: AbortSignal[]
let registerTool: ReturnType<typeof vi.fn>

const call = (name: string, args: unknown, signal = new AbortController().signal) => registered.get(name)!.execute(args, { signal })

beforeEach(() => {
  setTheme.mockClear()
  registered = new Map()
  signals = []
  registerTool = vi.fn((tool: Tool, options: { signal: AbortSignal }) => {
    registered.set(tool.name, tool)
    signals.push(options.signal)
    options.signal.addEventListener('abort', () => registered.delete(tool.name))
  })
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } })
  useDrawStore.setState({
    ready: true,
    error: null,
    activeId: 'a',
    sheets: [{ id: 'a', name: 'Drawing', createdAt: 1, updatedAt: 1, scene: { elements: [], appState: {}, files: {} } }],
    saveScene: vi.fn(),
    flushPersistence: vi.fn().mockResolvedValue(undefined),
  })
  setDrawApi({
    getSceneElements: () => [],
    getSceneElementsIncludingDeleted: () => [],
    getAppState: () => ({ selectedElementIds: {} }) as AppState,
    getFiles: () => ({}),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawImperativeAPI)
})

afterEach(() => {
  cleanup()
  setDrawApi(null)
  delete (document as { modelContext?: unknown }).modelContext
})

describe('S Draw browser tool registration', () => {
  it('registers the complete scoped toolset and unregisters every tool on unmount', () => {
    const view = render(<DrawTools />)
    expect([...registered.keys()].sort()).toEqual(toolDefinitions.map((tool) => tool.name).sort())
    expect(signals.every((signal) => !signal.aborted)).toBe(true)
    for (const tool of registered.values()) {
      expect(tool.name.length).toBeLessThanOrEqual(30)
      expect(tool.description.length).toBeLessThanOrEqual(500)
    }
    view.unmount()
    expect(registered.size).toBe(0)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('applies a requested drawing theme to the shared Settings preference', async () => {
    render(<DrawTools />)
    expect((await call('sdraw_set_view', { theme: 'dark' })).isError).not.toBe(true)
    expect(setTheme).toHaveBeenCalledWith('dark')
    setTheme.mockClear()
    await call('sdraw_set_view', { theme: 'invalid' })
    expect(setTheme).not.toHaveBeenCalled()
  })

  it('keeps the published manifest identical to registrations and within all description budgets', () => {
    expect(JSON.parse(manifestText).tools).toEqual(toolDefinitions)
    const inspectSchema = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(inspectSchema)
        return
      }
      const schema = value as { description?: string; properties?: Record<string, unknown> }
      if (schema.description) expect(schema.description.length).toBeLessThanOrEqual(150)
      for (const name of Object.keys(schema.properties ?? {})) expect(name.length).toBeLessThanOrEqual(30)
      Object.values(schema).forEach(inspectSchema)
    }
    for (const tool of toolDefinitions) {
      expect(tool.name.length).toBeLessThanOrEqual(30)
      expect(tool.description.length).toBeLessThanOrEqual(500)
      inspectSchema(tool.inputSchema)
    }
  })

  it('waits for workspace hydration and responds to readiness transitions', () => {
    useDrawStore.setState({ ready: false })
    render(<DrawTools />)
    expect(registerTool).not.toHaveBeenCalled()
    act(() => useDrawStore.setState({ ready: true }))
    expect(registered.size).toBe(toolDefinitions.length)
    act(() => useDrawStore.setState({ ready: false }))
    expect(registered.size).toBe(0)
  })

  it('executes a captured browser callback against the active drawing', async () => {
    render(<DrawTools />)
    const result = await call('sdraw_get_document', {})
    expect(result.isError).not.toBe(true)
    expect(JSON.parse(result.content[0].text)).toMatchObject({ sheetId: 'a', name: 'Drawing', elementCount: 0 })
  })

  it('exposes arrow endpoints and heads through the registered browser callback', async () => {
    const edge = {
      id: 'edge',
      type: 'arrow',
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      angle: 0,
      version: 1,
      groupIds: [],
      points: [
        [0, 0],
        [100, 0],
      ],
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: 'arrow',
    } as unknown as ExcalidrawElement
    setDrawApi({
      getSceneElements: () => [edge],
      getAppState: () => ({ selectedElementIds: {} }),
    } as unknown as ExcalidrawImperativeAPI)
    render(<DrawTools />)
    const result = await call('sdraw_read_elements', {})
    expect(result.isError).not.toBe(true)
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      items: [
        {
          id: 'edge',
          start: { elementId: null, point: [0, 0], arrowhead: null },
          end: { elementId: null, point: [100, 0], arrowhead: 'arrow' },
        },
      ],
    })
  })

  it('normalizes schema failures into explicit browser tool errors', async () => {
    render(<DrawTools />)
    const result = await call('sdraw_update_elements', { sheetId: 'a', expectedRevision: 0, updates: [] })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/updates|small|at least/i)
  })

  it('reports overflowing labels through the registered layout-check callback', async () => {
    const elements = [
      { id: 'box', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, angle: 0 },
      { id: 'label', type: 'text', text: 'Too wide', x: 80, y: 10, width: 80, height: 20, angle: 0, containerId: 'box' },
    ] as unknown as ExcalidrawElement[]
    setDrawApi({
      getSceneElements: () => elements,
      getAppState: () => ({ selectedElementIds: {} }),
    } as unknown as ExcalidrawImperativeAPI)
    render(<DrawTools />)
    const result = await call('sdraw_check_layout', {})
    expect(result.isError).not.toBe(true)
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      items: [{ kind: 'label_outside_box', ids: ['label', 'box'] }],
      complete: true,
    })
    expect(registered.get('sdraw_check_layout')?.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true })
  })

  it('returns an actionable error while the canvas is changing sheets', async () => {
    render(<DrawTools />)
    setDrawApi(null)
    const result = await call('sdraw_get_document', {})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/loading|canvas/i)
  })

  it('passes cancellation through the registered execute boundary', async () => {
    render(<DrawTools />)
    const controller = new AbortController()
    controller.abort()
    const result = await call('sdraw_get_document', {}, controller.signal)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/abort/i)
  })

  it('labels user-authored reads as untrusted and UI changes as mutations', () => {
    render(<DrawTools />)
    expect(registered.get('sdraw_read_elements')?.annotations).toMatchObject({ readOnlyHint: true, untrustedContentHint: true })
    for (const name of ['sdraw_select_elements', 'sdraw_set_view', 'sdraw_manage_sheets'])
      expect(registered.get(name)?.annotations?.readOnlyHint).not.toBe(true)
  })
})
