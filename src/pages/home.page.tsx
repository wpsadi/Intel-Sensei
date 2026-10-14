import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { DollarSignIcon, DraftingCompassIcon, NotebookPenIcon, PenToolIcon, Settings2Icon } from 'lucide-react'
import { type ComponentType, useEffect, useRef, useState } from 'react'
import { BsBrowserChrome } from 'react-icons/bs'
import { Link } from 'react-router-dom'

import senseiLogo from '@/assets/sensei.svg'
import { Skeleton } from '@/components/ui/skeleton'

type AppEntry = { id: string; name: string; href: string; icon: ComponentType<{ className?: string }> }

function SenseiLogo({ className }: { className?: string }) {
  return <img src={senseiLogo} alt="" draggable={false} className={`${className ?? ''} object-contain brightness-0 dark:invert`} />
}

const STORAGE_KEY = 'sensei:home-grid-5x4'
const COLUMNS = 5
const ROWS = 4
const SLOT_COUNT = COLUMNS * ROWS

const apps: AppEntry[] = [
  { id: 'ask-sensei', name: 'Ask Sensei', href: '/ask-sensei', icon: SenseiLogo },
  { id: 's-note', name: 'SNote', href: '/s-note', icon: NotebookPenIcon },
  { id: 's-design', name: 'S-Design', href: '/s-design', icon: PenToolIcon },
  { id: 's-3d', name: 'S3D', href: '/s-3d', icon: DraftingCompassIcon },
  { id: 's-browse', name: 'SBrowse', href: '/s-browse', icon: BsBrowserChrome },
  { id: 'ai-usage', name: 'AI usage', href: '/ai-usage', icon: DollarSignIcon },
  { id: 'settings', name: 'Settings', href: '?settings=open', icon: Settings2Icon },
]
const appById = new Map(apps.map((app) => [app.id, app]))

function loadSlots(): (string | null)[] {
  const slots: (string | null)[] = Array(SLOT_COUNT).fill(null)
  const placed = new Set<string>()
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(saved)) {
      saved.slice(0, SLOT_COUNT).forEach((id, i) => {
        if (typeof id === 'string' && appById.has(id) && !placed.has(id)) {
          slots[i] = id
          placed.add(id)
        }
      })
    }
  } catch {
    // unreadable storage: fall back to default placement
  }
  for (const app of apps) {
    if (placed.has(app.id)) continue
    const free = [...slots.keys()].filter((i) => slots[i] === null)
    // first run: drop each app in a random free slot; later additions fill randomly too
    const pick = free[Math.floor(Math.random() * free.length)]
    if (pick !== undefined) slots[pick] = app.id
  }
  return slots
}

function AppLabel({ app }: { app: AppEntry }) {
  const Icon = app.icon
  return (
    <div className="flex flex-col items-center gap-1.5 text-foreground">
      <Icon className="size-6 sm:size-8" />
      <span className="w-full truncate text-center text-[10px] font-medium sm:text-xs">{app.name}</span>
    </div>
  )
}

function DraggableApp({ app, suppressClick }: { app: AppEntry; suppressClick: React.RefObject<boolean> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id })
  return (
    <Link
      ref={setNodeRef}
      to={app.href}
      draggable={false}
      onClick={(event) => {
        if (suppressClick.current) event.preventDefault()
      }}
      className={`block w-full touch-manipulation rounded-xl p-2 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring ${isDragging ? 'opacity-30' : 'hover:bg-foreground/5'}`}
      {...attributes}
      {...listeners}
    >
      <AppLabel app={app} />
    </Link>
  )
}

function Slot({
  index,
  app,
  dragging,
  suppressClick,
}: {
  index: number
  app: AppEntry | null
  dragging: boolean
  suppressClick: React.RefObject<boolean>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}` })
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 min-w-0 items-center justify-center rounded-xl border border-dashed transition-colors ${isOver ? 'border-foreground/60 bg-foreground/15' : dragging ? 'border-foreground/25 bg-foreground/5' : 'border-transparent'}`}
    >
      {app ? (
        <DraggableApp app={app} suppressClick={suppressClick} />
      ) : (
        // An empty position shows a placeholder, like an icon that has not loaded yet.
        <div className="flex flex-col items-center gap-1.5 p-2" aria-hidden>
          <Skeleton className="size-6 rounded-md sm:size-8" />
          <Skeleton className="h-2.5 w-10 rounded sm:h-3 sm:w-12" />
        </div>
      )}
    </div>
  )
}

function HomePage() {
  const [slots, setSlots] = useState<(string | null)[]>(loadSlots)
  const [activeId, setActiveId] = useState<string | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slots))
    } catch {
      // storage unavailable; layout just won't persist
    }
  }, [slots])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    suppressClick.current = true
    setActiveId(String(active.id))
  }

  const finish = () => {
    setActiveId(null)
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    finish()
    if (!over) return
    const target = Number(String(over.id).replace('slot-', ''))
    setSlots((current) => {
      const from = current.indexOf(String(active.id))
      if (from < 0 || Number.isNaN(target) || from === target) return current
      const next = [...current]
      next[from] = current[target]
      next[target] = current[from]
      return next
    })
  }

  const activeApp = activeId ? appById.get(activeId) : undefined

  return (
    <div className="flex min-h-svh w-full items-center justify-center overflow-x-hidden bg-background p-4 sm:p-8">
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={finish}>
        <div className="grid w-full max-w-md grid-cols-5 auto-rows-[4.5rem] gap-1 sm:max-w-lg sm:auto-rows-[5.5rem] sm:gap-2">
          {slots.map((id, index) => (
            <Slot
              key={index}
              index={index}
              app={id ? (appById.get(id) ?? null) : null}
              dragging={activeId !== null}
              suppressClick={suppressClick}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 150 }}>
          {activeApp ? (
            <div className="rounded-xl bg-foreground/10 p-2">
              <AppLabel app={activeApp} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

export default HomePage
