import { AlarmClockIcon, AtSignIcon, CalendarIcon, UserPlusIcon } from 'lucide-react'
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji'
import Mention, { type MentionOptions } from '@tiptap/extension-mention'
import { type MenuItem, matches, renderSuggestion, runMenuItem } from '../suggestion-menu'
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { PageIcon, pageTitle } from './pages'
import { useNoteStore } from '../../note.store'
import { usePage, usePeople } from '../../db/hooks'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/* --------------------------------- mentions ------------------------------- */

export type MentionKind = 'person' | 'page' | 'date'

const toLocalInput = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 16)
}

export function formatDate(value: string, withTime = value.length > 10) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

function MentionView({ node, updateAttributes }: NodeViewProps) {
  const { kind, id, label, date, reminder } = node.attrs as {
    kind: MentionKind
    id: string
    label: string
    date: string
    reminder: boolean
  }
  const page = usePage(kind === 'page' ? id : undefined)
  const people = usePeople()

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
    const overdue = reminder && new Date(date).getTime() < Date.now()
    return (
      <NodeViewWrapper as="span" className="snote-mention">
        <label className={cn('relative inline-flex cursor-pointer items-center gap-1 rounded px-0.5 text-muted-foreground hover:bg-muted', overdue && 'text-red-500')}>
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

async function mentionItems(query: string): Promise<MenuItem[]> {
  const state = useNoteStore.getState()
  const people = state.people
  const pages = Object.values(state.pages)
  const databases = Object.values(state.databases)
  const insert = (attrs: Record<string, unknown>) => (editor: Parameters<MenuItem['run']>[0], range: Parameters<MenuItem['run']>[1]) =>
    editor.chain().focus().insertContentAt(range, [{ type: 'mention', attrs }, { type: 'text', text: ' ' }]).run()

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 864e5)
  const dates: MenuItem[] = [
    { key: 'today', title: 'Today', subtitle: formatDate(toLocalInput(now).slice(0, 10)), date: toLocalInput(now).slice(0, 10) },
    { key: 'tomorrow', title: 'Tomorrow', subtitle: formatDate(toLocalInput(tomorrow).slice(0, 10)), date: toLocalInput(tomorrow).slice(0, 10) },
    { key: 'remind', title: 'Remind me', subtitle: 'Tomorrow 9:00 AM', date: `${toLocalInput(tomorrow).slice(0, 10)}T09:00`, reminder: true },
  ]
    .filter((d) => matches(d, query) || matches({ title: 'date reminder' }, query))
    .map(({ date, reminder, ...item }) => ({
      ...item,
      group: 'Date',
      icon: reminder ? <AlarmClockIcon className="size-4" /> : <CalendarIcon className="size-4" />,
      run: insert({ kind: 'date', id: date, label: date, date, reminder: Boolean(reminder) }),
    }))

  const personItems: MenuItem[] = people
    .filter((p) => matches({ title: p.name }, query))
    .map((p) => ({
      key: `person-${p.id}`,
      title: p.name,
      group: 'People',
      icon: <AtSignIcon className="size-4" />,
      run: insert({ kind: 'person', id: p.id, label: p.name }),
    }))
  const dbTitles = new Map(databases.map((db) => [db.pageId, db.title]))
  const pageItems: MenuItem[] = pages
    .filter((p) => !p.trashed && matches({ title: pageTitle(p.title || dbTitles.get(p.id)) }, query))
    .slice(0, 8)
    .map((p) => ({
      key: `page-${p.id}`,
      title: pageTitle(p.title),
      subtitle: p.kind === 'database' ? 'Data source' : undefined,
      group: 'Pages & data sources',
      icon: <PageIcon icon={p.icon} content={p.content} />,
      run: insert({ kind: 'page', id: p.id, label: pageTitle(p.title) }),
    }))

  // Creating a person is the fallback, so it goes last and never steals Enter from a real match.
  const addPerson: MenuItem[] = []
  if (query.trim() && !people.some((p) => p.name.toLowerCase() === query.trim().toLowerCase())) {
    addPerson.push({
      key: 'person-new',
      title: `Add person “${query.trim()}”`,
      group: 'People',
      icon: <UserPlusIcon className="size-4" />,
      run: async (editor, range) => {
        const person = await useNoteStore.getState().createPerson(query.trim())
        insert({ kind: 'person', id: person.id, label: person.name })(editor, range)
      },
    })
  }

  return [...personItems, ...pageItems, ...dates, ...addPerson]
}

export const MentionNode = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: { default: 'person' },
      date: { default: '' },
      reminder: { default: false },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionView, { as: 'span' })
  },
}).configure({
  deleteTriggerWithBackspace: true,
  renderText: ({ node }) => `@${node.attrs.label}`,
  // Menu items insert their own mention node (person, page or date), so the suggestion is typed
  // over MenuItem rather than Mention's default attribute payload.
  suggestions: [
    { char: '@', items: ({ query }: { query: string }) => mentionItems(query), render: renderSuggestion, command: runMenuItem },
  ] as unknown as MentionOptions['suggestions'],
})

/* ---------------------------------- emoji --------------------------------- */

// Drop CDN fallback images so emoji always render natively and nothing is fetched remotely.
const localEmojis = gitHubEmojis.map(({ fallbackImage: _fallback, ...emoji }) => emoji)

export const EmojiNode = Emoji.configure({
  emojis: localEmojis,
  enableEmoticons: true,
  suggestion: {
    char: ':',
    items: ({ query }: { query: string }): MenuItem[] =>
      localEmojis
        .filter((e) => e.emoji && (e.shortcodes.some((s) => s.includes(query.toLowerCase())) || e.tags.some((t) => t.startsWith(query.toLowerCase()))))
        // Shortcode prefix matches first, then other shortcode matches, then tag matches.
        .map((e) => ({ e, rank: e.shortcodes.some((s) => s.startsWith(query.toLowerCase())) ? 0 : e.shortcodes.some((s) => s.includes(query.toLowerCase())) ? 1 : 2 }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ e }) => e)
        .slice(0, 12)
        .map((e) => ({
          key: e.name,
          title: `:${e.shortcodes[0]}:`,
          icon: e.emoji,
          run: (editor, range) => editor.chain().focus().deleteRange(range).setEmoji(e.name).run(),
        })),
    render: renderSuggestion,
    command: runMenuItem,
  },
})
