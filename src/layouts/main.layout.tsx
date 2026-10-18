import { useEffect } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Outlet } from 'react-router-dom'

import senseiLogo from '@/assets/sensei.svg'
import { startNoteSync } from '@/features/note/note.store'
import { LockScreen } from '@/features/profile/lock-screen'
import { useLockStore } from '@/features/profile/lock.store'
import { SettingsDialog } from '@/features/settings/settings-dialog'

function MainLayout() {
  const status = useLockStore((state) => state.status)
  const init = useLockStore((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  // Nothing below mounts while locked, so no note or chat data is read before the password is entered.
  // Opening the database can take seconds on a slow device; a blank page looks like a site that will not open.
  if (status === 'checking') return <StartupScreen />
  if (status === 'locked') return <LockScreen />
  return <UnlockedLayout />
}

function StartupScreen() {
  return (
    <div role="status" aria-label="Starting Sensei" className="flex min-h-svh flex-col items-center justify-center gap-3">
      <img src={senseiLogo} alt="" className="size-12 animate-pulse brightness-0 dark:invert" />
      <p className="text-sm text-muted-foreground">Starting Sensei…</p>
    </div>
  )
}

function UnlockedLayout() {
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
