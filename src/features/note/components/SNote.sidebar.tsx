import {
  ArrowLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FilePlusIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

import { useAllPages, useChildPages } from '../db/hooks'
import type { Page } from '../db/types'
import { pageTitle } from '../editor/nodes/page-utils'
import { PageIcon } from '../editor/nodes/PageIcon'
import { useNoteStore } from '../note.store'
import { SNoteBrand } from './SNote.brand'

/** Children of a page in the tree: sub pages, or rows for a full-page database. */
const childKey = (page: Page) => (page.kind === 'database' ? (page.databaseId ?? page.id) : page.id)

function PageRow({ page, depth }: { page: Page; depth: number }) {
  const { pageId } = useParams()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const children = useChildPages(open ? childKey(page) : undefined)
  const addRow = useNoteStore((s) => s.addRow)
  const createPage = useNoteStore((s) => s.createPage)
  const updatePage = useNoteStore((s) => s.updatePage)
  const setPageTrashed = useNoteStore((s) => s.setPageTrashed)

  const addChild = async () => {
    const child = page.kind === 'database' ? await addRow(page.databaseId!) : await createPage({ parentId: page.id, parentType: 'page' })
    setOpen(true)
    navigate(`/s-note/${child.id}`)
  }

  return (
    <li>
      <div
        className={cn(
          'group/row flex h-7 items-center gap-1 rounded-md pr-1 text-sm hover:bg-sidebar-accent',
          pageId === page.id && 'bg-sidebar-accent font-medium',
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <button type="button" onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
          <ChevronRightIcon className={cn('size-3.5 transition', open && 'rotate-90')} />
        </button>
        <Link to={`/s-note/${page.id}`} className="flex min-w-0 flex-1 items-center gap-1.5">
          {page.kind === 'database' && !page.icon ? (
            <DatabaseIcon className="size-4 text-muted-foreground" />
          ) : (
            <PageIcon icon={page.icon} content={page.content} />
          )}
          <span className="truncate">{pageTitle(page.title)}</span>
        </Link>
        <span className="hidden items-center gap-0.5 group-hover/row:flex">
          <button
            type="button"
            title={page.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => updatePage(page.id, { favorite: !page.favorite })}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            {page.favorite ? <StarOffIcon className="size-3.5" /> : <StarIcon className="size-3.5" />}
          </button>
          <button
            type="button"
            title="Move to trash"
            onClick={() => setPageTrashed(page.id, true)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <Trash2Icon className="size-3.5" />
          </button>
          <button type="button" title="Add a page inside" onClick={addChild} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
            <PlusIcon className="size-3.5" />
          </button>
        </span>
      </div>
      {open && (
        <ul>
          {children?.map((child) => (
            <PageRow key={child.id} page={child} depth={depth + 1} />
          ))}
          {children?.length === 0 && (
            <li className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: (depth + 1) * 12 + 24 }}>
              No pages inside
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pages = useAllPages()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const q = query.toLowerCase()
  const results = (pages ?? [])
    .filter((p) => !p.trashed && (pageTitle(p.title).toLowerCase().includes(q) || (q.length > 2 && p.content.toLowerCase().includes(q))))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages…"
          className="h-9 rounded-md border bg-background px-3 text-sm outline-none"
        />
        <ScrollArea className="h-80">
          {results.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => {
                navigate(`/s-note/${page.id}`)
                onOpenChange(false)
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <PageIcon icon={page.icon} content={page.content} /> {pageTitle(page.title)}
              <span className="ml-auto text-xs text-muted-foreground">{new Date(page.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function SNoteSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate()
  const roots = useChildPages(null)
  const all = useAllPages()
  const favorites = (all ?? []).filter((p) => p.favorite && !p.trashed)
  const [dialog, setDialog] = useState<'search' | null>(null)
  const setOpen = (name: typeof dialog) => (open: boolean) => setDialog(open ? name : null)

  const newPage = async () =>
    navigate(`/s-note/${(await useNoteStore.getState().createPage({ parentId: null, parentType: 'workspace' })).id}`)
  const newDatabase = async () => navigate(`/s-note/${(await useNoteStore.getState().createFullPageDatabase(null, 'workspace')).page.id}`)

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />}>
              <ArrowLeftIcon />
              <span>Back to home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setDialog('search')}>
              <SearchIcon />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={newPage}>
              <FilePlusIcon />
              <span>New page</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {favorites.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Favorites</SidebarGroupLabel>
            <SidebarGroupContent>
              <ul>
                {favorites.map((page) => (
                  <PageRow key={page.id} page={page} depth={0} />
                ))}
              </ul>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Private</SidebarGroupLabel>
          <SidebarGroupAction title="New page" onClick={newPage}>
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <ul>
              {roots?.map((page) => (
                <PageRow key={page.id} page={page} depth={0} />
              ))}
            </ul>
            <button
              type="button"
              onClick={newDatabase}
              className="mt-1 flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
            >
              <DatabaseIcon className="size-4" /> New database
            </button>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="?settings=open" />}>
              <Settings2Icon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/s-note/trash" />}>
              <Trash2Icon />
              <span>Trash</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SNoteBrand />
      </SidebarFooter>
      <SidebarRail />
      <SearchDialog open={dialog === 'search'} onOpenChange={setOpen('search')} />
    </Sidebar>
  )
}

export default SNoteSidebar
