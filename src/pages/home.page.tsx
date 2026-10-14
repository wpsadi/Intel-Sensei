import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DollarSignIcon,
  DraftingCompassIcon,
  NotebookPenIcon,
  PenToolIcon,
  Settings2Icon,
  SparklesIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { BsBrowserChrome } from 'react-icons/bs'
import { Link } from 'react-router-dom'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

type AppIcon = ComponentType<{ className?: string }>
type AppEntry = { id: string; name: string; description: string; href: string; icon: AppIcon; tone: string }

const STORAGE_KEY = 'sensei:home-app-order'
const PAGE_SIZE = 6
const EDGE_ZONE = 64
const EDGE_DELAY = 600

const apps: AppEntry[] = [
  {
    id: 'ask-sensei',
    name: 'Ask Sensei',
    description: 'Think, research, and make progress with your AI copilot.',
    href: '/ask-sensei',
    icon: SparklesIcon,
    tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  },
  {
    id: 's-note',
    name: 'SNote',
    description: 'Capture ideas, write clearly, and keep everything organized.',
    href: '/s-note',
    icon: NotebookPenIcon,
    tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
  {
    id: 's-design',
    name: 'S-Design',
    description: 'Shape ideas visually on an infinite, flexible canvas.',
    href: '/s-design',
    icon: PenToolIcon,
    tone: 'bg-pink-500/10 text-pink-600 dark:text-pink-300',
  },
  {
    id: 's-3d',
    name: 'S3D',
    description: 'Build, edit, and explore 3D scenes in your workspace.',
    href: '/s-3d',
    icon: DraftingCompassIcon,
    tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
  },
  {
    id: 's-browse',
    name: 'SBrowse',
    description: 'Browse the web and get things done from one focused workspace.',
    href: '/s-browse',
    icon: BsBrowserChrome,
    tone: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  },
  {
    id: 'ai-usage',
    name: 'AI usage',
    description: 'See model calls, token usage, and estimated spend.',
    href: '/ai-usage',
    icon: DollarSignIcon,
    tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Configure models, connections, and your workspace.',
    href: '?settings=open',
    icon: Settings2Icon,
    tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  },
]

const appById = new Map(apps.map((app) => [app.id, app]))
const defaultOrder = apps.map((app) => app.id)

function loadOrder(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(saved)) {
      const known = saved.filter((id): id is string => typeof id === 'string' && appById.has(id))
      const unique = [...new Set(known)]
      return [...unique, ...defaultOrder.filter((id) => !unique.includes(id))]
    }
  } catch {
    // ignore unreadable storage
  }
  return defaultOrder
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

function pointerX(event: Event): number | null {
  if ('clientX' in event) return (event as PointerEvent).clientX
  const touch = (event as TouchEvent).touches?.[0] ?? (event as TouchEvent).changedTouches?.[0]
  return touch ? touch.clientX : null
}

function AppTile({ app, overlay = false }: { app: AppEntry; overlay?: boolean }) {
  const Icon = app.icon
  return (
    <div
      className={`flex h-full min-h-44 flex-col justify-between rounded-2xl border bg-background/85 p-5 shadow-sm ${overlay ? 'scale-105 shadow-2xl ring-2 ring-primary/30' : ''}`}
    >
      <span className={`flex size-12 items-center justify-center rounded-2xl ${app.tone}`}>
        <Icon className="size-6" />
      </span>
      <div className="mt-6">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{app.name}</h2>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{app.description}</p>
      </div>
    </div>
  )
}

function SortableApp({ app, suppressClick }: { app: AppEntry; suppressClick: React.RefObject<boolean> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id })
  return (
    <Link
      ref={setNodeRef}
      to={app.href}
      draggable={false}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={(event) => {
        if (suppressClick.current) event.preventDefault()
      }}
      className={`touch-manipulation rounded-2xl outline-none select-none focus-visible:ring-2 focus-visible:ring-ring ${isDragging ? 'opacity-30' : 'transition-shadow hover:shadow-lg'}`}
      {...attributes}
      {...listeners}
    >
      <AppTile app={app} />
    </Link>
  )
}

function HomePage() {
  const [order, setOrder] = useState<string[]>(loadOrder)
  const [page, setPage] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const pagerRef = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)
  const edgeTimer = useRef<number | null>(null)
  const edgeSide = useRef<-1 | 0 | 1>(0)
  const wheelLock = useRef(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const pages = useMemo(() => chunk(order, PAGE_SIZE), [order])
  const pageCount = pages.length
  const currentPage = Math.min(page, pageCount - 1)
  const currentIds = useRef<string[]>([])
  currentIds.current = pages[currentPage] ?? []

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
    } catch {
      // storage unavailable; layout just won't persist
    }
  }, [order])

  const goTo = useCallback((next: number) => setPage(Math.max(0, Math.min(next, pageCount - 1))), [pageCount])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activeId || event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return
      if (event.key === 'ArrowRight') goTo(currentPage + 1)
      else if (event.key === 'ArrowLeft') goTo(currentPage - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, currentPage, goTo])

  useEffect(() => {
    const el = pagerRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0
      if (Math.abs(delta) < 20 || Date.now() < wheelLock.current) return
      event.preventDefault()
      wheelLock.current = Date.now() + 450
      goTo(currentPage + (delta > 0 ? 1 : -1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [currentPage, goTo])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const collisionDetection: CollisionDetection = useCallback(
    (args) =>
      closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => currentIds.current.includes(String(container.id))),
      }),
    [],
  )

  const clearEdge = () => {
    if (edgeTimer.current !== null) window.clearTimeout(edgeTimer.current)
    edgeTimer.current = null
    edgeSide.current = 0
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    suppressClick.current = true
    setActiveId(String(active.id))
  }

  const onDragMove = ({ activatorEvent, delta }: DragMoveEvent) => {
    const rect = pagerRef.current?.getBoundingClientRect()
    const startX = pointerX(activatorEvent)
    if (!rect || startX === null) return
    const x = startX + delta.x
    const side = x < rect.left + EDGE_ZONE ? -1 : x > rect.right - EDGE_ZONE ? 1 : 0
    if (side === edgeSide.current) return
    clearEdge()
    edgeSide.current = side
    if (side === 0) return
    const step = () => {
      setPage((p) => Math.max(0, Math.min(p + side, pageCount - 1)))
      edgeTimer.current = window.setTimeout(step, EDGE_DELAY + 200)
    }
    edgeTimer.current = window.setTimeout(step, EDGE_DELAY)
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || active.id === over.id) return
    setOrder((items) => {
      const from = items.indexOf(String(active.id))
      const to = items.indexOf(String(over.id))
      return from < 0 || to < 0 ? items : arrayMove(items, from, to)
    })
  }

  const onDragEnd = (_event: DragEndEvent) => {
    clearEdge()
    setActiveId(null)
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const activeApp = activeId ? appById.get(activeId) : undefined
  const isDefault = order.every((id, i) => id === defaultOrder[i])

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-muted/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(0.78_0.12_280_/_0.14),transparent_34%),radial-gradient(circle_at_bottom_left,oklch(0.78_0.1_190_/_0.1),transparent_36%)]" />
      <header className="relative flex h-16 items-center justify-between border-b bg-background/70 px-6 backdrop-blur sm:px-10">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Sensei home">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <SparklesIcon className="size-4" />
          </span>
          <span>Sensei</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10 sm:px-10 sm:py-14">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">Your workspace</p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">What would you like to work on?</h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">Tap an app to open it. Drag (or long-press on touch) to rearrange.</p>
          </div>
          {!isDefault && (
            <Button variant="ghost" size="sm" onClick={() => setOrder(defaultOrder)}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset layout
            </Button>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragEnd}
        >
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div
              ref={pagerRef}
              className="relative -mx-2 overflow-hidden px-2 py-2"
              onTouchStart={(event) => {
                const t = event.touches[0]
                touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
              }}
              onTouchEnd={(event) => {
                const start = touchStart.current
                const t = event.changedTouches[0]
                touchStart.current = null
                if (!start || !t || activeId) return
                const dx = t.clientX - start.x
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.5) goTo(currentPage + (dx < 0 ? 1 : -1))
              }}
            >
              <motion.div
                className="flex"
                animate={{ x: `-${currentPage * 100}%` }}
                transition={{ type: 'spring', stiffness: 320, damping: 36 }}
              >
                {pages.map((ids, index) => (
                  <div
                    key={index}
                    aria-hidden={index !== currentPage}
                    className="grid w-full shrink-0 grid-cols-2 content-start gap-4 sm:grid-cols-3"
                  >
                    {ids.map((id) => (
                      <SortableApp key={id} app={appById.get(id)!} suppressClick={suppressClick} />
                    ))}
                  </div>
                ))}
              </motion.div>
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 180 }}>{activeApp ? <AppTile app={activeApp} overlay /> : null}</DragOverlay>
        </DndContext>

        {pageCount > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={currentPage === 0} onClick={() => goTo(currentPage - 1)}>
              <ChevronLeftIcon />
            </Button>
            <div className="flex items-center gap-2" role="tablist" aria-label="App pages">
              {pages.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-selected={index === currentPage}
                  aria-label={`Page ${index + 1}`}
                  onClick={() => goTo(index)}
                  className={`h-2 rounded-full transition-all ${index === currentPage ? 'w-6 bg-foreground' : 'w-2 bg-foreground/25 hover:bg-foreground/50'}`}
                />
              ))}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={currentPage === pageCount - 1} onClick={() => goTo(currentPage + 1)}>
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

export default HomePage
