import { Outlet, useSearchParams } from 'react-router-dom'
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
import { chatsRepo } from '@/features/s-3d/db'
import { useAgentRun } from '@/features/s-3d/agent/runner'
import { type S3DDialog, useS3DDialog } from '@/features/s-3d/dialogs/dialog-store'
import { exportProject, importFiles, openFiles } from '@/features/s-3d/io'
import { ADD_LIGHTS, ADD_SHAPES, label } from '@/features/s-3d/scene-editor/scene-editor'
import { addObject, deleteObject, duplicateObject, editScene, sceneActions, selectObject } from '@/features/s-3d/scene-editor/edit'
import { exportScene } from '@/features/s-3d/scene-editor/scene-export'
import { sceneOf } from '@/features/s-3d/render/scene3d'
import { isMac } from '@/features/s-3d/commands'
import { useEffect, useRef, useState } from 'react'
import { ResizeHandle } from '@/components/s-3d/resize-handle'
import { cn } from '@/lib/utils'

const M = isMac ? '⌘' : 'Ctrl+'
const SH = isMac ? '⇧' : 'Shift+'
const itemClass = 'px-2 py-1 text-xs normal-case tracking-normal'
// The standard item padding would put the tick on top of the label, so checkbox items keep room for it.
const checkClass = 'py-1 pr-2 pl-8 text-xs normal-case tracking-normal'
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
  const selected = useS3D((s) => s.sceneEdit?.selected ?? null)
  const sceneNode = useS3D((s) => (s.sceneEdit ? s.doc.nodes[s.sceneEdit.nodeId] : undefined))
  const scene = sceneNode ? sceneOf(sceneNode) : null
  return (
    <Menubar className="h-8 shrink-0 gap-0 rounded-none border-x-0 border-t-0 p-0 px-1">
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs font-semibold">{is2d ? 'S-Design' : 'S3D'}</MenubarTrigger>
        <MenubarContent className={contentClass}>
          {!is2d && <DialogItem dialog="discover" label="Discover 3D models…" />}
          <DialogItem dialog="shortcuts" label="Keyboard shortcuts" shortcut={`${M}/`} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">File</MenubarTrigger>
        <MenubarContent className={contentClass}>
          <MenubarItem className={itemClass} onClick={() => void st().newDoc()}>{is2d ? 'New design file' : 'New 3D file'}</MenubarItem>
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
          {is2d ? <CmdItem id="import" /> : <MenubarItem className={itemClass} onClick={() => void importFiles()}>Import model or image…<MenubarShortcut>{`${SH}${M}K`}</MenubarShortcut></MenubarItem>}
          {is2d ? (
            <DialogItem dialog="export" label="Export…" shortcut={`${M}E`} />
          ) : (
            <MenubarSub>
              <MenubarSubTrigger className={itemClass}>Export as</MenubarSubTrigger>
              <MenubarSubContent className={contentClass}>
                <MenubarItem className={itemClass} onClick={() => exportScene('png').catch(() => {})}>Image (PNG render)</MenubarItem>
                <MenubarItem className={itemClass} onClick={() => exportScene('glb').catch(() => {})}>3D model (.glb)</MenubarItem>
                <MenubarItem className={itemClass} onClick={() => exportScene('obj').catch(() => {})}>3D model (.obj)</MenubarItem>
                <MenubarItem className={itemClass} onClick={() => exportScene('stl').catch(() => {})}>3D print (.stl)</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          )}
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
          {is2d ? (
            <>
              {['copy', 'cut', 'paste', 'duplicate', 'delete'].map((id) => <CmdItem key={id} id={id} />)}
              <MenubarSeparator />
              <CmdItem id="select-all" />
            </>
          ) : (
            <>
              {/* In a 3D scene the commands act on scene objects, not canvas nodes. */}
              <MenubarItem className={itemClass} disabled={!selected} onClick={() => selected && duplicateObject(selected)}>Duplicate object<MenubarShortcut>{`${M}D`}</MenubarShortcut></MenubarItem>
              <MenubarItem className={itemClass} disabled={!selected} onClick={() => selected && deleteObject(selected)}>Delete object<MenubarShortcut>⌫</MenubarShortcut></MenubarItem>
              <MenubarSeparator />
              <MenubarItem className={itemClass} disabled={!selected} onClick={() => selectObject(null)}>Deselect<MenubarShortcut>Esc</MenubarShortcut></MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">{is2d ? 'Insert' : 'Add'}</MenubarTrigger>
        <MenubarContent className={contentClass}>
          {is2d ? (
            <>
              {['tool-frame', 'tool-section', 'tool-rect', 'tool-ellipse', 'tool-polygon', 'tool-star', 'tool-pen', 'tool-text', 'tool-3d', 'tool-comment'].map((id) => <CmdItem key={id} id={id} />)}
              <MenubarSeparator />
              <CmdItem id="import" />
            </>
          ) : (
            <>
              <MenubarSub>
                <MenubarSubTrigger className={itemClass}>Shape</MenubarSubTrigger>
                <MenubarSubContent className={contentClass}>
                  {ADD_SHAPES.map((g) => <MenubarItem key={g} className={itemClass} onClick={() => addObject(g)}>{label(g)}</MenubarItem>)}
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSub>
                <MenubarSubTrigger className={itemClass}>Light</MenubarSubTrigger>
                <MenubarSubContent className={contentClass}>
                  {ADD_LIGHTS.map((l) => <MenubarItem key={l} className={itemClass} onClick={() => addObject(l)}>{label(l)} light</MenubarItem>)}
                </MenubarSubContent>
              </MenubarSub>
              <MenubarItem className={itemClass} onClick={() => addObject('group')}>Empty group</MenubarItem>
              <MenubarSeparator />
              <DialogItem dialog="discover" label="Discover 3D models…" />
              <MenubarItem className={itemClass} onClick={() => void importFiles()}>Import model or image…</MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="h-6 px-2 py-0 text-xs">View</MenubarTrigger>
        <MenubarContent className={contentClass}>
          {is2d && (
            <>
              <MenubarCheckboxItem className={checkClass} checked={showRulers} onCheckedChange={() => st().set({ showRulers: !showRulers })}>Rulers<MenubarShortcut>{cmd('toggle-rulers').shortcut}</MenubarShortcut></MenubarCheckboxItem>
              <MenubarCheckboxItem className={checkClass} checked={showGrid} onCheckedChange={() => st().set({ showGrid: !showGrid })}>Grid<MenubarShortcut>{cmd('toggle-grid').shortcut}</MenubarShortcut></MenubarCheckboxItem>
              <MenubarCheckboxItem className={checkClass} checked={snapToGrid} onCheckedChange={() => st().set({ snapToGrid: !snapToGrid })}>Snap to grid<MenubarShortcut>{cmd('toggle-snap').shortcut}</MenubarShortcut></MenubarCheckboxItem>
              <MenubarSeparator />
              {['zoom-in', 'zoom-out', 'zoom-fit', 'zoom-selection', 'zoom-100'].map((id) => <CmdItem key={id} id={id} />)}
              <MenubarSeparator />
            </>
          )}
          {!is2d && (
            <>
              <MenubarItem className={itemClass} disabled={!selected} onClick={() => sceneActions.frame?.(selected)}>Frame selection<MenubarShortcut>F</MenubarShortcut></MenubarItem>
              <MenubarItem className={itemClass} onClick={() => sceneActions.frame?.(null)}>Frame all</MenubarItem>
              <MenubarSeparator />
              {scene && (
                <>
                  <MenubarCheckboxItem className={checkClass} checked={scene.ground.visible} onCheckedChange={(v) => editScene((sc) => { sc.ground = { ...sc.ground, visible: !!v } })}>Ground</MenubarCheckboxItem>
                  <MenubarCheckboxItem className={checkClass} checked={scene.shadows} onCheckedChange={(v) => editScene((sc) => { sc.shadows = !!v })}>Shadows</MenubarCheckboxItem>
                  <MenubarCheckboxItem className={checkClass} checked={scene.environment === 'studio'} onCheckedChange={(v) => editScene((sc) => { sc.environment = v ? 'studio' : 'none' })}>Studio lighting</MenubarCheckboxItem>
                  <MenubarSeparator />
                </>
              )}
            </>
          )}
          <MenubarCheckboxItem className={checkClass} checked={leftOpen} onCheckedChange={toggleSidebar}>Left sidebar</MenubarCheckboxItem>
          <MenubarCheckboxItem className={checkClass} checked={rightOpen} onCheckedChange={() => setRightOpen(!rightOpen)}>Inspector</MenubarCheckboxItem>
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

/** Mirrors the open file, page and agent chat into the URL (?fileId=&pageId=&chatId=) and opens them from the URL on load. */
function useFileUrlSync(service: Service) {
  const [params, setParams] = useSearchParams()
  const ready = useS3D((s) => s.ready && s.service === service)
  const docId = useS3D((s) => s.doc.id)
  const pageId = useS3D((s) => s.pageId)
  const chatId = useAgentRun((s) => s.viewedId)
  const [applied, setApplied] = useState(false)

  // URL -> store, once the editor is ready.
  useEffect(() => {
    if (!ready || applied) return
    let cancelled = false
    void (async () => {
      const st = useS3D.getState()
      const fileId = params.get('fileId')
      if (fileId && fileId !== st.doc.id && st.docs.some((d) => d.id === fileId)) await st.openDoc(fileId)
      const page = params.get('pageId')
      const cur = useS3D.getState()
      if (page && page !== cur.pageId && cur.doc.pages.some((p) => p.id === page)) cur.setPage(page)
      // A chat in the URL opens in the Agent tab; without one (or an unknown one) the agent starts a plain new chat.
      const chat = params.get('chatId')
      if (chat && (await chatsRepo.list(useS3D.getState().doc.id)).some((c) => c.id === chat)) {
        useAgentRun.setState({ viewedId: chat })
        useS3D.getState().set({ leftTab: 'agent' })
      }
      if (!cancelled) setApplied(true)
    })()
    return () => { cancelled = true }
  }, [ready, applied])

  // Store -> URL.
  useEffect(() => {
    if (!ready || !applied) return
    if (params.get('fileId') === docId && params.get('pageId') === pageId && (params.get('chatId') ?? null) === chatId) return
    const next = new URLSearchParams(params)
    next.set('fileId', docId)
    next.set('pageId', pageId)
    if (chatId) next.set('chatId', chatId)
    else next.delete('chatId')
    setParams(next, { replace: true })
  }, [ready, applied, docId, pageId, chatId])
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
  useFileUrlSync(service)

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
            <S3DRightSidebar service={service} className="top-8 h-[calc(100svh-2rem)]" style={{ width: rightWidth }} />
          </div>
        )}
      </div>
    </SidebarProvider>
  )
}

export default S3DLayout
