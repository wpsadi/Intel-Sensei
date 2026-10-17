import './excalidraw-setup'
import { serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles, LibraryItems } from '@excalidraw/excalidraw/types'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { readDrawWorkspace, writeDrawWorkspace } from './s-draw.db'
import { type IDrawScene, type IDrawSheet, type IDrawWorkspace, LEGACY_DRAW_FILE_ID } from './s-draw.types'

interface IDrawStore extends IDrawWorkspace {
  fileId: string
  ready: boolean
  error: string | null
  hydrate(fileId?: string): Promise<void>
  createSheet(name?: string): string
  renameSheet(id: string, name: string): void
  applySheetTitle(fileId: string, original: IDrawSheet, title: string, automatic?: boolean): boolean
  deleteSheet(id: string): void
  setActiveSheet(id: string): void
  saveScene(id: string, elements: readonly ExcalidrawElement[], appState: Partial<AppState>, files: BinaryFiles): void
  setLibraryItems(items: LibraryItems): void
  flushPersistence(): Promise<void>
}

export const isDefaultSheetName = (name: string) => /^(Sheet \d+|Untitled sheet)$/i.test(name.trim())

function newSheet(name = 'Untitled sheet', nameLocked = false): IDrawSheet {
  return {
    id: crypto.randomUUID(),
    name,
    nameLocked,
    nameVersion: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    scene: { elements: [], appState: {}, files: {} },
  }
}

function snapshot(): IDrawWorkspace {
  const { sheets, activeId, libraryItems } = useDrawStore.getState()
  return { sheets, activeId, libraryItems }
}

let hydration: Promise<void> | undefined
let hydrationFileId: string | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let pendingWrite = Promise.resolve()
const sceneJson = new Map<string, string>()
const savedAppStateKeys = [
  'scrollX',
  'scrollY',
  'zoom',
  'theme',
  'viewBackgroundColor',
  'gridSize',
  'gridStep',
  'gridModeEnabled',
  'objectsSnapModeEnabled',
  'zenModeEnabled',
  'viewModeEnabled',
  'activeTool',
  'penMode',
  'penDetected',
  'exportBackground',
  'exportEmbedScene',
  'exportWithDarkMode',
  'exportScale',
  'defaultSidebarDockedPreference',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
  'currentItemArrowType',
  'selectedElementIds',
  'selectedGroupIds',
  'editingGroupId',
] satisfies (keyof AppState)[]

function scheduleSave() {
  clearTimeout(timer)
  timer = setTimeout(() => void useDrawStore.getState().flushPersistence(), 250)
}

export const useDrawStore = create<IDrawStore>()(
  immer((set, get) => ({
    fileId: LEGACY_DRAW_FILE_ID,
    ready: false,
    error: null,
    sheets: [],
    activeId: '',
    libraryItems: [],
    async hydrate(fileId = LEGACY_DRAW_FILE_ID) {
      if (hydration) {
        if (hydrationFileId === fileId) return hydration
        await hydration
        return get().hydrate(fileId)
      }
      if (get().ready && get().fileId === fileId) return
      hydrationFileId = fileId
      hydration = (async () => {
        try {
          if (get().ready) {
            await get().flushPersistence()
            if (get().error) throw new Error(get().error!)
          }
          set({ ready: false, error: null })
          const saved = await readDrawWorkspace(fileId)
          const sheets = saved?.sheets.length ? saved.sheets : [newSheet('Sheet 1')]
          const activeId = sheets.some((sheet) => sheet.id === saved?.activeId) ? saved!.activeId : sheets[0].id
          const libraryItems = saved?.libraryItems ?? []
          await writeDrawWorkspace({ sheets, activeId, libraryItems }, fileId)
          sceneJson.clear()
          set({
            fileId,
            sheets,
            activeId,
            libraryItems,
            ready: true,
            error: null,
          })
        } catch (error) {
          set({ error: `Could not open drawings: ${error instanceof Error ? error.message : String(error)}` })
        } finally {
          hydration = undefined
          hydrationFileId = undefined
        }
      })()
      return hydration
    },
    createSheet(name) {
      const sheet = newSheet(name?.trim() || `Sheet ${get().sheets.length + 1}`, !!name?.trim())
      set({ sheets: [...get().sheets, sheet], activeId: sheet.id })
      scheduleSave()
      return sheet.id
    },
    renameSheet(id, name) {
      if (!name.trim()) return
      set({
        sheets: get().sheets.map((sheet) =>
          sheet.id === id
            ? { ...sheet, name: name.trim(), nameLocked: true, nameVersion: (sheet.nameVersion ?? 0) + 1, updatedAt: Date.now() }
            : sheet,
        ),
      })
      scheduleSave()
    },
    applySheetTitle(fileId, original, title, automatic = false) {
      const sheet = get().sheets.find((sheet) => sheet.id === original.id)
      if (get().fileId !== fileId || !sheet || sheet.name !== original.name || (sheet.nameVersion ?? 0) !== (original.nameVersion ?? 0))
        return false
      if (automatic && (sheet.nameLocked || !isDefaultSheetName(sheet.name))) return false
      const base = title.replace(/\s+/g, ' ').trim().slice(0, 60)
      if (!base) return false
      const taken = new Set(
        get()
          .sheets.filter((item) => item.id !== sheet.id)
          .map((item) => item.name),
      )
      let name = base
      let suffix = 2
      while (taken.has(name)) name = `${base.slice(0, 50)} (${suffix++})`
      set({
        sheets: get().sheets.map((item) =>
          item.id === sheet.id
            ? { ...item, name, nameLocked: true, nameVersion: (item.nameVersion ?? 0) + 1, updatedAt: Date.now() }
            : item,
        ),
      })
      scheduleSave()
      return true
    },
    deleteSheet(id) {
      const sheets = get().sheets.filter((sheet) => sheet.id !== id)
      if (!sheets.length) sheets.push(newSheet('Sheet 1'))
      set({ sheets, activeId: sheets.some((sheet) => sheet.id === get().activeId) ? get().activeId : sheets[0].id })
      scheduleSave()
    },
    setActiveSheet(id) {
      if (!get().sheets.some((sheet) => sheet.id === id)) throw new Error('Drawing sheet not found')
      set({ activeId: id })
      scheduleSave()
    },
    saveScene(id, elements, appState, files) {
      const exported = JSON.parse(serializeAsJSON(elements, appState, files, 'local')) as IDrawScene
      exported.appState = Object.fromEntries(
        savedAppStateKeys.filter((key) => appState[key] !== undefined).map((key) => [key, appState[key]]),
      )
      const json = JSON.stringify(exported)
      if (sceneJson.get(id) === json) return
      sceneJson.set(id, json)
      const scene = JSON.parse(json) as IDrawScene
      set({ sheets: get().sheets.map((sheet) => (sheet.id === id ? { ...sheet, scene, updatedAt: Date.now() } : sheet)) })
      scheduleSave()
    },
    setLibraryItems(items) {
      set({ libraryItems: items })
      scheduleSave()
    },
    async flushPersistence() {
      clearTimeout(timer)
      if (!get().ready) return
      const value = snapshot()
      const fileId = get().fileId
      pendingWrite = pendingWrite.catch(() => {}).then(() => writeDrawWorkspace(value, fileId))
      try {
        await pendingWrite
        set({ error: null })
      } catch (error) {
        set({ error: `Drawing changes could not be saved: ${error instanceof Error ? error.message : String(error)}` })
      }
    },
  })),
)
