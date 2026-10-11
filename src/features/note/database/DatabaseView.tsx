import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowUpDownIcon, FilterIcon, LinkIcon, PlusIcon, Settings2Icon, Trash2Icon } from 'lucide-react'
import { BoardView, FeedView, FormView, GalleryView, ListView, TableView } from './views/basic'
import { CalendarView, TimelineView } from './views/time'
import { ChartView, DashboardView, MapView } from './views/visual'
import type { Database, Page, PropertyValue, View, ViewFilter, ViewType } from '../db/types'
import { type ReactNode, useState } from 'react'
import { VIEW_LABELS } from '../db/repo'
import { useNoteStore } from '../note.store'
import { readValue, valueText } from './properties'
import { useDatabase, useRows, useViews } from '../db/hooks'
import type { ViewProps } from './views/types'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

/* ---------------------------- filtering & sorting --------------------------- */

function passes(row: Page, database: Database, filter: ViewFilter) {
  const prop = database.properties.find((p) => p.id === filter.propertyId)
  if (!prop) return true
  const value = readValue(row, prop)
  const text = valueText(prop, value).toLowerCase()
  switch (filter.op) {
    case 'contains':
      return text.includes((filter.value ?? '').toLowerCase())
    case 'equals':
      return text === (filter.value ?? '').toLowerCase()
    case 'empty':
      return !text
    case 'not_empty':
      return Boolean(text)
    case 'checked':
      return value === true
    case 'unchecked':
      return value !== true
  }
}

export function applyView(rows: Page[], database: Database, view: View) {
  const filtered = rows.filter((row) => (view.filters ?? []).every((f) => passes(row, database, f)))
  const sorts = view.sorts ?? []
  if (!sorts.length) return filtered
  return [...filtered].sort((a, b) => {
    for (const sort of sorts) {
      const prop = database.properties.find((p) => p.id === sort.propertyId)
      if (!prop) continue
      const av = readValue(a, prop)
      const bv = readValue(b, prop)
      const result =
        typeof av === 'number' && typeof bv === 'number' ? av - bv : valueText(prop, av).localeCompare(valueText(prop, bv), undefined, { numeric: true })
      if (result) return sort.direction === 'asc' ? result : -result
    }
    return 0
  })
}

/* -------------------------------- view switch ------------------------------- */

function renderView(props: ViewProps, renderOther: (view: View) => ReactNode) {
  switch (props.view.type) {
    case 'table':
      return <TableView {...props} />
    case 'board':
      return <BoardView {...props} />
    case 'gallery':
      return <GalleryView {...props} />
    case 'list':
      return <ListView {...props} />
    case 'feed':
      return <FeedView {...props} />
    case 'calendar':
      return <CalendarView {...props} />
    case 'timeline':
      return <TimelineView {...props} />
    case 'map':
      return <MapView {...props} />
    case 'form':
      return <FormView {...props} />
    case 'dashboard':
      return <DashboardView {...props} renderView={renderOther} />
    default:
      return <ChartView {...props} />
  }
}

/* ------------------------------- settings panel ----------------------------- */

const FILTER_OPS: { op: ViewFilter['op']; label: string }[] = [
  { op: 'contains', label: 'contains' },
  { op: 'equals', label: 'is' },
  { op: 'not_empty', label: 'is not empty' },
  { op: 'empty', label: 'is empty' },
  { op: 'checked', label: 'is checked' },
  { op: 'unchecked', label: 'is unchecked' },
]

const selectClass = 'h-7 rounded border bg-background px-1 text-sm'

function ViewSettings({ database, view, onClose }: { database: Database; view: View; onClose: () => void }) {
  const updateView = useNoteStore((s) => s.updateView)
  const removeView = useNoteStore((s) => s.removeView)
  const update = (patch: Partial<View>) => updateView(view.id, patch)
  const props = database.properties
  const optionProps = props.filter((p) => ['select', 'multi_select', 'status', 'checkbox', 'person', 'text'].includes(p.type))
  const isChart = ['bar_vertical', 'bar_horizontal', 'line', 'donut', 'number'].includes(view.type)

  const field = (label: string, control: ReactNode) => (
    <label className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {control}
    </label>
  )

  const propSelect = (value: string | undefined, onChange: (id: string) => void, list = props) => (
    <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={selectClass}>
      <option value="">Default</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full right-0 z-50 mt-1 flex w-80 flex-col gap-2 rounded-md border bg-popover p-3 text-sm shadow-lg">
        {field('Name', <input defaultValue={view.name} onBlur={(event) => update({ name: event.target.value })} className={cn(selectClass, 'w-40 px-2')} />)}
        {field(
          'Layout',
          <select value={view.type} onChange={(event) => update({ type: event.target.value as ViewType })} className={selectClass}>
            {Object.entries(VIEW_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>,
        )}
        {(view.type === 'board' || isChart) && field(isChart ? 'X axis / group' : 'Group by', propSelect(view.groupBy, (id) => update({ groupBy: id || undefined }), optionProps))}
        {isChart &&
          field(
            'Value',
            propSelect(view.valueProperty, (id) => update({ valueProperty: id || undefined }), props.filter((p) => p.type === 'number')),
          )}
        {isChart &&
          view.valueProperty &&
          field(
            'Aggregate',
            <select value={view.aggregate ?? 'sum'} onChange={(event) => update({ aggregate: event.target.value as View['aggregate'] })} className={selectClass}>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
            </select>,
          )}
        {(view.type === 'calendar' || view.type === 'timeline') &&
          field('Date property', propSelect(view.dateProperty, (id) => update({ dateProperty: id || undefined }), props.filter((p) => p.type === 'date')))}
        {view.type === 'map' &&
          field('Place property', propSelect(view.placeProperty, (id) => update({ placeProperty: id || undefined }), props.filter((p) => p.type === 'place' || p.type === 'text')))}

        <div className="mt-1 border-t pt-2 text-xs font-medium text-muted-foreground">Visible properties</div>
        {props
          .filter((p) => p.type !== 'title')
          .map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!view.hiddenProperties?.includes(p.id)}
                onChange={(event) =>
                  update({
                    hiddenProperties: event.target.checked
                      ? (view.hiddenProperties ?? []).filter((id) => id !== p.id)
                      : [...(view.hiddenProperties ?? []), p.id],
                  })
                }
              />
              {p.name}
            </label>
          ))}

        <div className="mt-1 flex items-center gap-1 border-t pt-2 text-xs font-medium text-muted-foreground">
          <FilterIcon className="size-3" /> Filters
        </div>
        {(view.filters ?? []).map((filter, index) => {
          const set = (patch: Partial<ViewFilter>) =>
            update({ filters: view.filters!.map((f, i) => (i === index ? { ...f, ...patch } : f)) })
          return (
            <div key={index} className="flex items-center gap-1">
              <select value={filter.propertyId} onChange={(event) => set({ propertyId: event.target.value })} className={cn(selectClass, 'w-24')}>
                {props.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select value={filter.op} onChange={(event) => set({ op: event.target.value as ViewFilter['op'] })} className={cn(selectClass, 'w-24')}>
                {FILTER_OPS.map(({ op, label }) => (
                  <option key={op} value={op}>
                    {label}
                  </option>
                ))}
              </select>
              {(filter.op === 'contains' || filter.op === 'equals') && (
                <input defaultValue={filter.value} onBlur={(event) => set({ value: event.target.value })} className={cn(selectClass, 'w-16 flex-1 px-1')} />
              )}
              <button type="button" onClick={() => update({ filters: view.filters!.filter((_, i) => i !== index) })}>
                <Trash2Icon className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          )
        })}
        <button type="button" className="self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => update({ filters: [...(view.filters ?? []), { propertyId: props[0].id, op: 'contains', value: '' }] })}>
          + Add filter
        </button>

        <div className="mt-1 flex items-center gap-1 border-t pt-2 text-xs font-medium text-muted-foreground">
          <ArrowUpDownIcon className="size-3" /> Sorts
        </div>
        {(view.sorts ?? []).map((sort, index) => (
          <div key={index} className="flex items-center gap-1">
            <select
              value={sort.propertyId}
              onChange={(event) => update({ sorts: view.sorts!.map((s, i) => (i === index ? { ...s, propertyId: event.target.value } : s)) })}
              className={cn(selectClass, 'flex-1')}
            >
              {props.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={sort.direction}
              onChange={(event) => update({ sorts: view.sorts!.map((s, i) => (i === index ? { ...s, direction: event.target.value as 'asc' | 'desc' } : s)) })}
              className={selectClass}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button type="button" onClick={() => update({ sorts: view.sorts!.filter((_, i) => i !== index) })}>
              <Trash2Icon className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
        <button type="button" className="self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => update({ sorts: [...(view.sorts ?? []), { propertyId: props[0].id, direction: 'asc' }] })}>
          + Add sort
        </button>

        <button type="button" onClick={() => removeView(view)} className="mt-1 flex items-center gap-2 border-t pt-2 text-red-500">
          <Trash2Icon className="size-4" /> Delete view
        </button>
      </div>
    </>
  )
}

/* ---------------------------------- container ------------------------------- */

export function DatabaseView({ databaseId, ownerId, linked = false, fullPage = false }: { databaseId: string; ownerId: string; linked?: boolean; fullPage?: boolean }) {
  const database = useDatabase(databaseId)
  const rows = useRows(databaseId)
  const views = useViews(ownerId)
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState<string>()
  const [menu, setMenu] = useState<'add' | 'settings' | null>(null)
  const insertRow = useNoteStore((s) => s.addRow)
  const createView = useNoteStore((s) => s.createView)
  const updateDatabase = useNoteStore((s) => s.updateDatabase)

  if (!database || !rows || !views) return <div className="h-24 animate-pulse rounded-md bg-muted/40" />

  const view = views.find((v) => v.id === activeId) ?? views[0]
  const openRow = (id: string) => navigate(`/s-note/${id}`)
  const addRow = async (properties: Record<string, PropertyValue> = {}, title = '') => {
    const row = await insertRow(database.id, properties, title)
    if (view?.type !== 'table' && view?.type !== 'board' && view?.type !== 'calendar') openRow(row.id)
  }

  const propsFor = (target: View): ViewProps => ({ database, view: target, rows: applyView(rows, database, target), openRow, addRow })
  const renderOther = (target: View): ReactNode => renderView(propsFor(target), renderOther)

  const addView = async (type: ViewType) => {
    const created = await createView(database.id, ownerId, type)
    setActiveId(created.id)
    setMenu(null)
  }

  return (
    // Full-page databases fill the visible area below the app header; inline ones keep their content height.
    <div className={cn('snote-database not-prose', fullPage ? 'flex min-h-[calc(100svh-var(--header-height))] flex-col py-2' : 'py-1')}>
      {!fullPage && (
        <div className="mb-1 flex items-center gap-2">
          {linked && <LinkIcon className="size-4 text-muted-foreground" />}
          <input
            value={database.title}
            onChange={(event) => updateDatabase(database.id, { title: event.target.value })}
            placeholder={linked ? 'Linked database' : 'Untitled database'}
            className="flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      )}
      <div className="relative mb-2 flex items-center gap-1 border-b">
        <ScrollArea className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveId(v.id)}
              className={cn('shrink-0 border-b-2 px-2 py-1.5 text-sm', v.id === view?.id ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {v.name}
            </button>
          ))}
          <button type="button" onClick={() => setMenu(menu === 'add' ? null : 'add')} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted" title="Add view">
            <PlusIcon className="size-4" />
          </button>
          </div>
        </ScrollArea>
        {view && (
          <>
            <button type="button" onClick={() => setMenu(menu === 'settings' ? null : 'settings')} className="rounded p-1 text-muted-foreground hover:bg-muted" title="View settings">
              <Settings2Icon className="size-4" />
            </button>
            <button type="button" onClick={() => addRow()} className="rounded-md bg-blue-600 px-2 py-0.5 text-sm text-white hover:bg-blue-700">
              New
            </button>
          </>
        )}
        {menu === 'add' && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="absolute top-full left-0 z-50 mt-1 grid w-72 grid-cols-2 gap-0.5 rounded-md border bg-popover p-1 text-sm shadow-lg">
              {Object.entries(VIEW_LABELS).map(([type, label]) => (
                <button key={type} type="button" onClick={() => addView(type as ViewType)} className="rounded px-2 py-1 text-left hover:bg-muted">
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        {menu === 'settings' && view && <ViewSettings database={database} view={view} onClose={() => setMenu(null)} />}
      </div>
      {view ? (
        <div className={cn(fullPage && 'flex min-h-0 flex-1 flex-col [&>*]:flex-1')}>{renderView(propsFor(view), renderOther)}</div>
      ) : (
        <button type="button" onClick={() => addView('table')} className="text-sm text-muted-foreground">
          + Add a view
        </button>
      )}
    </div>
  )
}
