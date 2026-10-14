import { NodeViewWrapper } from '@tiptap/react'
import { type ReactNode, type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/** Standard frame for atom blocks: selection ring + drag support. */
export function BlockFrame({ selected, className, children }: { selected: boolean; className?: string; children: ReactNode }) {
  return (
    <NodeViewWrapper
      className={cn('snote-block my-1 rounded-md', selected && 'ring-2 ring-blue-400/60', className)}
      data-drag-handle=""
      contentEditable={false}
    >
      {children}
    </NodeViewWrapper>
  )
}

/** Empty-state placeholder shown before a block is configured. */
export function BlockPlaceholder({ icon, label, children }: { icon: ReactNode; label: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function UrlForm({
  placeholder,
  onSubmit,
  button = 'Embed',
}: {
  placeholder: string
  onSubmit: (url: string) => void
  button?: string
}) {
  return (
    <form
      className="flex min-w-60 flex-1 gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const value = new FormData(event.currentTarget).get('url')?.toString().trim()
        if (value) onSubmit(value)
      }}
    >
      <input
        name="url"
        placeholder={placeholder}
        className="h-8 flex-1 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
      />
      <button type="submit" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
        {button}
      </button>
    </form>
  )
}

/**
 * Centers its content at `width` percent of the block, with a drag handle on each side (like Notion's media blocks).
 * The block grows from both edges, so a drag moves the edge by the pointer delta and the width by twice that.
 */
export function Resizable({
  width,
  onResize,
  min = 20,
  className,
  children,
}: {
  width: number
  onResize: (width: number) => void
  min?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? width

  const start = (side: 1 | -1) => (event: ReactPointerEvent) => {
    const box = ref.current
    const parent = box?.parentElement
    if (!box || !parent) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startPx = box.getBoundingClientRect().width
    const total = parent.getBoundingClientRect().width
    let next = shown
    const move = (e: PointerEvent) => {
      next = Math.round(Math.min(100, Math.max(min, ((startPx + (e.clientX - startX) * side * 2) / total) * 100)))
      setDraft(next)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      setDraft(null)
      if (next !== width) onResize(next)
    }
    document.body.style.cursor = 'ew-resize'
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  const handle = (side: 1 | -1) => (
    <div
      onPointerDown={start(side)}
      className={cn(
        'absolute inset-y-0 z-20 flex w-4 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover/resize:opacity-100',
        draft !== null && 'opacity-100',
        side === -1 ? 'left-0' : 'right-0',
      )}
    >
      <div className="h-12 max-h-1/2 w-1.5 rounded-full border border-background/70 bg-foreground/60 shadow" />
    </div>
  )

  return (
    <div ref={ref} className={cn('group/resize relative mx-auto', className)} style={{ width: `${shown}%` }}>
      {children}
      {handle(-1)}
      {handle(1)}
      {/* Iframes swallow pointer events mid-drag; this shield keeps the drag alive over them. */}
      {draft !== null && <div className="absolute inset-0 z-10" />}
    </div>
  )
}
