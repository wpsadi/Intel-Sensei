import { ArrowLeftIcon, ChevronRightIcon, MoreHorizontalIcon, Pencil, Plus, RefreshCcwIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import senseiLogo from '@/assets/sensei.svg'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import type { Chat } from '@/features/note/db/types'
import { cn } from '@/lib/utils'

/** Sensei's own sidebar of saved chats, newest first. Each row has a menu for regenerating the title, renaming, and deleting. */
export function ChatList({
  chats,
  activeId,
  onSelect,
  onNew,
  onRegenerateTitle,
  onRename,
  onDelete,
}: {
  chats: Chat[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRegenerateTitle: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  const [renaming, setRenaming] = useState<Chat | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [deleting, setDeleting] = useState<Chat | null>(null)
  const [chatsOpen, setChatsOpen] = useState(true)

  const startRename = (chat: Chat) => {
    setDraftTitle(chat.title)
    setRenaming(chat)
  }

  const saveRename = () => {
    const title = draftTitle.trim()
    if (renaming && title) onRename(renaming.id, title)
    setRenaming(null)
  }

  return (
    <Sidebar>
      <SidebarHeader className="gap-1.5 p-2">
        <Link
          to="/"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Home
        </Link>
        <Button variant="outline" size="sm" className="justify-start" onClick={onNew}>
          <Plus />
          New chat
        </Button>
      </SidebarHeader>
      <SidebarContent className="min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <SidebarGroup>
            <SidebarGroupLabel className="p-0">
              <button
                type="button"
                aria-expanded={chatsOpen}
                onClick={() => setChatsOpen(!chatsOpen)}
                className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent"
              >
                <ChevronRightIcon className={cn('size-3 transition', chatsOpen && 'rotate-90')} />
                Chats
              </button>
            </SidebarGroupLabel>
            {chatsOpen && (
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5 p-1.5">
                  {chats.map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        size="sm"
                        isActive={chat.id === activeId}
                        onClick={() => onSelect(chat.id)}
                        className="truncate text-xs"
                      >
                        {chat.title}
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className="aria-expanded:bg-muted" />}>
                          <MoreHorizontalIcon />
                          <span className="sr-only">Chat options</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-44" side="right" align="start">
                          <DropdownMenuItem onClick={() => onRegenerateTitle(chat.id)}>
                            <RefreshCcwIcon />
                            <span>Regenerate title</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => startRename(chat)}>
                            <Pencil />
                            <span>Rename</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(chat)}>
                            <Trash2Icon />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <div className="flex items-center gap-2 px-2 py-1">
          <img src={senseiLogo} alt="" className="size-6 shrink-0 brightness-0 invert" />
          <div className="grid text-xs leading-tight">
            <span className="font-medium">Sensei</span>
            <span className="text-muted-foreground">AI</span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>“{deleting?.title}” and its messages will be removed. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) onDelete(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              saveRename()
            }}
          >
            <Input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} aria-label="Chat title" />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!draftTitle.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
