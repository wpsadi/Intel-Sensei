import { exportToBlob } from '@excalidraw/excalidraw'
// @vitest-environment jsdom
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY' },
  restoreElements: (elements: ExcalidrawElement[]) =>
    elements.map((element) => (element.type === 'text' ? { ...element, width: element.text.length * 10, height: 25 } : element)),
  getSceneVersion: (elements: ExcalidrawElement[]) => elements.reduce((sum, element) => sum + element.version, 0),
  getCommonBounds: (elements: ExcalidrawElement[]) => [
    Math.min(...elements.map((e) => e.x)),
    Math.min(...elements.map((e) => e.y)),
    Math.max(...elements.map((e) => e.x + e.width)),
    Math.max(...elements.map((e) => e.y + e.height)),
  ],
  newElementWith: (element: ExcalidrawElement, patch: Partial<ExcalidrawElement>) => ({
    ...element,
    ...patch,
    version: element.version + 1,
  }),
  convertToExcalidrawElements: (skeletons: Record<string, unknown>[]) =>
    skeletons.map((skeleton) => ({
      id: crypto.randomUUID(),
      version: 1,
      groupIds: [],
      angle: 0,
      isDeleted: false,
      ...skeleton,
      ...(skeleton.type === 'text'
        ? { text: skeleton.text, originalText: skeleton.text, width: String(skeleton.text).length * 10, height: 25 }
        : {}),
    })),
  serializeAsJSON: (elements: ExcalidrawElement[], appState: Partial<AppState>, files: BinaryFiles) =>
    JSON.stringify({ elements, appState, files }),
  exportToSvg: vi.fn(),
  exportToBlob: vi.fn(),
}))
vi.mock('../s-draw.db', () => ({ readDrawWorkspace: vi.fn(), writeDrawWorkspace: vi.fn().mockResolvedValue(undefined) }))

import { setDrawApi } from '../bridge'
import { useDrawStore } from '../s-draw.store'
import type { IDrawSheet } from '../s-draw.types'
import { executeDrawTool } from './tools'

const shape = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    angle: 0,
    version: 1,
    versionNonce: 1,
    groupIds: [],
    frameId: null,
    boundElements: null,
    isDeleted: false,
    opacity: 100,
    backgroundColor: 'transparent',
    ...extra,
  }) as unknown as ExcalidrawElement
const sheet = (id: string, elements: ExcalidrawElement[] = []): IDrawSheet => ({
  id,
  name: id,
  createdAt: 1,
  updatedAt: 1,
  scene: { elements, appState: {}, files: {} },
})
let elements: readonly ExcalidrawElement[]
let appState: AppState
let files: BinaryFiles
let updateScene: ReturnType<typeof vi.fn>
let addFiles: ReturnType<typeof vi.fn>
let fixtureApi: ExcalidrawImperativeAPI
const call = executeDrawTool
const read = async () => (await call('sdraw_get_document', {})) as { revision: number; sheetId: string }

beforeEach(() => {
  elements = [shape('existing')]
  appState = { selectedElementIds: {}, theme: 'light' } as AppState
  files = {}
  updateScene = vi.fn((update) => {
    if (update.elements) elements = update.elements
    if (update.appState) appState = { ...appState, ...update.appState }
  })
  addFiles = vi.fn((added) => {
    files = { ...files, ...Object.fromEntries(added.map((file: { id: string }) => [file.id, file])) }
  })
  useDrawStore.setState({
    ready: true,
    error: null,
    activeId: 'a',
    sheets: [sheet('a'), sheet('b')],
    libraryItems: [],
    flushPersistence: vi.fn().mockResolvedValue(undefined),
  })
  fixtureApi = {
    getSceneElements: () => elements.filter((element) => !element.isDeleted),
    getSceneElementsIncludingDeleted: () => elements,
    getAppState: () => appState,
    getFiles: () => files,
    updateScene,
    addFiles,
    scrollToContent: vi.fn(),
  } as unknown as ExcalidrawImperativeAPI
  setDrawApi(fixtureApi)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

describe('drawing inspection and bounded traversal', () => {
  it('captures chosen elements and owned labels as a themed PNG without changing the human selection', async () => {
    elements = [shape('chosen'), shape('label', { type: 'text', text: 'Hello', containerId: 'chosen' }), shape('unrelated', { x: 1000 })]
    appState.selectedElementIds = { unrelated: true }
    appState.theme = 'dark'
    vi.mocked(exportToBlob).mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }))
    const result = await call('sdraw_capture_view', { scope: 'elements', ids: ['chosen'], maxSize: 2000 })
    expect(exportToBlob).toHaveBeenLastCalledWith(
      expect.objectContaining({
        elements: [elements[0], elements[1]],
        appState: expect.objectContaining({ theme: 'dark', exportWithDarkMode: true, exportBackground: true }),
        mimeType: 'image/png',
        maxWidthOrHeight: 2000,
      }),
    )
    expect(result).toMatchObject({ content: [{ type: 'image', data: 'cG5n', mimeType: 'image/png' }, { type: 'text' }] })
    expect(appState.selectedElementIds).toEqual({ unrelated: true })
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('keeps whole-sheet and selected capture modes and defaults to a readable image size', async () => {
    elements = [shape('chosen'), shape('other')]
    appState.selectedElementIds = { chosen: true }
    vi.mocked(exportToBlob).mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    await call('sdraw_capture_view', {})
    expect(exportToBlob).toHaveBeenLastCalledWith(
      expect.objectContaining({
        elements,
        maxWidthOrHeight: 1600,
        appState: expect.objectContaining({ exportWithDarkMode: false }),
      }),
    )
    await call('sdraw_capture_view', { scope: 'selection' })
    expect(exportToBlob).toHaveBeenLastCalledWith(expect.objectContaining({ elements: [elements[0]] }))
  })

  it('rejects ambiguous or missing capture targets instead of silently capturing unrelated content', async () => {
    await expect(call('sdraw_capture_view', { scope: 'elements' })).rejects.toThrow('Provide element IDs')
    await expect(call('sdraw_capture_view', { scope: 'all', ids: ['existing'] })).rejects.toThrow('Choose elements scope')
    await expect(call('sdraw_capture_view', { scope: 'elements', ids: ['missing'] })).rejects.toThrow('Element not found')
    await expect(call('sdraw_capture_view', { scope: 'selection' })).rejects.toThrow('No drawing elements')
  })

  it('paginates layout findings, filters selected issues and preserves the scene', async () => {
    elements = [
      shape('box'),
      shape('bad-label', { type: 'text', text: 'Overflow', x: 80, y: 10, width: 90, height: 20, containerId: 'box' }),
      shape('one', {
        type: 'arrow',
        x: 0,
        y: 200,
        points: [
          [0, 0],
          [100, 0],
        ],
        startBinding: null,
        endBinding: null,
      }),
      shape('two', {
        type: 'arrow',
        x: 0,
        y: 200,
        points: [
          [20, 0],
          [120, 0],
        ],
        startBinding: null,
        endBinding: null,
      }),
    ]
    const first = await call('sdraw_check_layout', { limit: 1 })
    expect(first).toMatchObject({ items: [{ kind: 'label_outside_box', ids: ['bad-label', 'box'] }], nextOffset: 1, complete: true })
    const second = await call('sdraw_check_layout', { offset: 1 })
    expect(second).toMatchObject({ items: [{ kind: 'arrows_overlap', ids: ['one', 'two'] }], nextOffset: null })
    expect(JSON.stringify(second).length).toBeLessThanOrEqual(1500)
    appState.selectedElementIds = { box: true }
    expect(await call('sdraw_check_layout', { scope: 'selection' })).toMatchObject({
      items: [{ kind: 'label_outside_box' }],
      totalCount: 1,
    })
    expect(await call('sdraw_check_layout', { scope: 'region', region: { x: -5, y: 180, width: 150, height: 50 } })).toMatchObject({
      items: [{ kind: 'arrows_overlap' }],
      totalCount: 1,
    })
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('finds boxes by their bound labels and reads arrow relationships without changing the drawing', async () => {
    elements = [
      shape('a'),
      shape('b', { x: 300 }),
      shape('label', { type: 'text', text: 'Service', containerId: 'a' }),
      shape('edge', {
        type: 'arrow',
        points: [
          [0, 0],
          [200, 50],
        ],
        startBinding: { elementId: 'a' },
        endBinding: { elementId: 'b' },
        startArrowhead: 'arrow',
        endArrowhead: null,
      }),
    ]
    const matches = await call('sdraw_read_elements', { query: 'Service' })
    expect(matches).toMatchObject({
      items: [
        { id: 'a', label: 'Service' },
        { id: 'label', containerId: 'a' },
      ],
    })
    const edge = await call('sdraw_read_elements', { query: 'edge' })
    expect(edge).toMatchObject({
      items: [{ id: 'edge', start: { elementId: 'a', arrowhead: 'arrow' }, end: { elementId: 'b', arrowhead: null } }],
    })
    expect(JSON.stringify(edge).length).toBeLessThanOrEqual(1500)
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('reports live content and selected scope rather than the stale persisted sheet', async () => {
    appState.selectedElementIds = { existing: true }
    expect(await call('sdraw_get_document', {})).toMatchObject({
      elementCount: 1,
      selectedCount: 1,
      selection: ['existing'],
      focus: 'selection',
    })
  })

  it('filters by native selection, text and geometric region without changing the scene', async () => {
    elements = [
      shape('a', { type: 'text', text: 'Review', x: 0 }),
      shape('b', { type: 'text', text: 'Review', x: 500 }),
      shape('c', { x: 20 }),
    ]
    appState.selectedElementIds = { a: true }
    const selection = (await call('sdraw_read_elements', { scope: 'selection', query: 'review' })) as { items: { id: string }[] }
    expect(selection.items.map((item) => item.id)).toEqual(['a'])
    const region = (await call('sdraw_read_elements', { scope: 'region', region: { x: 490, y: 0, width: 150, height: 60 } })) as {
      items: { id: string }[]
    }
    expect(region.items.map((item) => item.id)).toEqual(['b'])
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('traverses every element once when escaped text forces smaller pages', async () => {
    elements = Array.from({ length: 25 }, (_, index) => shape(`text-${index}`, { type: 'text', text: '\u0000"\\'.repeat(300) }))
    const seen: string[] = []
    let offset: number | null = 0
    while (offset !== null) {
      const page = (await call('sdraw_read_elements', { offset, limit: 10 })) as {
        items: { id: string }[]
        nextOffset: number | null
        totalCount: number
      }
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(1500)
      expect(page.items.length).toBeGreaterThan(0)
      expect(page.totalCount).toBe(25)
      seen.push(...page.items.map((item) => item.id))
      if (page.nextOffset !== null) expect(page.nextOffset).toBeGreaterThan(offset)
      offset = page.nextOffset
    }
    expect(seen).toEqual(elements.map((element) => element.id))
  })

  it('reconstructs a long JSON field losslessly despite escaping', async () => {
    const text = '\u0000"\\\n'.repeat(900)
    elements = [shape('text', { type: 'text', text })]
    let offset: number | null = 0
    let reconstructed = ''
    while (offset !== null) {
      const page = (await call('sdraw_read_element_field', { id: 'text', field: 'text', offset })) as {
        chunk: string
        nextOffset: number | null
      }
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(1500)
      expect(page.chunk.length).toBeGreaterThan(0)
      reconstructed += page.chunk
      if (page.nextOffset !== null) expect(page.nextOffset).toBeGreaterThan(offset)
      offset = page.nextOffset
    }
    expect(JSON.parse(reconstructed)).toBe(text)
  })

  it('paginates long sheet names without losing sheets', async () => {
    useDrawStore.setState({ sheets: Array.from({ length: 23 }, (_, i) => ({ ...sheet(`sheet-${i}`), name: '\u0000'.repeat(160) })) })
    let offset: number | null = 0
    const seen: string[] = []
    while (offset !== null) {
      const result = (await call('sdraw_list_sheets', { offset, limit: 10 })) as { items: { id: string }[]; nextOffset: number | null }
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
      seen.push(...result.items.map((item) => item.id))
      offset = result.nextOffset
    }
    expect(seen).toEqual(useDrawStore.getState().sheets.map((item) => item.id))
  })
})

describe('safe native scene mutations', () => {
  it.each(['sdraw_update_elements', 'sdraw_delete_elements'] as const)(
    'blocks a stale revision before %s mutates anything',
    async (tool) => {
      const inspected = await read()
      elements = elements.map((element) => ({ ...element, x: 50, version: 2 }))
      const input = tool === 'sdraw_update_elements' ? { updates: [{ id: 'existing', patch: { x: 90 } }] } : { ids: ['existing'] }
      await expect(call(tool, { ...inspected, expectedRevision: inspected.revision, ...input })).rejects.toThrow(/changed|revision/i)
      expect(updateScene).not.toHaveBeenCalled()
      expect(elements[0].x).toBe(50)
    },
  )

  it('blocks a different target sheet even when the numeric revision matches', async () => {
    await expect(
      call('sdraw_update_elements', { sheetId: 'b', expectedRevision: 1, updates: [{ id: 'existing', patch: { x: 3 } }] }),
    ).rejects.toThrow(/sheet/i)
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('preserves existing elements and history when adding new editable shapes', async () => {
    const existing = elements[0]
    await call('sdraw_create_elements', {
      sheetId: 'a',
      expectedRevision: 1,
      elements: [{ id: 'new', type: 'ellipse', x: 200, y: 30, width: 80, height: 40 }],
    })
    expect(elements[0]).toBe(existing)
    expect(elements[1]).toMatchObject({ id: 'new', type: 'ellipse', x: 200 })
    expect(updateScene).toHaveBeenCalledWith(expect.objectContaining({ captureUpdate: 'IMMEDIATELY' }))
    expect(useDrawStore.getState().sheets[0].scene.elements).toHaveLength(2)
  })

  it('validates the entire batch before changing any elements', async () => {
    await expect(
      call('sdraw_update_elements', {
        sheetId: 'a',
        expectedRevision: 1,
        updates: [
          { id: 'existing', patch: { x: 22 } },
          { id: 'missing', patch: { x: 40 } },
        ],
      }),
    ).rejects.toThrow(/not found/i)
    expect(elements[0].x).toBe(0)
    expect(updateScene).not.toHaveBeenCalled()
  })

  it('recalculates text through the native converter and retains identity and version progression', async () => {
    elements = [shape('label', { type: 'text', text: 'Old', originalText: 'Old', containerId: null, width: 30, height: 25 })]
    await call('sdraw_update_elements', { sheetId: 'a', expectedRevision: 1, updates: [{ id: 'label', patch: { text: 'Longer label' } }] })
    expect(elements[0]).toMatchObject({ id: 'label', text: 'Longer label', originalText: 'Longer label', width: 120, version: 2 })
  })

  it('deletes bound labels and repairs surviving arrows and frame references', async () => {
    elements = [
      shape('box', {
        boundElements: [
          { id: 'label', type: 'text' },
          { id: 'arrow', type: 'arrow' },
        ],
      }),
      shape('label', { type: 'text', text: 'Box', containerId: 'box' }),
      shape('arrow', { type: 'arrow', startBinding: { elementId: 'box', focus: 0, gap: 1 }, endBinding: null }),
      shape('frame', { type: 'frame' }),
      shape('child', { frameId: 'frame' }),
      shape('survivor', {
        boundElements: [
          { id: 'arrow', type: 'arrow' },
          { id: 'label', type: 'text' },
        ],
      }),
    ]
    await call('sdraw_delete_elements', { sheetId: 'a', expectedRevision: 6, ids: ['box', 'frame'] })
    const byId = new Map(elements.map((element) => [element.id, element]))
    expect(byId.get('box')?.isDeleted).toBe(true)
    expect(byId.get('label')?.isDeleted).toBe(true)
    expect(byId.get('child')).toMatchObject({ isDeleted: false, frameId: null })
    expect(byId.get('arrow')).toMatchObject({ isDeleted: false, startBinding: null })
    expect(byId.get('survivor')?.boundElements).toEqual([{ id: 'arrow', type: 'arrow' }])
  })

  it('saves the live scene before switching away from the active sheet', async () => {
    elements = [shape('unsaved', { x: 333 })]
    const unsubscribe = useDrawStore.subscribe((state, previous) => {
      if (state.activeId !== previous.activeId) {
        elements = [shape('target')]
        setDrawApi(fixtureApi)
      }
    })
    try {
      await call('sdraw_manage_sheets', { action: 'switch', sheet: 'b' })
      expect(useDrawStore.getState().activeId).toBe('b')
      expect(useDrawStore.getState().sheets[0].scene.elements[0]).toMatchObject({ id: 'unsaved', x: 333 })
      expect(await read()).toMatchObject({ sheetId: 'b' })
    } finally {
      unsubscribe()
    }
  })

  it('keeps the current canvas usable when switching to its already-active sheet', async () => {
    await call('sdraw_manage_sheets', { action: 'switch', sheet: 'a' })
    expect(await read()).toMatchObject({ sheetId: 'a', revision: 1 })
    await call('sdraw_update_elements', { sheetId: 'a', expectedRevision: 1, updates: [{ id: 'existing', patch: { x: 99 } }] })
    expect(elements[0].x).toBe(99)
  })

  it('waits for the replacement native canvas to finish loading before reporting a sheet switch', async () => {
    const unsubscribe = useDrawStore.subscribe((state, previous) => {
      if (state.activeId !== previous.activeId) {
        appState = { ...appState, isLoading: true }
        setDrawApi(fixtureApi)
      }
    })
    let completed = false
    const switching = call('sdraw_manage_sheets', { action: 'switch', sheet: 'b' }).then((result) => {
      completed = true
      return result
    })
    try {
      await Promise.resolve()
      await Promise.resolve()
      expect(completed).toBe(false)
      await expect(read()).rejects.toThrow(/loading/i)
      elements = [shape('loaded-target')]
      appState = { ...appState, isLoading: false }
      await switching
      expect(await call('sdraw_read_elements', {})).toMatchObject({ items: [{ id: 'loaded-target' }] })
    } finally {
      appState = { ...appState, isLoading: false }
      unsubscribe()
    }
  })

  it('keeps mutation acknowledgments bounded for maximum-length caller IDs', async () => {
    const result = await call('sdraw_create_elements', {
      sheetId: 'a',
      expectedRevision: 1,
      elements: Array.from({ length: 20 }, (_, index) => ({
        id: `${index}`.padEnd(100, 'x'),
        type: 'rectangle',
        x: index * 100,
        y: 0,
        width: 80,
        height: 50,
      })),
    })
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
    expect(elements).toHaveLength(21)
  })

  it('rejects duplicate image IDs within a single batch before adding files', async () => {
    await expect(
      call('sdraw_add_files', {
        sheetId: 'a',
        files: [
          { id: 'duplicate', dataURL: 'data:image/png;base64,b2xk', mimeType: 'image/png' },
          { id: 'duplicate', dataURL: 'data:image/png;base64,bmV3', mimeType: 'image/png' },
        ],
      }),
    ).rejects.toThrow(/duplicate|unique|already exists/i)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('rejects replacing existing file data before any image mutation', async () => {
    files = { image: { id: 'image', dataURL: 'data:image/png;base64,b2xk', mimeType: 'image/png', created: 1 } } as unknown as BinaryFiles
    await expect(
      call('sdraw_add_files', { sheetId: 'a', files: [{ id: 'image', dataURL: 'data:image/png;base64,bmV3', mimeType: 'image/png' }] }),
    ).rejects.toThrow(/already exists/i)
    expect(addFiles).not.toHaveBeenCalled()
    expect(files.image.dataURL).toBe('data:image/png;base64,b2xk')
  })

  it('does not claim success when persistence fails after a canvas change', async () => {
    useDrawStore.setState({
      flushPersistence: vi.fn(async () => {
        useDrawStore.setState({ error: 'Storage is full' })
      }),
    })
    await expect(
      call('sdraw_update_elements', { sheetId: 'a', expectedRevision: 1, updates: [{ id: 'existing', patch: { x: 22 } }] }),
    ).rejects.toThrow('Storage is full')
  })
})

describe('selected frame scope and invalid native input', () => {
  it('includes frame contents and their bound labels while excluding unrelated content', async () => {
    elements = [
      shape('frame', { type: 'frame' }),
      shape('box', { frameId: 'frame' }),
      shape('label', { type: 'text', containerId: 'box', text: 'Important' }),
      shape('outside'),
    ]
    appState.selectedElementIds = { frame: true }
    const result = (await call('sdraw_read_elements', { scope: 'selection', limit: 10 })) as { items: { id: string }[] }
    expect(result.items.map((element) => element.id)).toEqual(['frame', 'box', 'label'])
  })

  it('bounds schema errors for a malformed batch without changing the drawing', async () => {
    try {
      await call('sdraw_create_elements', {
        sheetId: 'a',
        expectedRevision: 1,
        elements: Array.from({ length: 20 }, () => ({ type: 'unknown', x: 'invalid', y: 'invalid' })),
      })
      throw new Error('Expected validation failure')
    } catch (error) {
      expect((error as Error).message.length).toBeLessThanOrEqual(1200)
      expect((error as Error).message).toContain('elements.0')
      expect(updateScene).not.toHaveBeenCalled()
    }
  })

  it('rejects malformed native bindings atomically before passing data to Excalidraw', async () => {
    await expect(
      call('sdraw_update_elements', { sheetId: 'a', expectedRevision: 1, updates: [{ id: 'existing', patch: { boundElements: [null] } }] }),
    ).rejects.toThrow('boundElements')
    expect(updateScene).not.toHaveBeenCalled()
  })
})

describe('layout findings in create and update results', () => {
  const create = (extra: Record<string, unknown>) =>
    call('sdraw_create_elements', {
      sheetId: 'a',
      expectedRevision: 1,
      elements: [{ type: 'rectangle', width: 100, height: 50, ...extra }],
    }) as Promise<{ layout: string | { issues: number; found: { kind: string; ids: string[] }[]; next: string } }>

  it('says nothing is wrong when new shapes land in free space', async () => {
    const result = await create({ id: 'free', x: 400, y: 400 })
    expect(typeof result.layout).toBe('string')
    expect(result.layout).toMatch(/No overlaps, duplicates or crossings/)
  })

  it('reports a new shape that runs into what is already on the sheet, without being asked to check', async () => {
    const result = await create({ id: 'collides', x: 60, y: 20 })
    expect(result.layout).toMatchObject({ issues: 1, found: [{ kind: 'boxes_overlap' }] })
    const found = (result.layout as { found: { ids: string[] }[] }).found[0]
    expect(found.ids).toEqual(expect.arrayContaining(['existing', 'collides']))
    expect((result.layout as { next: string }).next).toMatch(/Fix these/)
  })

  it('reports content that is drawn again on top of itself', async () => {
    const result = await create({ id: 'again', x: 0, y: 0 })
    expect(result.layout).toMatchObject({ found: [{ kind: 'duplicate_element', ids: ['existing', 'again'] }] })
  })

  it('reports a move that puts an element on top of another, and ignores problems it did not touch', async () => {
    elements = [shape('one', { x: 0 }), shape('two', { x: 500 }), shape('old-a', { x: 0, y: 800 }), shape('old-b', { x: 50, y: 820 })]
    const moved = (await call('sdraw_update_elements', {
      sheetId: 'a',
      expectedRevision: (await read()).revision,
      updates: [{ id: 'two', patch: { x: 40 } }],
    })) as { layout: { found: { kind: string; ids: string[] }[] } }
    expect(moved.layout.found).toEqual([{ kind: 'boxes_overlap', ids: expect.arrayContaining(['one', 'two']) }])
  })

  it('tells the agent a created sheet is now active and what to do next', async () => {
    // The canvas remounts for the new sheet, as it does in the app.
    const unsubscribe = useDrawStore.subscribe((state, previous) => {
      if (state.activeId !== previous.activeId) {
        elements = []
        setDrawApi(fixtureApi)
      }
    })
    try {
      const result = (await call('sdraw_manage_sheets', { action: 'create', name: 'Explanation' })) as {
        action: string
        sheetId: string
        activeSheetId: string
        note: string
      }
      expect(result.action).toBe('create')
      expect(result.activeSheetId).toBe(result.sheetId)
      expect(result.note).toMatch(/now the active one.*sdraw status/)
    } finally {
      unsubscribe()
    }
  })
})
