import { ContextMenu } from '@base-ui/react/context-menu'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UnlockIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ancestors, childrenOf, isContainer } from '@/features/s-3d/model'
import { currentPage, useS3D } from '@/features/s-3d/store'
import type { Doc, SNode } from '@/features/s-3d/types'
import { cn } from '@/lib/utils'

import { CommandContextMenu } from '../components/command-context-menu'
import { NODE_MENU } from '../components/command-menus'
import { NodeIcon } from './node-icon'

interface Row {
  node: SNode
  depth: number
}

/** Rows front-to-back (the reverse of child order), like every design tool. */
function flatten(doc: Doc, parentId: string, depth: number, out: Row[], query: string) {
  const kids = [...childrenOf(doc, parentId)].reverse()
  for (const id of kids) {
    const node = doc.nodes[id]
    if (!node) continue
    const match = !query || node.name.toLowerCase().includes(query)
    const before = out.length
    if (match || !query) out.push({ node, depth })
    if ((node.expanded || query) && node.children.length) flatten(doc, id, depth + 1, out, query)
    // While searching, keep ancestors of matches visible.
    if (query && !match && out.length > before) out.splice(before, 0, { node, depth })
  }
  return out
}

function InlineRename({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      defaultValue={value}
      className="h-5 min-w-0 flex-1 rounded-sm border border-primary bg-background px-1 text-xs outline-none"
      onBlur={(e) => onDone(e.currentTarget.value.trim() || null)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') onDone(null)
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

function PagesSection() {
  const doc = useS3D((s) => s.doc)
  const pageId = useS3D((s) => s.pageId)
  const st = useS3D.getState
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const page = doc.pages.find((p) => p.id === pageId)
  const item = 'flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-xs outline-hidden select-none data-highlighted:bg-accent'

  return (
    <div className="border-b px-1 py-1">
      <div className="flex items-center gap-1 px-1">
        <button className="flex flex-1 items-center gap-1 py-1 text-xs font-medium" onClick={() => setOpen(!open)}>
          {open ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
          {open ? 'Pages' : page?.name}
        </button>
        <Button variant="ghost" size="icon-xs" className="size-6" aria-label="Add page" onClick={() => st().addPage()}>
          <PlusIcon />
        </Button>
      </div>
      {open && (
        <ScrollArea className="max-h-36" style={{ height: Math.min(144, doc.pages.length * 26 + 4) }}>
          {doc.pages.map((p, i) => (
            <ContextMenu.Root key={p.id}>
              <ContextMenu.Trigger
                render={<div />}
                draggable={renaming !== p.id}
                onDragStart={(e: DragEvent) => {
                  setDragId(p.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e: DragEvent) => e.preventDefault()}
                onDrop={(e: DragEvent) => {
                  e.preventDefault()
                  if (dragId && dragId !== p.id) st().movePage(dragId, i)
                  setDragId(null)
                }}
                className={cn(
                  'flex h-6 items-center gap-2 rounded-sm px-2 text-xs hover:bg-accent',
                  p.id === pageId && 'bg-accent font-medium',
                )}
                onClick={() => p.id !== pageId && st().setPage(p.id)}
                onDoubleClick={() => setRenaming(p.id)}
              >
                <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                {renaming === p.id ? (
                  <InlineRename
                    value={p.name}
                    onDone={(v) => {
                      if (v) st().renamePage(p.id, v)
                      setRenaming(null)
                    }}
                  />
                ) : (
                  <span className="truncate">{p.name}</span>
                )}
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Positioner className="z-50 outline-none">
                  <ContextMenu.Popup className="z-50 min-w-40 rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
                    <ContextMenu.Item className={item} onClick={() => setRenaming(p.id)}>
                      <PencilIcon className="size-3" />
                      Rename
                    </ContextMenu.Item>
                    <ContextMenu.Item className={item} onClick={() => st().duplicatePage(p.id)}>
                      <CopyIcon className="size-3" />
                      Duplicate
                    </ContextMenu.Item>
                    <ContextMenu.Item className={item} disabled={i === 0} onClick={() => st().movePage(p.id, i - 1)}>
                      Move up
                    </ContextMenu.Item>
                    <ContextMenu.Item className={item} disabled={i === doc.pages.length - 1} onClick={() => st().movePage(p.id, i + 1)}>
                      Move down
                    </ContextMenu.Item>
                    <ContextMenu.Separator className="my-1 h-px bg-border" />
                    <ContextMenu.Item
                      className={cn(item, 'text-destructive data-disabled:opacity-40')}
                      disabled={doc.pages.length < 2}
                      onClick={() => st().deletePage(p.id)}
                    >
                      <Trash2Icon className="size-3" />
                      Delete
                    </ContextMenu.Item>
                  </ContextMenu.Popup>
                </ContextMenu.Positioner>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
        </ScrollArea>
      )}
    </div>
  )
}

type DropPos = 'before' | 'after' | 'inside'

function LayerRow({
  row,
  selected,
  ancestorSelected,
  onDragStart,
  onDrop,
  dropHint,
  setDropHint,
  onClick,
}: {
  row: Row
  selected: boolean
  ancestorSelected: boolean
  onDragStart: (id: string) => void
  onDrop: (id: string, pos: DropPos) => void
  dropHint: { id: string; pos: DropPos } | null
  setDropHint: (h: { id: string; pos: DropPos } | null) => void
  onClick: (e: React.MouseEvent, id: string) => void
}) {
  const { node, depth } = row
  const st = useS3D.getState
  const [renaming, setRenaming] = useState(false)
  const hovered = useS3D((s) => s.hovered === node.id)
  const hint = dropHint?.id === node.id ? dropHint.pos : null
  const container = isContainer(node)

  const posFor = (e: DragEvent<HTMLDivElement>): DropPos => {
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    if (container && y > 0.25 && y < 0.75) return 'inside'
    return y < 0.5 ? 'before' : 'after'
  }
  const iconBtn = 'grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground'

  return (
    <div
      data-layer-id={node.id}
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(node.id)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDropHint({ id: node.id, pos: posFor(e) })
      }}
      onDragLeave={() => setDropHint(null)}
      onDrop={(e) => {
        e.preventDefault()
        onDrop(node.id, posFor(e))
      }}
      onClick={(e) => onClick(e, node.id)}
      onContextMenu={() => {
        if (!st().selection.includes(node.id)) st().select([node.id])
      }}
      onDoubleClick={() => setRenaming(true)}
      onMouseEnter={() => st().set({ hovered: node.id })}
      onMouseLeave={() => st().set({ hovered: null })}
      className={cn(
        'group/row relative flex h-7 items-center gap-1 pr-1 text-xs',
        selected ? 'bg-primary/15 text-foreground' : ancestorSelected ? 'bg-primary/5' : hovered ? 'bg-accent' : 'hover:bg-accent',
        !node.visible && 'text-muted-foreground',
        hint === 'inside' && 'ring-1 ring-primary ring-inset',
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {hint === 'before' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" style={{ left: 4 + depth * 12 }} />
      )}
      {hint === 'after' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary" style={{ left: 4 + depth * 12 }} />
      )}
      <button
        className={cn('grid size-4 shrink-0 place-items-center', !node.children.length && 'invisible')}
        onClick={(e) => {
          e.stopPropagation()
          st().updateNodes([node.id], { expanded: !node.expanded })
        }}
        aria-label={node.expanded ? 'Collapse' : 'Expand'}
      >
        {node.expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
      </button>
      <NodeIcon
        node={node}
        className={cn(
          'size-3.5 shrink-0',
          node.type === 'frame' || node.type === 'section' ? 'text-foreground' : 'text-muted-foreground',
          (node.type === 'shape3d' || node.type === 'model3d') && 'text-violet-500',
        )}
      />
      {renaming ? (
        <InlineRename
          value={node.name}
          onDone={(v) => {
            if (v && v !== node.name) st().updateNodes([node.id], { name: v })
            setRenaming(false)
          }}
        />
      ) : (
        <span className={cn('min-w-0 flex-1 truncate', (node.type === 'frame' || node.type === 'section') && 'font-medium')}>
          {node.name}
        </span>
      )}
      <div className={cn('flex items-center', !node.locked && node.visible && 'opacity-0 group-hover/row:opacity-100')}>
        <button
          className={cn(iconBtn, !node.locked && 'opacity-0 group-hover/row:opacity-100')}
          aria-label={node.locked ? 'Unlock' : 'Lock'}
          onClick={(e) => {
            e.stopPropagation()
            st().updateNodes([node.id], { locked: !node.locked })
          }}
        >
          {node.locked ? <LockIcon className="size-3" /> : <UnlockIcon className="size-3" />}
        </button>
        <button
          className={cn(iconBtn, node.visible && 'opacity-0 group-hover/row:opacity-100')}
          aria-label={node.visible ? 'Hide' : 'Show'}
          onClick={(e) => {
            e.stopPropagation()
            st().updateNodes([node.id], { visible: !node.visible })
          }}
        >
          {node.visible ? <EyeIcon className="size-3" /> : <EyeOffIcon className="size-3" />}
        </button>
      </div>
    </div>
  )
}

export function LayersPanel() {
  const doc = useS3D((s) => s.doc)
  const page = useS3D(currentPage)
  const selection = useS3D((s) => s.selection)
  const [query, setQuery] = useState('')
  const [dragIds, setDragIds] = useState<string[]>([])
  const [dropHint, setDropHint] = useState<{ id: string; pos: DropPos } | null>(null)
  const anchor = useRef<string | null>(null)
  const rows = useMemo(() => (page ? flatten(doc, page.id, 0, [], query.trim().toLowerCase()) : []), [doc, page, query])
  const ancestorSet = useMemo(() => new Set(selection.flatMap((id) => (doc.nodes[id] ? ancestors(doc, id) : []))), [doc, selection])

  // Reveal selected nodes: expand their ancestors and scroll the first into view.
  useEffect(() => {
    const st = useS3D.getState()
    const closed = selection.flatMap((id) => (st.doc.nodes[id] ? ancestors(st.doc, id) : [])).filter((a) => !st.doc.nodes[a].expanded)
    if (closed.length) st.mutate((d) => closed.forEach((a) => void (d.nodes[a].expanded = true)), { history: false })
    document.querySelector(`[data-layer-id="${selection[0]}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selection])

  const onClick = (e: React.MouseEvent, id: string) => {
    const st = useS3D.getState()
    if (e.shiftKey && anchor.current) {
      const a = rows.findIndex((r) => r.node.id === anchor.current)
      const b = rows.findIndex((r) => r.node.id === id)
      const parent = st.doc.nodes[id].parentId
      const range = rows
        .slice(Math.min(a, b), Math.max(a, b) + 1)
        .map((r) => r.node.id)
        .filter((x) => st.doc.nodes[x].parentId === parent)
      st.set({ selection: range })
      return
    }
    if (e.metaKey || e.ctrlKey) st.select([id], true)
    else st.select([id])
    anchor.current = id
  }

  const onDrop = (targetId: string, pos: DropPos) => {
    setDropHint(null)
    const st = useS3D.getState()
    const ids = dragIds.filter((id) => id !== targetId && !ancestors(st.doc, targetId).includes(id))
    if (!ids.length) return
    const target = st.doc.nodes[targetId]
    if (pos === 'inside') {
      for (const id of ids) st.moveNode(id, targetId, childrenOf(useS3D.getState().doc, targetId).length)
    } else {
      // Display order is reversed: "before" (above) means a higher child index.
      for (const id of ids) {
        const d = useS3D.getState().doc
        const siblings = childrenOf(d, target.parentId).filter((c) => c !== id)
        const idx = siblings.indexOf(targetId)
        st.moveNode(id, target.parentId, pos === 'before' ? idx + 1 : idx)
      }
    }
    st.set({ selection: ids })
    setDragIds([])
  }

  let body: ReactNode
  if (!rows.length)
    body = (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        {query ? 'No layers match.' : 'No layers yet. Pick a tool below and draw on the canvas.'}
      </p>
    )
  else
    body = rows.map((row) => (
      <LayerRow
        key={row.node.id}
        row={row}
        selected={selection.includes(row.node.id)}
        ancestorSelected={ancestorSet.has(row.node.id)}
        onDragStart={(id) => setDragIds(selection.includes(id) ? selection : [id])}
        onDrop={onDrop}
        dropHint={dropHint}
        setDropHint={setDropHint}
        onClick={onClick}
      />
    ))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PagesSection />
      <div className="flex items-center gap-1 px-2 py-1.5">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search layers" className="h-7 pl-6 text-xs" />
          {query && (
            <button className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={() => setQuery('')} aria-label="Clear search">
              <XIcon className="size-3" />
            </button>
          )}
        </div>
      </div>
      {selection.length > 1 && <div className="px-3 pb-1 text-[10px] text-muted-foreground">{selection.length} layers selected</div>}
      <CommandContextMenu items={() => NODE_MENU} render={<div className="min-h-0 flex-1" />}>
        <ScrollArea className="h-full">
          <div
            className="pb-4"
            onDragEnd={() => {
              setDropHint(null)
              setDragIds([])
            }}
          >
            {body}
          </div>
        </ScrollArea>
      </CommandContextMenu>
    </div>
  )
}
