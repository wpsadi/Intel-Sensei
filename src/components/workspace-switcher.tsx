"use client"

import * as React from "react"

import { CheckIcon, ChevronDownIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const DEFAULT_WORKSPACE = "My workspace"

export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = React.useState([DEFAULT_WORKSPACE])
  const [activeWorkspace, setActiveWorkspace] = React.useState(DEFAULT_WORKSPACE)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [renameTarget, setRenameTarget] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)

  const trimmedRename = renameValue.trim()
  const renameTaken =
    trimmedRename !== renameTarget && workspaces.includes(trimmedRename)

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (!workspaces.includes(name)) {
      setWorkspaces([...workspaces, name])
    }
    setActiveWorkspace(name)
    setNewName("")
    setCreateOpen(false)
  }

  function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renameTarget || !trimmedRename || renameTaken) return
    setWorkspaces(
      workspaces.map((workspace) =>
        workspace === renameTarget ? trimmedRename : workspace
      )
    )
    if (activeWorkspace === renameTarget) {
      setActiveWorkspace(trimmedRename)
    }
    setRenameTarget(null)
  }

  function handleDelete() {
    if (!deleteTarget) return
    const remaining = workspaces.filter((workspace) => workspace !== deleteTarget)
    setWorkspaces(remaining)
    if (activeWorkspace === deleteTarget) {
      setActiveWorkspace(remaining[0])
    }
    setDeleteTarget(null)
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<SidebarMenuButton className="w-fit px-1.5" />}
            >
              <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
                {activeWorkspace.charAt(0).toUpperCase()}
              </div>
              <span className="truncate font-medium">{activeWorkspace}</span>
              <ChevronDownIcon className="opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 rounded-lg"
              align="start"
              side="bottom"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Workspaces
                </DropdownMenuLabel>
                {workspaces.map((workspace) => (
                  <div key={workspace} className="flex items-center gap-1">
                    <DropdownMenuItem
                      onClick={() => setActiveWorkspace(workspace)}
                      className="flex-1 gap-2 p-2"
                    >
                      <div className="flex size-6 items-center justify-center rounded-xs border text-xs font-medium">
                        {workspace.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{workspace}</span>
                      {workspace === activeWorkspace && (
                        <CheckIcon className="ml-auto size-4" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Options for ${workspace}`}
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-40 rounded-lg"
                        align="start"
                        side="right"
                        sideOffset={4}
                      >
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameTarget(workspace)
                            setRenameValue(workspace)
                          }}
                        >
                          <PencilIcon />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          disabled={workspaces.length === 1}
                          onClick={() => setDeleteTarget(workspace)}
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="gap-2 p-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                    <PlusIcon className="size-4" />
                  </div>
                  <div className="font-medium text-muted-foreground">
                    Create workspace
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={handleCreate} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Create workspace</DialogTitle>
              <DialogDescription>
                Give your new workspace a name.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              placeholder="Workspace name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={!newName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
      >
        <DialogContent>
          <form onSubmit={handleRename} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Rename workspace</DialogTitle>
              <DialogDescription>
                Enter a new name for this workspace.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              placeholder="Workspace name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            {renameTaken && (
              <p className="text-sm text-destructive">
                A workspace with this name already exists.
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={!trimmedRename || renameTaken}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace?</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget}&quot; will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
