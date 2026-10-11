import { ScrollArea } from '@/components/ui/scroll-area'
import type { Page, PropertyDef, PropertyValue } from '../../db/types'
import { PageIcon, pageTitle } from '../../editor/nodes/pages'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { PropertyDisplay, PropertyEditor, readValue, valueText } from '../properties'
import { useNoteStore } from '../../note.store'
import { PropertyHeader } from '../PropertyHeader'
import type { ViewProps } from './types'
import { cn } from '@/lib/utils'
import { useMediaUrl } from '../../db/hooks'
import { useState } from 'react'

const visible = ({ database, view }: Pick<ViewProps, 'database' | 'view'>) =>
  database.properties.filter((p) => p.type !== 'title' && !view.hiddenProperties?.includes(p.id))

function RowTitle({ row, onOpen }: { row: Page; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-1.5 text-left">
      <PageIcon icon={row.icon} content={row.content} />
      <span className="truncate font-medium">{pageTitle(row.title)}</span>
    </button>
  )
}

/* ---------------------------------- table --------------------------------- */

export function TableView(props: ViewProps) {
  const { database, rows, openRow, addRow } = props
  const setPageTrashed = useNoteStore((s) => s.setPageTrashed)
  const columns = [database.properties.find((p) => p.type === 'title')!, ...visible(props)]
  return (
    <ScrollArea>
      <table className="snote-db-table w-full min-w-max border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((prop) => (
              <th key={prop.id} className="min-w-40 border-y border-r text-left font-normal text-muted-foreground last:border-r-0">
                <PropertyHeader database={database} prop={prop} />
              </th>
            ))}
            <th className="w-10 border-y">
              <PropertyHeader database={database} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="group/row">
              {columns.map((prop) => (
                <td key={prop.id} className="border-r border-b align-top last:border-r-0">
                  {prop.type === 'title' ? (
                    <div className="flex items-center">
                      <div className="flex-1">
                        <PropertyEditor database={database} prop={prop} row={row} />
                      </div>
                      <button
                        type="button"
                        onClick={() => openRow(row.id)}
                        className="mr-1 rounded border bg-background px-1.5 text-xs text-muted-foreground opacity-0 group-hover/row:opacity-100"
                      >
                        Open
                      </button>
                    </div>
                  ) : (
                    <PropertyEditor database={database} prop={prop} row={row} />
                  )}
                </td>
              ))}
              <td className="border-b text-center">
                <button type="button" onClick={() => setPageTrashed(row.id, true)} className="p-1 text-muted-foreground opacity-0 group-hover/row:opacity-100">
                  <Trash2Icon className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewRowButton onClick={() => addRow()} />
    </ScrollArea>
  )
}

export function NewRowButton({ onClick, label = 'New page' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/60">
      <PlusIcon className="size-4" /> {label}
    </button>
  )
}

/* ---------------------------------- board --------------------------------- */

export function groupRows(rows: Page[], prop: PropertyDef | undefined) {
  if (!prop) return [{ key: '', label: 'All', rows, value: null as PropertyValue }]
  if (prop.options) {
    const groups = prop.options.map((option) => ({
      key: option.id,
      label: option.name,
      color: option.color,
      value: (prop.type === 'multi_select' ? [option.id] : option.id) as PropertyValue,
      rows: rows.filter((row) => {
        const v = readValue(row, prop)
        return Array.isArray(v) ? v.includes(option.id) : v === option.id
      }),
    }))
    const none = rows.filter((row) => {
      const v = readValue(row, prop)
      return Array.isArray(v) ? !v.length : !v
    })
    return [{ key: '__none', label: `No ${prop.name}`, value: null as PropertyValue, rows: none }, ...groups]
  }
  const map = new Map<string, Page[]>()
  rows.forEach((row) => {
    const key = valueText(prop, readValue(row, prop))
    map.set(key, [...(map.get(key) ?? []), row])
  })
  return [...map].map(([key, groupRowsList]) => ({ key, label: key || `No ${prop.name}`, value: key as PropertyValue, rows: groupRowsList }))
}

export function BoardView(props: ViewProps) {
  const { database, view, rows, openRow, addRow } = props
  const groupProp = database.properties.find((p) => p.id === view.groupBy) ?? database.properties.find((p) => p.type === 'status' || p.type === 'select')
  const [dragging, setDragging] = useState<string | null>(null)
  const setPageProperty = useNoteStore((s) => s.setPageProperty)
  const groups = groupRows(rows, groupProp)

  const moveTo = (value: PropertyValue) => {
    const row = rows.find((r) => r.id === dragging)
    if (row && groupProp) setPageProperty(row.id, groupProp.id, value)
    setDragging(null)
  }

  return (
    <ScrollArea>
      <div className="flex gap-3 pb-2">
      {groups.map((group) => (
        <div
          key={group.key}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => moveTo(group.value)}
          className="w-64 shrink-0 rounded-md bg-muted/40 p-2"
        >
          <div className="mb-2 flex items-center gap-2 px-1 text-sm">
            <span className={cn('rounded px-1.5', 'color' in group && `snote-tag-${group.color}`)}>{group.label}</span>
            <span className="text-muted-foreground">{group.rows.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {group.rows.map((row) => (
              <div
                key={row.id}
                draggable
                onDragStart={() => setDragging(row.id)}
                onClick={() => openRow(row.id)}
                className={cn('cursor-pointer rounded-md border bg-background p-2 text-sm shadow-xs hover:bg-muted/40', dragging === row.id && 'opacity-50')}
              >
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <PageIcon icon={row.icon} content={row.content} /> {pageTitle(row.title)}
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  {visible(props)
                    .filter((p) => p.id !== groupProp?.id)
                    .map((prop) => (
                      <PropertyDisplay key={prop.id} prop={prop} row={row} />
                    ))}
                </div>
              </div>
            ))}
            <NewRowButton label="New" onClick={() => addRow(groupProp && group.value !== null ? { [groupProp.id]: group.value } : {})} />
          </div>
        </div>
      ))}
      </div>
    </ScrollArea>
  )
}

/* --------------------------------- gallery -------------------------------- */

function CardCover({ src }: { src: string }) {
  const url = useMediaUrl(src)
  return url ? <img src={url} alt="" className="h-36 w-full object-cover" /> : <div className="h-36 w-full bg-muted/60" />
}

/** First image in a row's content, used as gallery cover when the page has no cover. */
const firstImage = (row: Page) => row.cover || row.content.match(/"kind":"image","src":"([^"]+)"/)?.[1] || ''

export function GalleryView(props: ViewProps) {
  const { rows, openRow, addRow } = props
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {rows.map((row) => (
        <div key={row.id} onClick={() => openRow(row.id)} className="cursor-pointer overflow-hidden rounded-md border bg-background shadow-xs hover:bg-muted/30">
          <CardCover src={firstImage(row)} />
          <div className="p-2 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <PageIcon icon={row.icon} content={row.content} /> {pageTitle(row.title)}
            </div>
            <div className="flex flex-col gap-1 text-xs">
              {visible(props).map((prop) => (
                <PropertyDisplay key={prop.id} prop={prop} row={row} />
              ))}
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => addRow()} className="flex min-h-48 items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted/40">
        <PlusIcon className="size-4" /> New page
      </button>
    </div>
  )
}

/* ---------------------------------- list ---------------------------------- */

export function ListView(props: ViewProps) {
  const { rows, openRow, addRow } = props
  return (
    <div>
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-4 border-b px-1 py-1.5 text-sm hover:bg-muted/40">
          <RowTitle row={row} onOpen={() => openRow(row.id)} />
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {visible(props).map((prop) => (
              <PropertyDisplay key={prop.id} prop={prop} row={row} />
            ))}
          </div>
        </div>
      ))}
      <NewRowButton onClick={() => addRow()} />
    </div>
  )
}

/* ---------------------------------- feed ---------------------------------- */

/** Plain-text preview of a row's document. */
function previewText(content: string) {
  const parts: string[] = []
  const walk = (node: { text?: string; content?: unknown[] }) => {
    if (node.text) parts.push(node.text)
    node.content?.forEach((child) => walk(child as typeof node))
  }
  try {
    walk(JSON.parse(content))
  } catch {
    return ''
  }
  return parts.join(' ').slice(0, 400)
}

export function FeedView(props: ViewProps) {
  const { rows, openRow, addRow } = props
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <NewRowButton label="New post" onClick={() => addRow()} />
      {[...rows].reverse().map((row) => (
        <article key={row.id} onClick={() => openRow(row.id)} className="cursor-pointer rounded-md border p-4 hover:bg-muted/30">
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold">
            <PageIcon icon={row.icon} content={row.content} /> {pageTitle(row.title)}
          </h3>
          <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {new Date(row.createdAt).toLocaleString()}
            {visible(props).map((prop) => (
              <PropertyDisplay key={prop.id} prop={prop} row={row} />
            ))}
          </div>
          <p className="line-clamp-4 text-sm text-muted-foreground">{previewText(row.content) || 'Empty page'}</p>
        </article>
      ))}
    </div>
  )
}

/* ---------------------------------- form ---------------------------------- */

export function FormView({ database }: ViewProps) {
  const [draft, setDraft] = useState<Record<string, PropertyValue>>({})
  const [title, setTitle] = useState('')
  const [submitted, setSubmitted] = useState(0)
  const insertRow = useNoteStore((s) => s.addRow)
  const draftRow = { id: 'draft', title, properties: draft, updatedAt: submitted } as Page

  const submit = async () => {
    await insertRow(database.id, draft, title)
    setDraft({})
    setTitle('')
    setSubmitted(Date.now())
  }

  return (
    <form
      key={submitted}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="mx-auto flex max-w-lg flex-col gap-4 rounded-lg border p-6"
    >
      <h3 className="text-lg font-semibold">{pageTitle(database.title)}</h3>
      {submitted > 0 && <p className="rounded bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">Response recorded.</p>}
      {database.properties
        .filter((p) => p.type !== 'created_time')
        .map((prop) => (
          <label key={prop.id} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{prop.name}</span>
            <div className="rounded-md border">
              {prop.type === 'title' ? (
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-8 w-full bg-transparent px-2 outline-none" required />
              ) : (
                <PropertyEditor database={database} prop={prop} row={draftRow} onDraft={(value) => setDraft((d) => ({ ...d, [prop.id]: value }))} />
              )}
            </div>
          </label>
        ))}
      <button type="submit" className="self-start rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground">
        Submit
      </button>
    </form>
  )
}
