import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { DateValue, Page } from '../../db/types'
import { PageIcon, pageTitle } from '../../editor/nodes/pages'
import { dateStart, readValue } from '../properties'
import { useMemo, useState } from 'react'
import type { ViewProps } from './types'
import { cn } from '@/lib/utils'

const DAY = 864e5
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const startOfDay = (value: string) => new Date(`${value.slice(0, 10)}T00:00`)

function useDateProp({ database, view }: Pick<ViewProps, 'database' | 'view'>) {
  return database.properties.find((p) => p.id === view.dateProperty) ?? database.properties.find((p) => p.type === 'date')
}

function NoDateProperty() {
  return <p className="p-4 text-sm text-muted-foreground">Add a Date property to use this view.</p>
}

/* --------------------------------- calendar -------------------------------- */

export function CalendarView(props: ViewProps) {
  const { rows, openRow, addRow } = props
  const dateProp = useDateProp(props)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const days = useMemo(() => {
    const first = new Date(month)
    first.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i))
  }, [month])

  if (!dateProp) return <NoDateProperty />

  const byDay = new Map<string, Page[]>()
  rows.forEach((row) => {
    const value = readValue(row, dateProp) as DateValue | null
    if (!value?.start) return
    const end = value.end ? startOfDay(value.end) : startOfDay(value.start)
    for (let d = startOfDay(value.start); d <= end; d = new Date(d.getTime() + DAY)) {
      byDay.set(iso(d), [...(byDay.get(iso(d)) ?? []), row])
    }
  })
  const today = iso(new Date())

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base font-semibold">{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded p-1 hover:bg-muted">
            <ChevronLeftIcon className="size-4" />
          </button>
          <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="rounded px-2 py-0.5 text-sm hover:bg-muted">
            Today
          </button>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded p-1 hover:bg-muted">
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-t border-l text-sm">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="border-r border-b px-2 py-1 text-xs text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = iso(day)
          return (
            <div
              key={key}
              onDoubleClick={() => addRow({ [dateProp.id]: { start: key } })}
              className={cn('group/day min-h-24 border-r border-b p-1', day.getMonth() !== month.getMonth() && 'bg-muted/30 text-muted-foreground')}
            >
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => addRow({ [dateProp.id]: { start: key } })} className="rounded px-1 text-xs text-muted-foreground opacity-0 group-hover/day:opacity-100 hover:bg-muted">
                  +
                </button>
                <span className={cn('flex size-6 items-center justify-center rounded-full text-xs', key === today && 'bg-red-500 text-white')}>{day.getDate()}</span>
              </div>
              {byDay.get(key)?.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openRow(row.id)}
                  className="mt-1 flex w-full items-center gap-1 truncate rounded border bg-background px-1 py-0.5 text-left text-xs shadow-xs hover:bg-muted"
                >
                  <PageIcon icon={row.icon} content={row.content} /> {pageTitle(row.title)}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------- timeline -------------------------------- */

const DAY_WIDTH = 36

export function TimelineView(props: ViewProps) {
  const { rows, openRow, addRow } = props
  const dateProp = useDateProp(props)
  if (!dateProp) return <NoDateProperty />

  const dated = rows
    .map((row) => ({ row, value: readValue(row, dateProp) as DateValue | null }))
    .filter((item): item is { row: Page; value: DateValue } => Boolean(item.value?.start))
  const undated = rows.filter((row) => !dateStart(readValue(row, dateProp)))

  const today = startOfDay(iso(new Date()))
  const starts = dated.map(({ value }) => startOfDay(value.start).getTime())
  const ends = dated.map(({ value }) => startOfDay(value.end ?? value.start).getTime())
  const origin = new Date(Math.min(today.getTime(), ...starts) - 3 * DAY)
  const span = Math.max(21, Math.ceil((Math.max(today.getTime(), ...ends) - origin.getTime()) / DAY) + 7)
  const offset = (time: number) => Math.round((time - origin.getTime()) / DAY) * DAY_WIDTH

  return (
    <ScrollArea>
      <div style={{ width: span * DAY_WIDTH + 200 }} className="relative text-xs">
        <div className="sticky top-0 flex border-b pl-[200px]">
          {Array.from({ length: span }, (_, i) => {
            const day = new Date(origin.getTime() + i * DAY)
            return (
              <div key={i} style={{ width: DAY_WIDTH }} className={cn('shrink-0 py-1 text-center text-muted-foreground', day.getDate() === 1 && 'font-semibold text-foreground')}>
                {day.getDate() === 1 || i === 0 ? day.toLocaleString(undefined, { month: 'short' }) : ''}
                <div>{day.getDate()}</div>
              </div>
            )
          })}
        </div>
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-400" style={{ left: 200 + offset(today.getTime()) + DAY_WIDTH / 2 }} />
        {dated.map(({ row, value }) => {
          const start = startOfDay(value.start).getTime()
          const end = startOfDay(value.end ?? value.start).getTime()
          return (
            <div key={row.id} className="flex h-9 items-center border-b">
              <button type="button" onClick={() => openRow(row.id)} className="w-[200px] shrink-0 truncate px-2 text-left text-sm hover:underline">
                {pageTitle(row.title)}
              </button>
              <div className="relative h-full flex-1">
                <button
                  type="button"
                  onClick={() => openRow(row.id)}
                  style={{ left: offset(start), width: offset(end) - offset(start) + DAY_WIDTH }}
                  className="absolute top-1.5 flex h-6 items-center truncate rounded-md border bg-blue-500/15 px-2 text-left text-xs shadow-xs hover:bg-blue-500/25"
                >
                  {pageTitle(row.title)}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {undated.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="mb-1 text-xs text-muted-foreground">No date</div>
          {undated.map((row) => (
            <button key={row.id} type="button" onClick={() => openRow(row.id)} className="block rounded px-2 py-0.5 hover:bg-muted">
              {pageTitle(row.title)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => addRow({ [dateProp.id]: { start: iso(new Date()), end: iso(new Date(Date.now() + 3 * DAY)) } })}
        className="mt-2 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
      >
        + New
      </button>
    </ScrollArea>
  )
}
