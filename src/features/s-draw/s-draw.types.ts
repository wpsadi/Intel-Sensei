import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles, LibraryItems } from '@excalidraw/excalidraw/types'

import type { WidgetChat } from '@/features/note/db/types'

export interface IDrawScene {
  elements: readonly ExcalidrawElement[]
  appState: Partial<AppState>
  files: BinaryFiles
}

export interface IDrawSheet {
  id: string
  name: string
  nameLocked?: boolean
  nameVersion?: number
  createdAt: number
  updatedAt: number
  scene: IDrawScene
}

export interface IDrawWorkspace {
  sheets: IDrawSheet[]
  activeId: string
  libraryItems: LibraryItems
}

export const LEGACY_DRAW_FILE_ID = 'sdraw-legacy'

export interface IDrawFile extends IDrawWorkspace {
  id: string
  updatedAt: number
}

export interface IDrawChat extends WidgetChat {
  fileId: string
}
