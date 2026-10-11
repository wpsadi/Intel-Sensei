import { CalendarIcon, CheckSquareIcon, CircleIcon, ClockIcon, HashIcon, LinkIcon, ListIcon, LoaderIcon, MapPinIcon, PlusIcon, TextIcon, Trash2Icon, UsersIcon, type LucideIcon } from 'lucide-react'
import type { Database, PropertyDef, PropertyType } from '../db/types'
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { OPTION_COLORS, PROPERTY_TYPES } from './properties'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useNoteStore } from '../note.store'

const NEEDS_OPTIONS: PropertyType[] = ['select', 'multi_select', 'status']

const TYPE_ICONS: Partial<Record<PropertyType, LucideIcon>> = {
  text: TextIcon,
  number: HashIcon,
  select: CircleIcon,
  multi_select: ListIcon,
  status: LoaderIcon,
  date: CalendarIcon,
  checkbox: CheckSquareIcon,
  url: LinkIcon,
  person: UsersIcon,
  place: MapPinIcon,
  created_time: ClockIcon,
}

/** Notion-style grid of property types, each with its icon. */
function TypeGrid({ current, onPick }: { current?: PropertyType; onPick: (type: PropertyType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-0.5">
      {PROPERTY_TYPES.map(({ type, label }) => {
        const Icon = TYPE_ICONS[type] ?? TextIcon
        return (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            className={cn('flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted', current === type && 'bg-muted font-medium')}
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Menu under a column header. It is portaled to <body> with fixed positioning because the table's
 * overflow wrapper clips anything absolutely positioned inside it, which hid these menus.
 */
function HeaderPopup({ anchor, children }: { anchor: RefObject<HTMLElement | null>; children: ReactNode }) {
  const [box, setBox] = useState<{ top: number; left: number }>()

  useLayoutEffect(() => {
    // Re-measured on scroll so the menu follows its header in any scrolling ancestor.
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (rect) setBox({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 264)) })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchor])

  if (!box) return null
  return createPortal(
    <div style={box} className="fixed z-50 flex w-64 flex-col gap-2 rounded-md border bg-popover p-2 text-sm text-popover-foreground shadow-lg">
      {children}
    </div>,
    document.body,
  )
}

/** Column header with rename / retype / delete; without `prop` it renders the "add property" button. */
export function PropertyHeader({ database, prop }: { database: Database; prop?: PropertyDef }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const anchor = useRef<HTMLDivElement>(null)
  const updateDatabase = useNoteStore((s) => s.updateDatabase)

  const save = (properties: PropertyDef[]) => updateDatabase(database.id, { properties })

  const newOptions = (type: PropertyType) =>
    NEEDS_OPTIONS.includes(type) ? [{ id: crypto.randomUUID(), name: 'Option 1', color: OPTION_COLORS[5] }] : undefined

  // Creates a property. Without a typed name the type's label is used, e.g. "Number".
  const add = (type: PropertyType) => {
    const label = PROPERTY_TYPES.find((t) => t.type === type)?.label ?? 'Text'
    save([...database.properties, { id: crypto.randomUUID(), name: name.trim() || label, type, options: newOptions(type) }])
    setName('')
    setOpen(false)
  }

  const patch = (changes: Partial<PropertyDef>) =>
    prop && save(database.properties.map((p) => (p.id === prop.id ? { ...p, ...changes } : p)))

  const changeType = (type: PropertyType) => {
    if (!prop || prop.type === type) return
    patch({ type, options: NEEDS_OPTIONS.includes(type) ? (prop.options ?? newOptions(type)) : undefined })
  }

  if (!prop) {
    return (
      <div ref={anchor} className="relative">
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center p-1.5 text-muted-foreground hover:bg-muted" title="Add property">
          <PlusIcon className="size-4" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <HeaderPopup anchor={anchor}>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && add('text')}
                placeholder="Property name"
                className="h-8 rounded border bg-background px-2 outline-none"
              />
              <div className="px-1 text-xs font-medium text-muted-foreground">Select type</div>
              <TypeGrid onPick={add} />
            </HeaderPopup>
          </>
        )}
      </div>
    )
  }

  return (
    <div ref={anchor} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-full truncate px-2 py-1.5 text-left hover:bg-muted/60">
        {prop.name}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <HeaderPopup anchor={anchor}>
            <input
              autoFocus
              defaultValue={prop.name}
              onBlur={(event) => patch({ name: event.target.value.trim() || prop.name })}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
              className="h-8 rounded border bg-background px-2 outline-none"
            />
            {prop.type !== 'title' && (
              <>
                <div className="px-1 text-xs font-medium text-muted-foreground">Change type</div>
                <TypeGrid current={prop.type} onPick={changeType} />
                <button
                  type="button"
                  onClick={() => save(database.properties.filter((p) => p.id !== prop.id))}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-red-500 hover:bg-muted"
                >
                  <Trash2Icon className="size-4" /> Delete property
                </button>
              </>
            )}
          </HeaderPopup>
        </>
      )}
    </div>
  )
}
