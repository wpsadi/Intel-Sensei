import { Outlet } from 'react-router-dom'
import { PlayIcon, Share2Icon } from 'lucide-react'
import { S3DLeftSidebar } from '@/components/s-3d/s-3d-left-sidebar'
import { S3DRightSidebar } from '@/components/s-3d/s-3d-right-sidebar'
import {
  Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarSub,
  MenubarSubContent, MenubarSubTrigger, MenubarTrigger,
} from '@/components/ui/menubar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { cmd } from '@/features/s-3d/commands'
import type { Service } from '@/features/s-3d/types'
import { useS3D } from '@/features/s-3d/store'
import { type S3DDialog, useS3DDialog } from '@/features/s-3d/dialogs/dialog-store'
import { exportProject, openFiles } from '@/features/s-3d/io'
import { isMac } from '@/features/s-3d/commands'
import { useEffect, useRef, useState } from 'react'
import { ResizeHandle } from '@/components/s-3d/resize-handle'
import { cn } from '@/lib/utils'

const M = isMac ? '⌘' : 'Ctrl+'
const itemClass = 'px-2 py-1 text-xs normal-case tracking-normal'
const contentClass = 'min-w-52 p-1 text-xs'

function CmdItem({ id }: { id: string }) {
  const c = cmd(id)
  const enabled = !c.enabled || c.enabled()
  return (
    <MenubarItem className={itemClass} disabled={!enabled} onClick={() => c.run()}>
      {c.label}
      {c.shortcut && <MenubarShortcut>{c.shortcut}</MenubarShortcut>}
    </MenubarItem>
  )
}

function DialogItem({ dialog, label, shortcut }: { dialog: S3DDialog; label: string; shortcut?: string }) {
  return (
    <MenubarItem className={itemClass} onClick={() => useS3DDialog.getState().setOpen(dialog)}>
      {label}
      {shortcut && <MenubarShortcut>{shortcut}</MenubarShortcut>}
    </MenubarItem>
  )
}

function Peers() {
  const peers = useS3D((s) => s.peers)
  const list = Object.values(peers).filter((p) => Date.now() - p.seen < 15000)
  return (
    <div className="flex -space-x-1.5">
      {list.slice(0, 4).map((p) => (
        <div key={p.id} title={p.name} className="grid size-5 place-items-center rounded-full border-2 border-background text-[9px] font-semibold text-white" style={{ background: p.color }}>{p.name.at(-4)?.toUpperCase()}</div>
      ))}
    </div>
  )
}

function S3DMenubar({ service, rightOpen, setRightOpen }: { service: Service; rightOpen: boolean; setRightOpen: (v: boolean) => void }) {
  const is2d = service === 'design'
  const { toggleSidebar, open: leftOpen } = useSidebar()
  const docs = useS3D((s) => s.docs)
  const docId = useS3D((s) => s.doc.id)
  const showRulers = useS3D((s) => s.showRulers)
  const showGrid = useS3D((s) => s.showGrid)
  const snapToGrid = useS3D((s) => s.snapToGrid)
  const st = useS3D.getState
  return (
    <Menubar className="h-8 shrink-0 gap-0 rounded-none border-x-0 border-t-0 p-0 px-1">
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs font-semibold">{is2d ? 'S-Design' : 'S3D'}</MenubarTrigger>
        <MenubarContent className={contentClass}>
          {!is2d && <DialogItem dialog="discover" label="Discover 3D models…" />}
          <DialogItem dialog="shortcuts" label="Keyboard shortcuts" shortcut={`${M}/`} />
          <MenubarItem className={itemClass} onClick={() => window.open('https://docs.spline.design', '_blank')}>Help & docs</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">File</MenubarTrigger>
        <MenubarContent className={contentClass}>
          <MenubarItem className={itemClass} onClick={() => void st().newDoc()}>New design file</MenubarItem>
          <DialogItem dialog="open" label="Open…" shortcut={`${M}O`} />
          <MenubarItem className={itemClass} onClick={() => void openFiles()}>Open from computer…</MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger className={itemClass}>Recent</MenubarSubTrigger>
            <MenubarSubContent className={contentClass}>
              {docs.slice(0, 10).map((d) => (
                <MenubarItem key={d.id} className={itemClass} disabled={d.id === docId} onClick={() => void st().openDoc(d.id)}>{d.name}</MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <CmdItem id="save" />
          <DialogItem dialog="versions" label="Version history" />
          <MenubarSeparator />
          <CmdItem id="import" />
          <DialogItem dialog="export" label="Export…" shortcut={`${M}E`} />
          <DialogItem dialog="video" label="Export video…" />
          <MenubarItem className={itemClass} onClick={() => void exportProject()}>Save local copy (.s3d)</MenubarItem>
          <MenubarSeparator />
          <DialogItem dialog="share" label="Publish & share…" />
          <MenubarSeparator />
          <MenubarItem className={itemClass} variant="destructive" onClick={() => { if (confirm('Delete this file? Its version history is deleted too.')) void st().deleteDoc(docId) }}>Delete file</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">Edit</MenubarTrigger>
        <MenubarContent className={contentClass}>
          {['undo', 'redo'].map((id) => <CmdItem key={id} id={id} />)}
          <MenubarSeparator />
          {['copy', 'cut', 'paste', 'duplicate', 'delete'].map((id) => <CmdItem key={id} id={id} />)}
          <MenubarSeparator />
          <CmdItem id="select-all" />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">View</MenubarTrigger>
        <MenubarContent className={contentClass}>
          {is2d && (
            <>
              <MenubarCheckboxItem className={itemClass} checked={showRulers} onCheckedChange={() => st().set({ showRulers: !showRulers })}>Rulers<MenubarShortcut>{cmd('toggle-rulers').shortcut}</MenubarShortcut></MenubarCheckboxItem>
              <MenubarCheckboxItem className={itemClass} checked={showGrid} onCheckedChange={() => st().set({ showGrid: !showGrid })}>Grid<MenubarShortcut>{cmd('toggle-grid').shortcut}</MenubarShortcut></MenubarCheckboxItem>
              <MenubarCheckboxItem className={itemClass} checked={snapToGrid} onCheckedChange={() => st().set({ snapToGrid: !snapToGrid })}>Snap to grid<MenubarShortcut>{cmd('toggle-snap').shortcut}</MenubarShortcut></MenubarCheckboxItem>
              <MenubarSeparator />
              {['zoom-in', 'zoom-out', 'zoom-fit', 'zoom-selection', 'zoom-100'].map((id) => <CmdItem key={id} id={id} />)}
              <MenubarSeparator />
            </>
          )}
          <MenubarCheckboxItem className={itemClass} checked={leftOpen} onCheckedChange={toggleSidebar}>Left sidebar</MenubarCheckboxItem>
          <MenubarCheckboxItem className={itemClass} checked={rightOpen} onCheckedChange={() => setRightOpen(!rightOpen)}>Inspector</MenubarCheckboxItem>
          <MenubarSeparator />
          <CmdItem id="play" />
        </MenubarContent>
      </MenubarMenu>
      {is2d && (
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">Object</MenubarTrigger>
        <MenubarContent className={contentClass}>
          {['group', 'ungroup', 'frame-selection', 'add-auto-layout'].map((id) => <CmdItem key={id} id={id} />)}
          <MenubarSeparator />
          {['mask', 'union', 'subtract', 'intersect', 'exclude'].map((id) => <CmdItem key={id} id={id} />)}
          <MenubarSeparator />
          {['bring-front', 'bring-forward', 'send-backward', 'send-back'].map((id) => <CmdItem key={id} id={id} />)}
          <MenubarSeparator />
          {['flip-h', 'flip-v', 'toggle-visible', 'toggle-lock', 'toggle-clip'].map((id) => <CmdItem key={id} id={id} />)}
        </MenubarContent>
      </MenubarMenu>
      )}
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">Help</MenubarTrigger>
        <MenubarContent className={contentClass}>
          <DialogItem dialog="shortcuts" label="Keyboard shortcuts" shortcut={`${M}/`} />
        </MenubarContent>
      </MenubarMenu>
      {!is2d && (
        <button type="button" onClick={() => useS3DDialog.getState().setOpen('discover')} className="h-6 rounded-sm px-2 text-xs hover:bg-muted">
          Discover
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5 pr-1">
        <Peers />
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-xs" className="size-6" aria-label="Preview" onClick={() => st().set({ mode: 'play' })} />}>
            <PlayIcon />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Preview{cmd('play').shortcut && ` (${cmd('play').shortcut})`}</TooltipContent>
        </Tooltip>
        <Button size="xs" className="h-6 px-2 text-xs" onClick={() => useS3DDialog.getState().setOpen('share')}><Share2Icon />Share</Button>
      </div>
    </Menubar>
  )
}

const LEFT = { min: 200, max: 480, initial: 240 }
const RIGHT = { min: 200, max: 480, initial: 240 }
const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v))

function readWidth(key: string, fallback: number) {
  try {
    const v = Number(localStorage.getItem(key))
    return v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

function saveWidth(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // The width is a convenience; losing it is fine.
  }
}

// The menubar spans the full width above both sidebars; the sidebars wrap every S3D child route through <Outlet />.
// Both sidebars resize by dragging their inner edge, and remember their width in this browser.
function S3DLayout({ service }: { service: Service }) {
  const [rightOpen, setRightOpen] = useState(true)
  const [leftWidth, setLeftWidth] = useState(() => clamp(readWidth(`${service}:left-width`, LEFT.initial), LEFT))
  const [rightWidth, setRightWidth] = useState(() => clamp(readWidth(`${service}:right-width`, RIGHT.initial), RIGHT))
  const [dragging, setDragging] = useState(false)
  const start = useRef({ left: leftWidth, right: rightWidth })

  const onDragChange = (active: boolean) => {
    if (active) start.current = { left: leftWidth, right: rightWidth }
    setDragging(active)
  }

  useEffect(() => {
    if (dragging) return
    saveWidth(`${service}:left-width`, leftWidth)
    saveWidth(`${service}:right-width`, rightWidth)
  }, [dragging, leftWidth, rightWidth])

  return (
    <SidebarProvider
      className={cn('h-svh min-h-0 flex-col', dragging && 'cursor-col-resize select-none [&_[data-slot=sidebar-container]]:transition-none [&_[data-slot=sidebar-gap]]:transition-none')}
      style={{ '--sidebar-width': `${leftWidth}px`, '--sidebar-width-icon': '2.5rem' } as React.CSSProperties}
    >
      <S3DMenubar service={service} rightOpen={rightOpen} setRightOpen={setRightOpen} />
      <div className="flex min-h-0 flex-1">
        <S3DLeftSidebar
          className="top-8 h-[calc(100svh-2rem)]"
          resizer={<ResizeHandle className="-right-1" onDragChange={onDragChange} onResize={(dx) => setLeftWidth(clamp(start.current.left + dx, LEFT))} />}
        />
        <SidebarInset className="relative h-full min-w-0">
          <Outlet />
        </SidebarInset>
        {rightOpen && (
          <div className="relative hidden shrink-0 lg:flex">
            <ResizeHandle className="-left-1" onDragChange={onDragChange} onResize={(dx) => setRightWidth(clamp(start.current.right - dx, RIGHT))} />
            <S3DRightSidebar className="top-8 h-[calc(100svh-2rem)]" style={{ width: rightWidth }} />
          </div>
        )}
      </div>
    </SidebarProvider>
  )
}

export default S3DLayout
