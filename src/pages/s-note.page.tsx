import { ChevronRightIcon, StarIcon } from 'lucide-react'

import '@/features/note/snote.css'
import { Fragment, useEffect, useLayoutEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { PageMenu } from '@/features/note/components/PageMenu'
import { PageView } from '@/features/note/components/PageView'
import SNoteSidebar from '@/features/note/components/SNote.sidebar'
import { SNoteSkeleton } from '@/features/note/components/SNoteSkeleton'
import { TrashView } from '@/features/note/components/TrashView'
import { useAncestry, usePage } from '@/features/note/db/hooks'
import { useUndoShortcuts } from '@/features/note/editor/live-editors'
import { pageTitle } from '@/features/note/editor/nodes/page-utils'
import { PageIcon } from '@/features/note/editor/nodes/PageIcon'
import { ensureWorkspace, startReminders } from '@/features/note/lib/bootstrap'
import { useNoteStore } from '@/features/note/note.store'
import { SenseiWidget } from '@/features/note/sensei-widget/SenseiWidget'
import { NoteTools } from '@/features/note/webmcp/NoteTools'
import { cn } from '@/lib/utils'
function PageHeader({ pageId }: { pageId?: string }) {
  const chain = useAncestry(pageId) ?? []
  const page = usePage(pageId)
  const updatePage = useNoteStore((s) => s.updatePage)
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
        {pageId === 'trash' && <span className="px-1">Trash</span>}
        {chain.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 && <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />}
            <Link to={`/s-note/${item.id}`} className="flex min-w-0 items-center gap-1 rounded px-1 hover:bg-muted">
              {item.icon && <PageIcon icon={item.icon} />}
              <span className="truncate">{pageTitle(item.title)}</span>
            </Link>
          </Fragment>
        ))}
      </nav>
      {page && (
        <>
          <span className="hidden text-xs text-muted-foreground sm:block">Edited {new Date(page.updatedAt).toLocaleString()}</span>
          <button
            type="button"
            title="Favorite"
            onClick={() => updatePage(page.id, { favorite: !page.favorite })}
            className="rounded p-1 hover:bg-muted"
          >
            <StarIcon className={cn('size-4', page.favorite && 'fill-yellow-400 text-yellow-400')} />
          </button>
          <PageMenu page={page} />
        </>
      )}
    </header>
  )
}

function SNotePage() {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const ready = useNoteStore((s) => s.ready)
  useUndoShortcuts(pageId)

  // Layout effect: the redirect to the workspace page happens before paint, so the skeleton never shows the wrong page.
  useLayoutEffect(() => {
    // Keep the query string (e.g. ?settings=open) when redirecting into the workspace page.
    if (!pageId) ensureWorkspace().then((id) => id && navigate({ pathname: `/s-note/${id}`, search: location.search }, { replace: true }))
  }, [pageId, navigate])

  useEffect(() => startReminders((id) => navigate(`/s-note/${id}`)), [navigate])

  if (!ready) return <SNoteSkeleton />

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      {/* WebMCP tools for in-browser agents, registered while S-Note is open. */}
      <NoteTools />
      <SNoteSidebar />
      <SidebarInset className="h-svh min-w-0 overflow-hidden md:my-0!">
        <PageHeader pageId={pageId} />
        <ScrollArea className="min-h-0 flex-1">
          {pageId === 'trash' ? <TrashView /> : pageId && <PageView key={pageId} pageId={pageId} />}
        </ScrollArea>
      </SidebarInset>
      <SenseiWidget />
      <Toaster />
    </SidebarProvider>
  )
}

export default SNotePage
