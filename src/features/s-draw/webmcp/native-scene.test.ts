// @vitest-environment jsdom
import type { ExcalidrawElement, ExcalidrawFreeDrawElement, FileId } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles, DataURL, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { createElement } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let native: typeof import('@excalidraw/excalidraw')

beforeAll(async () => {
  vi.stubGlobal(
    'FontFace',
    class {
      family: string
      status = 'loaded'
      constructor(family: string, _source: string, descriptors?: FontFaceDescriptors) {
        this.family = family
        Object.assign(this, descriptors)
      }
      async load() {
        return this
      }
    },
  )
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => true, has: () => true, add() {}, ready: Promise.resolve() },
  })
  vi.stubGlobal(
    'Path2D',
    class {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    },
  )
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        measureText: (text: string) => ({ width: text.length * 10 }),
      }) as unknown as CanvasRenderingContext2D,
  )
  native = await import('@excalidraw/excalidraw')
  native.setCustomTextMetricsProvider({ getLineWidth: (text) => text.length * 10 })
}, 30000)

afterAll(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function diagram() {
  return native.convertToExcalidrawElements(
    [
      { id: 'source', type: 'rectangle', x: 0, y: 0, width: 180, height: 100, label: { text: 'Source' } },
      { id: 'target', type: 'rectangle', x: 360, y: 0, width: 180, height: 100, label: { text: 'Target' } },
      { id: 'edge', type: 'arrow', x: 180, y: 50, width: 180, height: 0, start: { id: 'source' }, end: { id: 'target' } },
    ],
    { regenerateIds: false },
  )
}

describe('native Excalidraw scene operations', () => {
  it('creates cross-batch arrows through the actual tool pipeline without losing existing shapes', async () => {
    const { useDrawStore } = await import('../s-draw.store')
    const { setDrawApi } = await import('../bridge')
    const { executeDrawTool } = await import('./tools')
    let elements: readonly ExcalidrawElement[] = native.convertToExcalidrawElements(
      [
        { id: 'existing', type: 'rectangle', x: 0, y: 0, width: 180, height: 100, label: { text: 'Existing source' } },
        { id: 'unrelated', type: 'ellipse', x: 0, y: 300, width: 70, height: 70 },
      ],
      { regenerateIds: false },
    )
    const originalIds = elements.map((element) => element.id)
    const snapshot = useDrawStore.getState()
    useDrawStore.setState({
      ready: true,
      error: null,
      activeId: 'native-integration',
      sheets: [
        { id: 'native-integration', name: 'Native integration', createdAt: 1, updatedAt: 1, scene: { elements, appState: {}, files: {} } },
      ],
      saveScene: vi.fn(),
      flushPersistence: vi.fn().mockResolvedValue(undefined),
    })
    setDrawApi({
      getSceneElements: () => elements.filter((element) => !element.isDeleted),
      getSceneElementsIncludingDeleted: () => elements,
      getAppState: () => ({ selectedElementIds: {} }) as AppState,
      getFiles: () => ({}),
      updateScene: (update: { elements?: readonly ExcalidrawElement[] }) => {
        if (update.elements) elements = update.elements
      },
    } as unknown as ExcalidrawImperativeAPI)
    try {
      await executeDrawTool('sdraw_create_elements', {
        sheetId: 'native-integration',
        expectedRevision: native.getSceneVersion(elements),
        elements: [
          { id: 'new-target', type: 'rectangle', x: 360, y: 0, width: 180, height: 100, label: { text: 'New target' } },
          { id: 'cross-edge', type: 'arrow', x: 180, y: 50, width: 180, height: 0, start: { id: 'existing' }, end: { id: 'new-target' } },
        ],
      })
      expect(elements.map((element) => element.id)).toEqual(expect.arrayContaining([...originalIds, 'new-target', 'cross-edge']))
      expect(elements.find((element) => element.id === 'cross-edge')).toMatchObject({
        startBinding: { elementId: 'existing' },
        endBinding: { elementId: 'new-target' },
      })
      expect(elements.find((element) => element.id === 'existing')?.boundElements).toContainEqual({ id: 'cross-edge', type: 'arrow' })
      expect(elements.find((element) => element.id === 'new-target')?.boundElements).toContainEqual({ id: 'cross-edge', type: 'arrow' })
      expect(elements.filter((element) => element.id === 'existing')).toHaveLength(1)
    } finally {
      setDrawApi(null)
      useDrawStore.setState(snapshot, true)
    }
  })
  it('mounts the native editor toolbar, menu, library, sheet controls and changes the human drawing tool', async () => {
    const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react/pure')
    const { MemoryRouter } = await import('react-router-dom')
    const { DrawWorkspace } = await import('../components/draw-workspace')
    const { ThemeProvider, useTheme } = await import('next-themes')
    const { useDrawStore } = await import('../s-draw.store')
    const { getDrawApi } = await import('../bridge')
    const snapshot = useDrawStore.getState()
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      const values: Record<string, unknown> = {
        canvas: this,
        measureText: (text: string) => ({ width: text.length * 10 }),
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
        getLineDash: () => [],
        isPointInPath: () => false,
      }
      return new Proxy(values, {
        get(target, key) {
          return target[String(key)] ?? (() => {})
        },
        set(target, key, value) {
          target[String(key)] = value
          return true
        },
      }) as unknown as CanvasRenderingContext2D
    })
    const dimensions = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() {} })
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const elements = native.convertToExcalidrawElements([{ id: 'mounted-shape', type: 'ellipse', x: 50, y: 50, width: 100, height: 100 }], {
      regenerateIds: false,
    })
    useDrawStore.setState({
      ready: true,
      error: null,
      activeId: 'native-mounted',
      sheets: [{ id: 'native-mounted', name: 'Mounted sheet', createdAt: 1, updatedAt: 1, scene: { elements, appState: {}, files: {} } }],
      libraryItems: [],
      saveScene: vi.fn(),
      setLibraryItems: vi.fn(),
      flushPersistence: vi.fn().mockResolvedValue(undefined),
    })
    try {
      function ThemeControl() {
        const { setTheme } = useTheme()
        return createElement('button', { onClick: () => setTheme('light') }, 'Use light theme')
      }
      render(
        createElement(
          ThemeProvider,
          { attribute: 'class', defaultTheme: 'dark', enableSystem: false, storageKey: 'sdraw-theme-test' },
          createElement(ThemeControl),
          createElement(MemoryRouter, null, createElement(DrawWorkspace)),
        ),
      )
      await waitFor(
        () =>
          expect(
            getDrawApi()
              .getSceneElements()
              .some((element) => element.id === 'mounted-shape'),
          ).toBe(true),
        { timeout: 5000 },
      )
      await waitFor(() => expect(getDrawApi().getAppState().theme).toBe('dark'))
      fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }))
      await waitFor(() => expect(getDrawApi().getAppState().theme).toBe('light'))
      expect(
        getDrawApi()
          .getSceneElements()
          .some((element) => element.id === 'mounted-shape'),
      ).toBe(true)
      expect(screen.getByLabelText('Active drawing sheet')).toBeTruthy()
      const library = screen.getByRole('checkbox', { name: 'Library' })
      fireEvent.click(library)
      await waitFor(() => expect(getDrawApi().getAppState().openSidebar).toMatchObject({ name: 'default', tab: 'library' }))
      const rectangle = screen.getByRole('radio', { name: /rectangle/i })
      fireEvent.click(rectangle)
      await waitFor(() => expect(getDrawApi().getAppState().activeTool.type).toBe('rectangle'))
      const menu = screen.getByTestId('main-menu-trigger')
      fireEvent.click(menu)
      expect(await screen.findByText(/export image/i)).toBeTruthy()
    } finally {
      cleanup()
      canvas.mockRestore()
      dimensions.mockRestore()
      useDrawStore.setState(snapshot, true)
    }
  })

  it('creates bound labels and arrows with reciprocal connections', () => {
    const elements = diagram()
    const source = elements.find((element) => element.id === 'source')!
    const target = elements.find((element) => element.id === 'target')!
    const arrow = elements.find((element) => element.id === 'edge')!
    const label = elements.find((element) => element.type === 'text' && element.containerId === source.id)!
    expect(label).toMatchObject({ type: 'text', text: 'Source', containerId: 'source' })
    expect(source.boundElements).toEqual(
      expect.arrayContaining([
        { id: label.id, type: 'text' },
        { id: 'edge', type: 'arrow' },
      ]),
    )
    expect(target.boundElements).toContainEqual({ id: 'edge', type: 'arrow' })
    expect(arrow).toMatchObject({ startBinding: { elementId: 'source' }, endBinding: { elementId: 'target' } })
  })

  it('restores common defaults and renders explicitly normalized freehand and embed elements', () => {
    const elements = native.restoreElements(
      [
        {
          id: 'stroke',
          type: 'freedraw',
          x: 0,
          y: 0,
          width: 80,
          height: 30,
          pressures: [],
          simulatePressure: true,
          lastCommittedPoint: null,
          points: [
            [0, 0],
            [80, 30],
          ],
        },
        { id: 'embed', type: 'embeddable', x: 100, y: 0, width: 300, height: 200, link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      ] as unknown as ExcalidrawElement[],
      null,
      { refreshDimensions: true, repairBindings: true },
    )
    expect(elements).toHaveLength(2)
    expect(elements[0]).toMatchObject({
      id: 'stroke',
      type: 'freedraw',
      simulatePressure: true,
      pressures: [],
      groupIds: [],
      isDeleted: false,
      opacity: 100,
    })
    expect(elements[1]).toMatchObject({
      id: 'embed',
      type: 'embeddable',
      groupIds: [],
      isDeleted: false,
      link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    expect(elements.every((element) => typeof element.version === 'number' && typeof element.index === 'string')).toBe(true)
    const path = native.getFreeDrawSvgPath(elements[0] as ExcalidrawFreeDrawElement)
    expect(path).toMatch(/^M/)
    expect(path).not.toContain('NaN')
  })

  it('refreshes text dimensions while preserving native IDs and arrow bindings', () => {
    const elements = diagram()
    const label = elements.find((element) => element.type === 'text' && element.containerId === 'source')!
    if (label.type !== 'text') throw new Error('Expected a native text element')
    const text = 'A much longer label that must wrap across several lines within the source container'
    const patched = elements.map((element) =>
      element.id === label.id ? native.newElementWith(label, { text, originalText: text }) : element,
    )
    const refreshed = native.restoreElements(patched, null, { refreshDimensions: true, repairBindings: true })
    const updated = refreshed.find((element) => element.id === label.id)!
    expect(refreshed.map((element) => element.id)).toEqual(elements.map((element) => element.id))
    expect(updated).toMatchObject({ id: label.id, containerId: 'source', originalText: text })
    expect(updated.height).toBeGreaterThan(label.height)
    expect(updated.version).toBeGreaterThan(label.version)
    expect(refreshed.find((element) => element.id === 'edge')).toMatchObject({
      startBinding: { elementId: 'source' },
      endBinding: { elementId: 'target' },
    })
  })

  it('round trips native exported scenes and referenced image data through the native blob loader', async () => {
    const elements = [
      ...diagram(),
      ...native.convertToExcalidrawElements(
        [{ id: 'image', type: 'image', x: 20, y: 200, width: 80, height: 60, fileId: 'image-file' as FileId }],
        { regenerateIds: false },
      ),
    ]
    const files: BinaryFiles = {
      'image-file': { id: 'image-file' as FileId, dataURL: 'data:image/png;base64,aGVsbG8=' as DataURL, mimeType: 'image/png', created: 1 },
    }
    const json = native.serializeAsJSON(
      elements,
      { viewBackgroundColor: '#aabbcc', gridModeEnabled: true, collaborators: new Map() },
      files,
      'local',
    )
    const exported = JSON.parse(json)
    expect(exported.appState.collaborators).toBeUndefined()
    expect(exported.files).toEqual(files)
    const restored = await native.loadFromBlob(new Blob([json], { type: 'application/vnd.excalidraw+json' }), null, null)
    expect(restored.elements.map((element) => element.id)).toEqual(elements.map((element) => element.id))
    expect(restored.appState).toMatchObject({ viewBackgroundColor: '#aabbcc', gridModeEnabled: true })
    expect(restored.files).toEqual(files)
    expect(restored.elements.find((element) => element.id === 'edge')).toMatchObject({
      startBinding: { elementId: 'source' },
      endBinding: { elementId: 'target' },
    })
  })
})
