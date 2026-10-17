import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

import { useDrawStore } from './s-draw.store'
import { DRAW_RELATIONSHIP_GUIDANCE, createSceneSummary } from './scene-summary'

let drawApi: ExcalidrawImperativeAPI | null = null
let apiSheetId: string | null = null
let apiFileId: string | null = null

export function setDrawApi(api: ExcalidrawImperativeAPI | null) {
  drawApi = api
  apiSheetId = api ? useDrawStore.getState().activeId : null
  apiFileId = api ? useDrawStore.getState().fileId : null
}

export function getDrawApi(): ExcalidrawImperativeAPI {
  if (
    !drawApi ||
    apiFileId !== useDrawStore.getState().fileId ||
    apiSheetId !== useDrawStore.getState().activeId ||
    drawApi.getAppState().isLoading
  )
    throw new Error('S Draw is loading. Wait for the canvas before drawing.')
  return drawApi
}

export function getDrawContext(): string {
  const { fileId, sheets, activeId } = useDrawStore.getState()
  const api = apiSheetId === activeId ? drawApi : null
  const sheet = sheets.find((item) => item.id === activeId)
  const elements = api?.getSceneElements() ?? sheet?.scene.elements.filter((element) => !element.isDeleted) ?? []
  const selectedIds = Object.keys(api?.getAppState().selectedElementIds ?? {}).filter((id) => api?.getAppState().selectedElementIds[id])
  const summary = elements.map(createSceneSummary(elements))
  const focusIds = new Set(selectedIds)
  let expanded = true
  while (expanded) {
    expanded = false
    for (const element of elements) {
      if (
        !focusIds.has(element.id) &&
        ((element.frameId && focusIds.has(element.frameId)) ||
          ('containerId' in element && element.containerId && focusIds.has(element.containerId)))
      ) {
        focusIds.add(element.id)
        expanded = true
      }
    }
  }
  const focus = summary.filter((element) => focusIds.has(element.id))
  const overview = (items: typeof elements) => {
    const types: Record<string, number> = {}
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity
    for (const item of items) {
      types[item.type] = (types[item.type] ?? 0) + 1
      left = Math.min(left, item.x)
      top = Math.min(top, item.y)
      right = Math.max(right, item.x + item.width)
      bottom = Math.max(bottom, item.y + item.height)
    }
    return {
      elementCount: items.length,
      types,
      bounds: items.length ? { x: left, y: top, width: right - left, height: bottom - top } : null,
    }
  }
  const context = {
    fileId,
    application: 'S Draw',
    activeSheet: sheet ? { id: sheet.id, name: sheet.name.slice(0, 120) } : null,
    sheets: sheets.slice(0, 50).map((item) => ({
      id: item.id,
      name: item.name.slice(0, 120),
      ...overview(item.id === activeId ? elements : item.scene.elements.filter((element) => !element.isDeleted)),
    })),
    sheetCount: sheets.length,
    sheetsTruncated: sheets.length > 50,
    overview: overview(elements),
    elementCount: elements.length,
    selection: { ids: selectedIds.slice(0, 100), total: selectedIds.length, elements: focus.slice(0, 100), truncated: focus.length > 100 },
    elements: summary.slice(0, 100),
    truncated: summary.length > 100,
    guidance: selectedIds.length
      ? 'The user selected these elements as the focus. Preserve other elements unless asked to change them.'
      : 'Consider the whole active sheet. Preserve existing content unless asked to replace it.',
    relationshipGuidance: DRAW_RELATIONSHIP_GUIDANCE,
    largeDrawingGuidance:
      'For truncated drawings, use the S Draw skill and WebMCP tools to inspect sheets and regions in bounded pages before editing. Element summaries omit image data; use scene tools for details.',
  }
  let json = JSON.stringify(context)
  while (json.length > 24_000) {
    if (context.elements.length) {
      context.elements.pop()
      context.truncated = true
    } else if (context.sheets.length > 1) {
      context.sheets.pop()
      context.sheetsTruncated = true
    } else if (context.selection.elements.length) {
      context.selection.elements.pop()
      context.selection.truncated = true
    } else if (context.selection.ids.length) {
      context.selection.ids.pop()
      context.selection.truncated = true
    } else break
    json = JSON.stringify(context)
  }
  return json
}

export async function waitForDrawApi(sheetId: string, signal?: AbortSignal) {
  const deadline = Date.now() + 10000
  while (true) {
    signal?.throwIfAborted()
    if (useDrawStore.getState().activeId !== sheetId)
      throw new Error('The active sheet changed while loading. Inspect the current sheet before editing.')
    try {
      return getDrawApi()
    } catch (error) {
      if (Date.now() >= deadline) throw error
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20))
  }
}
