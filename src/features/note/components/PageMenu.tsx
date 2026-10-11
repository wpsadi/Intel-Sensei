import {
  CopyIcon,
  CopyPlusIcon,
  DownloadIcon,
  FileTextIcon,
  FolderInputIcon,
  Link2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Page, PageFont } from '../db/types'
import { useEffect, useState } from 'react'
import { displaySettings } from '../lib/display'
import { PageIcon, pageTitle } from '../editor/nodes/pages'
import { pageToMarkdown } from '../lib/markdown'

import { selectAncestry, useNoteStore } from '../note.store'
import { copyText } from '@/lib/clipboard'
import { toast } from 'sonner'
import { useAllPages } from '../db/hooks'
import { useNavigate } from 'react-router-dom'
const FONTS: { value: PageFont; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
]

/** Picks a new parent for a page. Pages inside the moved page are excluded to avoid cycles. */
function MovePageDialog({ page, open, onOpenChange }: { page: Page; open: boolean; onOpenChange: (open: boolean) => void }) {
  const pages = useAllPages()
  const [targets, setTargets] = useState<Page[]>([])

  useEffect(() => {
    if (!open || !pages) return
    let alive = true
    const candidates = pages.filter((p) => p.kind === 'page' && !p.trashed && p.id !== page.id)
    Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        inside: selectAncestry(useNoteStore.getState(), candidate.id).some((ancestor) => ancestor.id === page.id),
      })),
    ).then((rows) => {
      if (alive) setTargets(rows.filter((row) => !row.inside).map((row) => row.candidate))
    })
    return () => {
      alive = false
    }
  }, [open, pages, page.id])

  const move = async (parentId: string | null) => {
    await useNoteStore.getState().movePage(page.id, parentId)
    onOpenChange(false)
    toast('Page moved')
  }

  const row = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move “{pageTitle(page.title)}” to</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-80">
          <button type="button" onClick={() => move(null)} className={row}>
            Workspace root
          </button>
          {targets.map((target) => (
            <button key={target.id} type="button" onClick={() => move(target.id)} className={row}>
              {target.icon ? <PageIcon icon={target.icon} /> : <FileTextIcon className="size-4 text-muted-foreground" />}
              <span className="truncate">{pageTitle(target.title)}</span>
            </button>
          ))}
          {pages && targets.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No other pages to move into.</p>}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

/** The "…" menu in the page header. Every setting is stored on the page itself. */
export function PageMenu({ page }: { page: Page }) {
  const navigate = useNavigate()
  const [moving, setMoving] = useState(false)
  const settings = displaySettings(page)
  const isRow = page.parentType === 'database'
  const isFullDatabase = page.kind === 'database'

  const updatePage = useNoteStore((s) => s.updatePage)
  const update = (patch: Partial<Page>) => updatePage(page.id, patch)

  // Links are paths in this browser's local store, so they only open in this browser profile.
  const copyLink = async () => {
    const copied = await copyText(`${location.origin}/s-note/${page.id}`)
    if (copied) toast('Link copied')
    else toast.error("Couldn't copy the link. Try again after clicking on the page.")
  }

  const duplicate = async () => {
    const copy = await useNoteStore.getState().duplicatePage(page.id)
    if (copy) navigate(`/s-note/${copy.id}`)
  }

  const trash = async () => {
    // Chain runs root → page, so reversing it puts the parent right after the page.
    const [, parent] = selectAncestry(useNoteStore.getState(), page.id).reverse()
    await useNoteStore.getState().setPageTrashed(page.id, true)
    navigate(parent ? `/s-note/${parent.id}` : '/s-note')
    toast('Moved to Trash')
  }

  const copyContents = async () => {
    const copied = await copyText(pageToMarkdown(page))
    if (copied) toast('Page contents copied')
    else toast.error("Couldn't copy the page contents. Try again after clicking on the page.")
  }

  const exportMarkdown = () => {
    const url = URL.createObjectURL(new Blob([pageToMarkdown(page)], { type: 'text/markdown' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `${page.title || 'Untitled'}.md` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" title="Page menu" className="rounded p-1 hover:bg-muted" />}>
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={copyLink}>
            <Link2Icon /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate} disabled={isFullDatabase}>
            <CopyPlusIcon /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoving(true)} disabled={isRow}>
            <FolderInputIcon /> Move to…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={trash} className="text-destructive">
            <Trash2Icon /> Move to Trash
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          {/* Base UI requires menu labels to live inside a group. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Font</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={settings.font} onValueChange={(font) => update({ font: font as PageFont })}>
              {FONTS.map((font) => (
                <DropdownMenuRadioItem key={font.value} value={font.value}>
                  {font.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={settings.smallText} onCheckedChange={(smallText) => update({ smallText })}>
            Small text
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={settings.fullWidth} onCheckedChange={(fullWidth) => update({ fullWidth })}>
            Full width
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={settings.locked} onCheckedChange={(locked) => update({ locked })}>
            Lock page
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyContents}>
            <CopyIcon /> Copy page contents
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportMarkdown}>
            <DownloadIcon /> Export as Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MovePageDialog page={page} open={moving} onOpenChange={setMoving} />
    </>
  )
}
