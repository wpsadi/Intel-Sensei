import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageIcon, pageTitle } from '../editor/nodes/pages'
import { Undo2Icon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Page } from '../db/types'
import { Button } from '@/components/ui/button'
import { useAllPages } from '../db/hooks'
import { useNoteStore } from '../note.store'
import { useState } from 'react'

/** Every trashed page in one flat list, newest first. Opening one shows it read-only with a banner. */
export function TrashView() {
  const pages = useAllPages()
  const restorePage = useNoteStore((s) => s.setPageTrashed)
  const destroyPage = useNoteStore((s) => s.destroyPage)
  const [pendingDelete, setPendingDelete] = useState<Page | null>(null)
  if (!pages) return null

  const trashed = pages.filter((p) => p.trashed).sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-12">
      <h1 className="mb-1 text-3xl font-bold">Trash</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {trashed.length} {trashed.length === 1 ? 'page' : 'pages'}. Trashed pages are read-only until restored.
      </p>
      {trashed.length === 0 && <p className="text-sm text-muted-foreground">Trash is empty.</p>}
      <div className="flex flex-col">
        {trashed.map((page) => (
          <div key={page.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted/60">
            <PageIcon icon={page.icon} content={page.content} />
            <Link to={`/s-note/${page.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
              {pageTitle(page.title)}
            </Link>
            <span className="hidden text-xs text-muted-foreground sm:block">{new Date(page.updatedAt).toLocaleString()}</span>
            <button type="button" title="Restore" onClick={() => restorePage(page.id, false)} className="rounded p-1 hover:bg-background">
              <Undo2Icon className="size-4" />
            </button>
            <button type="button" title="Delete forever" onClick={() => setPendingDelete(page)} className="rounded p-1 text-red-500 hover:bg-background">
              <Trash2Icon className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete ? pageTitle(pendingDelete.title) : ''}” forever?</DialogTitle>
            <DialogDescription>This cannot be undone. The page and its contents are removed permanently.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) destroyPage(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
