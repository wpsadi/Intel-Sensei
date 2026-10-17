import '../excalidraw-setup'
import { Excalidraw } from '@excalidraw/excalidraw'
import { HomeIcon, LayersIcon, LoaderCircleIcon, PencilIcon, PlusIcon, Settings2Icon, SparklesIcon, Trash2Icon } from 'lucide-react'
import { useTheme } from 'next-themes'

import '@excalidraw/excalidraw/index.css'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { setDrawApi } from '../bridge'
import { useDrawStore } from '../s-draw.store'
import { LEGACY_DRAW_FILE_ID } from '../s-draw.types'
import { titleDrawSheet } from '../sheet-title'
import { DrawSkeleton } from './draw-skeleton'

import '../s-draw.css'

export function DrawWorkspace({ children, fileId = LEGACY_DRAW_FILE_ID }: { children?: ReactNode; fileId?: string }) {
  const [naming, setNaming] = useState(false)
  const [titleError, setTitleError] = useState('')
  const namingController = useRef<AbortController | null>(null)
  useEffect(() => () => namingController.current?.abort(), [])
  const { search } = useLocation()
  const settingsParams = new URLSearchParams(search)
  settingsParams.set('settings', 'open')
  const loadedFileId = useDrawStore((state) => state.fileId)
  const { resolvedTheme } = useTheme()
  const ready = useDrawStore((state) => state.ready)
  const activeId = useDrawStore((state) => state.activeId)
  const sheets = useDrawStore((state) => state.sheets)
  const error = useDrawStore((state) => state.error)
  const sheet = sheets.find((item) => item.id === activeId)

  useEffect(() => {
    void useDrawStore.getState().hydrate(fileId)
    const flush = () => void useDrawStore.getState().flushPersistence()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      flush()
      setDrawApi(null)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fileId])

  if ((!ready || !sheet || loadedFileId !== fileId) && !error) return <DrawSkeleton />
  if (!ready || !sheet || loadedFileId !== fileId)
    return (
      <div className="s-draw-loading" role="status">
        {error}
        {error && <button onClick={() => void useDrawStore.getState().hydrate(fileId)}>Retry</button>}
        <Link to="/">Home</Link>
      </div>
    )

  return (
    <div className="s-draw-workspace">
      <Excalidraw
        key={sheet.id}
        name={sheet.name}
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        initialData={{ ...sheet.scene, libraryItems: useDrawStore.getState().libraryItems }}
        excalidrawAPI={setDrawApi}
        onChange={(elements, appState, files) => useDrawStore.getState().saveScene(sheet.id, elements, appState, files)}
        onLibraryChange={(items) => useDrawStore.getState().setLibraryItems(items)}
        renderTopRightUI={(isMobile) => (
          <details className="s-draw-sheets" data-mobile={isMobile} open={!isMobile}>
            <summary aria-label="Drawing sheets" title="Drawing sheets">
              <LayersIcon size={18} />
            </summary>
            <div className="s-draw-sheet-controls" aria-label="Drawing sheets">
              <Link to="/" aria-label="Home" title="Home">
                <HomeIcon size={17} />
              </Link>
              <select
                aria-label="Active drawing sheet"
                value={activeId}
                onChange={(event) => {
                  setDrawApi(null)
                  useDrawStore.getState().setActiveSheet(event.target.value)
                }}
              >
                {sheets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                aria-label="New sheet"
                title="New sheet"
                onClick={() => {
                  setDrawApi(null)
                  useDrawStore.getState().createSheet()
                }}
              >
                <PlusIcon size={17} />
              </button>
              <button
                aria-label="Rename sheet"
                title="Rename sheet"
                onClick={() => {
                  const name = window.prompt('Sheet name', sheet.name)
                  if (name) useDrawStore.getState().renameSheet(sheet.id, name)
                }}
              >
                <PencilIcon size={16} />
              </button>
              <button
                aria-label="Name sheet with Gemini"
                title="Name sheet with Gemini"
                disabled={naming}
                onClick={async () => {
                  const controller = new AbortController()
                  namingController.current = controller
                  setNaming(true)
                  setTitleError('')
                  try {
                    await titleDrawSheet(fileId, sheet.id, undefined, false, controller.signal)
                  } catch (error) {
                    if (!controller.signal.aborted) setTitleError(error instanceof Error ? error.message : String(error))
                  } finally {
                    if (!controller.signal.aborted) setNaming(false)
                    namingController.current = null
                  }
                }}
              >
                {naming ? <LoaderCircleIcon size={16} className="animate-spin" /> : <SparklesIcon size={16} />}
              </button>
              <button
                aria-label="Delete sheet"
                title="Delete sheet"
                onClick={() => {
                  if (window.confirm(`Delete “${sheet.name}”? This cannot be undone.`)) {
                    setDrawApi(null)
                    useDrawStore.getState().deleteSheet(sheet.id)
                  }
                }}
              >
                <Trash2Icon size={16} />
              </button>
              <Link to={`?${settingsParams}`} aria-label="Settings" title="Settings">
                <Settings2Icon size={17} />
              </Link>
            </div>
          </details>
        )}
      />
      {titleError && (
        <div className="s-draw-save-error" role="alert">
          {titleError} <button onClick={() => setTitleError('')}>Dismiss</button>
        </div>
      )}
      {error && (
        <div className="s-draw-save-error" role="alert">
          {error} <button onClick={() => void useDrawStore.getState().flushPersistence()}>Retry save</button>
        </div>
      )}
      {children}
    </div>
  )
}
