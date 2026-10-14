import { useEffect } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Outlet } from 'react-router-dom'

import { SettingsDialog } from '@/components/settings-dialog'
import { startNoteSync } from '@/features/note/note.store'

function MainLayout() {
  useEffect(() => startNoteSync(), [])

  // One drag-and-drop backend for the whole app: nested editors share it.
  return (
    <DndProvider backend={HTML5Backend}>
      <main className="flex min-h-svh flex-col">
        <Outlet />
        <SettingsDialog />
      </main>
    </DndProvider>
  )
}

export default MainLayout
