// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI, LibraryItems } from '@excalidraw/excalidraw/types'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { whenLegacyImported } from '@/db/client'

import { getDrawApi, getDrawContext, setDrawApi } from './bridge'
import { readDrawWorkspace, writeDrawWorkspace } from './s-draw.db'
import { useDrawStore } from './s-draw.store'

vi.mock('@excalidraw/excalidraw', () => ({
  serializeAsJSON: (elements: unknown, appState: unknown, files: unknown) => JSON.stringify({ elements, appState, files }),
}))

function element(id: string, text = '') {
  return { id, type: 'text', text, x: 10, y: 20, width: 40, height: 30, angle: 0, isDeleted: false } as ExcalidrawElement
}

afterEach(async () => {
  setDrawApi(null)
  await useDrawStore.getState().flushPersistence()
})

describe('S Draw workspace', () => {
  beforeAll(() => whenLegacyImported(), 60000)
  it('persists separate sheets, embedded image files, and library items in PGlite', async () => {
    await useDrawStore.getState().hydrate()
    const first = useDrawStore.getState().createSheet('Diagram')
    const second = useDrawStore.getState().createSheet('Notes')
    const files = {
      picture: { id: 'picture', dataURL: 'data:image/png;base64,abc', mimeType: 'image/png', created: 1 },
    } as unknown as Parameters<ReturnType<typeof useDrawStore.getState>['saveScene']>[3]
    useDrawStore
      .getState()
      .saveScene(first, [element('first')], { viewBackgroundColor: '#abcdef', scrollX: 210, scrollY: -42, collaborators: new Map() }, files)
    useDrawStore.getState().saveScene(second, [element('second')], {}, {})
    const library = [
      { id: 'library-1', status: 'unpublished', created: 1, elements: [element('library-element')] },
    ] as unknown as LibraryItems
    useDrawStore.getState().setLibraryItems(library)
    useDrawStore.getState().setActiveSheet(first)
    await useDrawStore.getState().flushPersistence()
    const saved = (await readDrawWorkspace())!
    expect(saved.activeId).toBe(first)
    expect(saved.libraryItems).toEqual(library)
    expect(saved.sheets.find((sheet) => sheet.id === first)?.scene.files).toEqual(files)
    expect(saved.sheets.find((sheet) => sheet.id === second)?.scene.elements[0].id).toBe('second')
    await writeDrawWorkspace(saved)
    useDrawStore.setState({ ready: false, sheets: [], activeId: '' })
    await useDrawStore.getState().hydrate()
    expect(useDrawStore.getState().activeId).toBe(first)
    expect(useDrawStore.getState().libraryItems).toEqual(library)
    expect(useDrawStore.getState().sheets.find((sheet) => sheet.id === first)?.scene.appState.viewBackgroundColor).toBe('#abcdef')
    expect(useDrawStore.getState().sheets.find((sheet) => sheet.id === first)?.scene.appState.scrollX).toBe(210)
    expect(useDrawStore.getState().sheets.find((sheet) => sheet.id === first)?.scene.appState.collaborators).toBeUndefined()
  })

  it('flushes changes to their own file before opening another file', async () => {
    await useDrawStore.getState().hydrate('file-a')
    const sheetA = useDrawStore.getState().activeId
    useDrawStore.getState().saveScene(sheetA, [element('only-a')], {}, {})
    await useDrawStore.getState().hydrate('file-b')
    expect(useDrawStore.getState().fileId).toBe('file-b')
    expect(useDrawStore.getState().sheets.flatMap((sheet) => sheet.scene.elements)).toEqual([])
    const sheetB = useDrawStore.getState().activeId
    useDrawStore.getState().saveScene(sheetB, [element('only-b')], {}, {})
    await useDrawStore.getState().hydrate('file-a')
    expect(useDrawStore.getState().sheets[0].scene.elements.map((element) => element.id)).toEqual(['only-a'])
    expect((await readDrawWorkspace('file-b'))?.sheets[0].scene.elements.map((element) => element.id)).toEqual(['only-b'])
  })

  it('rejects stale canvas APIs while switching sheets and preserves a usable sheet after deleting all sheets', async () => {
    await useDrawStore.getState().hydrate()
    const api = { getAppState: () => ({ isLoading: false }) } as ExcalidrawImperativeAPI
    setDrawApi(api)
    expect(getDrawApi()).toBe(api)
    useDrawStore.getState().createSheet('Other')
    expect(() => getDrawApi()).toThrow('loading')
    for (const sheet of [...useDrawStore.getState().sheets]) useDrawStore.getState().deleteSheet(sheet.id)
    expect(useDrawStore.getState().sheets).toHaveLength(1)
    expect(useDrawStore.getState().activeId).toBe(useDrawStore.getState().sheets[0].id)
  })

  it('bounds large drawing context while retaining selected content and whole-sheet structure', async () => {
    await useDrawStore.getState().hydrate()
    const elements = Array.from({ length: 1200 }, (_, index) => element(`element-${index}`, 'text'.repeat(300)))
    setDrawApi({
      getSceneElements: () => elements,
      getAppState: () => ({ selectedElementIds: { 'element-1199': true } }),
    } as unknown as ExcalidrawImperativeAPI)
    const json = getDrawContext()
    const context = JSON.parse(json)
    expect(json.length).toBeLessThanOrEqual(24_000)
    expect(context.selection.elements[0].id).toBe('element-1199')
    expect(context.overview.types.text).toBe(1200)
    expect(context.elementCount).toBe(1200)
    expect(context.truncated).toBe(true)
  })
})
