import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { AlarmClockIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { usePage, usePeople } from '../../../db/hooks'
import { useNow } from '../../../lib/use-now'
import { formatDate } from '../format-date'
import type { MentionKind } from '../inline'
import { pageTitle } from '../page-utils'
import { PageIcon } from '../PageIcon'

export function MentionView({ node, updateAttributes }: NodeViewProps) {
  const { kind, id, label, date, reminder } = node.attrs as {
    kind: MentionKind
    id: string
    label: string
    date: string
    reminder: boolean
  }
  const page = usePage(kind === 'page' ? id : undefined)
  const people = usePeople()
  const now = useNow()

  if (kind === 'page') {
    return (
      <NodeViewWrapper as="span" className="snote-mention">
        <Link to={`/s-note/${id}`} className="inline-flex items-baseline gap-1 rounded px-0.5 hover:bg-muted">
          <PageIcon icon={page?.icon} content={page?.content} className="text-[0.95em]" />
          <span className="border-b border-foreground/30 font-medium">{page ? pageTitle(page.title) : label}</span>
        </Link>
      </NodeViewWrapper>
    )
  }

  if (kind === 'date') {
    const overdue = reminder && new Date(date).getTime() < now
    return (
      <NodeViewWrapper as="span" className="snote-mention">
        <label
          className={cn(
            'relative inline-flex cursor-pointer items-center gap-1 rounded px-0.5 text-muted-foreground hover:bg-muted',
            overdue && 'text-red-500',
          )}
        >
          {reminder ? <AlarmClockIcon className="size-3.5" /> : <span>@</span>}
          {formatDate(date)}
          <input
            type={date.length > 10 ? 'datetime-local' : 'date'}
            value={date}
            onChange={(event) => updateAttributes({ date: event.target.value })}
            className="absolute inset-0 opacity-0"
          />
        </label>
      </NodeViewWrapper>
    )
  }

  const person = people?.find((p) => p.id === id)
  return (
    <NodeViewWrapper as="span" className="snote-mention rounded px-0.5 text-muted-foreground">
      @{person?.name ?? label}
    </NodeViewWrapper>
  )
}
