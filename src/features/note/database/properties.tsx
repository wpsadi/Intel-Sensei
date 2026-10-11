import { CheckIcon, PlusIcon, XIcon } from 'lucide-react'
import type { Database, DateValue, Page, PropertyDef, PropertyType, PropertyValue, SelectOption } from '../db/types'
import { useNoteStore } from '../note.store'
import { cn } from '@/lib/utils'
import { formatDate } from '../editor/nodes/inline'
import { usePeople } from '../db/hooks'
import { useState } from 'react'

export const PROPERTY_TYPES: { type: PropertyType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Select' },
  { type: 'multi_select', label: 'Multi-select' },
  { type: 'status', label: 'Status' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'url', label: 'URL' },
  { type: 'person', label: 'Person' },
  { type: 'place', label: 'Place (lat, lng)' },
  { type: 'created_time', label: 'Created time' },
]

export const OPTION_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

/* -------------------------------- value access ----------------------------- */

export function readValue(row: Page, prop: PropertyDef): PropertyValue {
  if (prop.type === 'title') return row.title
  if (prop.type === 'created_time') return new Date(row.createdAt).toISOString()
  return row.properties[prop.id] ?? null
}

export async function writeValue(row: Page, prop: PropertyDef, value: PropertyValue) {
  const store = useNoteStore.getState()
  if (prop.type === 'title') return store.updatePage(row.id, { title: String(value ?? '') })
  if (prop.type === 'created_time') return
  return store.setPageProperty(row.id, prop.id, value)
}

export const dateStart = (value: PropertyValue) => (value && typeof value === 'object' && 'start' in value ? value.start : '')

/** A sortable / groupable plain representation of any value. */
export function valueText(prop: PropertyDef, value: PropertyValue): string {
  if (value === null || value === undefined) return ''
  if (prop.type === 'select' || prop.type === 'status') return prop.options?.find((o) => o.id === value)?.name ?? ''
  if (prop.type === 'multi_select') return (value as string[]).map((id) => prop.options?.find((o) => o.id === id)?.name).filter(Boolean).join(', ')
  if (prop.type === 'date') return dateStart(value)
  if (prop.type === 'checkbox') return value ? 'Checked' : 'Unchecked'
  return String(value)
}

export const parsePlace = (value: PropertyValue): [number, number] | null => {
  const match = String(value ?? '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  return match ? [Number(match[1]), Number(match[2])] : null
}

/* ---------------------------------- display -------------------------------- */

export function OptionTag({ option, onRemove }: { option: SelectOption; onRemove?: () => void }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 text-[13px] leading-5', `snote-tag-${option.color}`)}>
      {option.name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100">
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  )
}

/** Read-only rendering used by boards, galleries, lists and calendars. */
export function PropertyDisplay({ prop, row }: { prop: PropertyDef; row: Page }) {
  const value = readValue(row, prop)
  const people = usePeople()
  if (value === null || value === '' || (Array.isArray(value) && !value.length)) return null
  switch (prop.type) {
    case 'select':
    case 'status': {
      const option = prop.options?.find((o) => o.id === value)
      return option ? <OptionTag option={option} /> : null
    }
    case 'multi_select':
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((id) => {
            const option = prop.options?.find((o) => o.id === id)
            return option && <OptionTag key={id} option={option} />
          })}
        </span>
      )
    case 'checkbox':
      return value ? <CheckIcon className="size-4" /> : null
    case 'date': {
      const date = value as DateValue
      return <span>{formatDate(date.start)}{date.end ? ` → ${formatDate(date.end)}` : ''}</span>
    }
    case 'created_time':
      return <span>{formatDate(String(value), true)}</span>
    case 'person':
      return <span>{people?.find((p) => p.id === value)?.name}</span>
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="underline" onClick={(event) => event.stopPropagation()}>
          {String(value)}
        </a>
      )
    default:
      return <span>{String(value)}</span>
  }
}

/* ----------------------------------- editing ------------------------------- */

function OptionPicker({ database, prop, selected, multi, onChange }: {
  database: Database
  prop: PropertyDef
  selected: string[]
  multi: boolean
  onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const updateDatabase = useNoteStore((s) => s.updateDatabase)
  const options = prop.options ?? []
  const filtered = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
  const exact = options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase())

  const toggle = (id: string) => {
    if (multi) onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
    else onChange(selected[0] === id ? [] : [id])
  }

  const create = async () => {
    const option: SelectOption = { id: crypto.randomUUID(), name: query.trim(), color: OPTION_COLORS[options.length % OPTION_COLORS.length] }
    await updateDatabase(database.id, {
      properties: database.properties.map((p) => (p.id === prop.id ? { ...p, options: [...options, option] } : p)),
    })
    setQuery('')
    toggle(option.id)
  }

  return (
    <div className="w-60 p-1">
      <div className="mb-1 flex flex-wrap gap-1 rounded border bg-muted/40 p-1">
        {selected.map((id) => {
          const option = options.find((o) => o.id === id)
          return option && <OptionTag key={id} option={option} onRemove={() => toggle(id)} />
        })}
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && query.trim() && !exact && create()}
          placeholder="Search or create…"
          className="min-w-16 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {filtered.map((option) => (
        <button key={option.id} type="button" onClick={() => toggle(option.id)} className="flex w-full items-center justify-between rounded px-2 py-1 hover:bg-muted">
          <OptionTag option={option} />
          {selected.includes(option.id) && <CheckIcon className="size-3.5" />}
        </button>
      ))}
      {query.trim() && !exact && (
        <button type="button" onClick={create} className="flex w-full items-center gap-1 rounded px-2 py-1 text-sm hover:bg-muted">
          <PlusIcon className="size-3.5" /> Create <OptionTag option={{ id: '', name: query.trim(), color: 'gray' }} />
        </button>
      )}
    </div>
  )
}

/** Click-to-edit cell. Used by table rows, the row page header and forms. */
export function PropertyEditor({ database, prop, row, onDraft }: {
  database: Database
  prop: PropertyDef
  row: Page
  /** When set, edits are reported instead of persisted (forms). */
  onDraft?: (value: PropertyValue) => void
}) {
  const [open, setOpen] = useState(false)
  const value = readValue(row, prop)
  const people = usePeople()
  const createPerson = useNoteStore((s) => s.createPerson)
  const commit = (next: PropertyValue) => (onDraft ? onDraft(next) : writeValue(row, prop, next))
  const inputClass = 'h-7 w-full rounded bg-transparent px-1.5 text-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring/40'

  switch (prop.type) {
    case 'title':
    case 'text':
    case 'url':
    case 'place':
      return (
        <input
          defaultValue={String(value ?? '')}
          key={row.updatedAt}
          onBlur={(event) => event.target.value !== String(value ?? '') && commit(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          placeholder={prop.type === 'place' ? '48.8584, 2.2945' : 'Empty'}
          className={cn(inputClass, prop.type === 'title' && 'font-medium')}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          defaultValue={value === null ? '' : String(value)}
          key={row.updatedAt}
          onBlur={(event) => commit(event.target.value === '' ? null : Number(event.target.value))}
          placeholder="Empty"
          className={inputClass}
        />
      )
    case 'checkbox':
      return <input type="checkbox" checked={Boolean(value)} onChange={(event) => commit(event.target.checked)} className="m-1.5 size-4 accent-blue-500" />
    case 'date': {
      const date = (value as DateValue | null) ?? { start: '' }
      return (
        <div className="flex items-center gap-1">
          <input type="date" value={date.start} onChange={(event) => commit(event.target.value ? { ...date, start: event.target.value } : null)} className={inputClass} />
          {date.start && (
            <input type="date" value={date.end ?? ''} title="End date" onChange={(event) => commit({ ...date, end: event.target.value || undefined })} className={cn(inputClass, 'text-muted-foreground')} />
          )}
        </div>
      )
    }
    case 'person':
      return (
        <select
          value={String(value ?? '')}
          onChange={async (event) => {
            if (event.target.value === '__new') {
              const name = window.prompt('Person name')
              if (name) commit((await createPerson(name)).id)
            } else commit(event.target.value || null)
          }}
          className={inputClass}
        >
          <option value="">Empty</option>
          {people?.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
          <option value="__new">+ Add person…</option>
        </select>
      )
    case 'created_time':
      return <span className="px-1.5 text-sm text-muted-foreground">{formatDate(String(value), true)}</span>
    case 'select':
    case 'status':
    case 'multi_select': {
      const selected = prop.type === 'multi_select' ? ((value as string[]) ?? []) : value ? [String(value)] : []
      return (
        <div className="relative">
          <button type="button" onClick={() => setOpen(!open)} className="flex min-h-7 w-full flex-wrap items-center gap-1 rounded px-1.5 text-left hover:bg-muted/60">
            {selected.length ? <PropertyDisplay prop={prop} row={{ ...row, properties: { ...row.properties, [prop.id]: value } }} /> : <span className="text-sm text-muted-foreground">Empty</span>}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute top-full left-0 z-50 mt-1 rounded-md border bg-popover shadow-lg">
                <OptionPicker
                  database={database}
                  prop={prop}
                  selected={selected}
                  multi={prop.type === 'multi_select'}
                  onChange={(ids) => {
                    commit(prop.type === 'multi_select' ? ids : (ids[0] ?? null))
                    if (prop.type !== 'multi_select') setOpen(false)
                  }}
                />
              </div>
            </>
          )}
        </div>
      )
    }
  }
}
