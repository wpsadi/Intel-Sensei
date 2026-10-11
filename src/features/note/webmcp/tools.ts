import type { z } from 'zod'
import type { Database, Page, PropertyDef, PropertyValue, SelectOption } from '../db/types'
import { selectAncestry, selectChildren, useNoteStore } from '../note.store'
import { docToText } from './content'
import { getLiveEditor } from '../editor/live-editors'
import { assertRead, forgetRead, markRead } from './read-guard'
import type * as S from './schemas'

/*
 * What each WebMCP note tool does, as plain functions over the note store. They throw actionable errors
 * (useWebMCP turns them into isError results) and return compact JSON within the ~1,500 character budget.
 */

const PAGE_SIZE = 10
// About 5k tokens: a typical note comes back in one call; only very long ones page with next_offset.
const READ_CHUNK = 20000

const state = () => useNoteStore.getState()

// Same as the editor's pageTitle and the database's valueText; kept local because the tools load with the app
// shell on every route, and those modules pull in the whole editor.
export const pageTitle = (title: string | undefined) => title || 'New Page'
function valueText(prop: PropertyDef, value: PropertyValue): string {
  if (value === null || value === undefined) return ''
  const option = (id: unknown) => prop.options?.find((o) => o.id === id)?.name
  if (prop.type === 'select' || prop.type === 'status') return option(value) ?? ''
  if (prop.type === 'multi_select') return (value as string[]).map(option).filter(Boolean).join(', ')
  if (prop.type === 'date') return typeof value === 'object' && 'start' in value ? value.start : ''
  if (prop.type === 'checkbox') return value ? 'Checked' : 'Unchecked'
  return String(value)
}

/** A page's display title; full-page databases keep theirs on the database. */
const titleOf = (page: Page) => pageTitle(page.kind === 'database' ? state().databases[page.databaseId ?? '']?.title : page.title)

/** "Parent / Child" path above the page, so agents can tell same-named notes apart. */
const pathOf = (page: Page) =>
  selectAncestry(state(), page.id)
    .slice(0, -1)
    .map(titleOf)
    .join(' / ')

/** A note's document as JSON text: live from its open editor (which may be ahead of the last save), saved otherwise. */
const contentOf = (page: Page) => {
  const live = getLiveEditor(page.id)
  return live ? JSON.stringify(live.getJSON()) : page.content
}

const brief = (page: Page) => ({ id: page.id, title: titleOf(page), path: pathOf(page) || undefined })

/** Resolves a note the user named (id or title) to exactly one page, or explains why it cannot. */
export function findPage(ref: string, { trashed = false } = {}): Page {
  const { pages } = state()
  if (pages[ref] && pages[ref].trashed === trashed) return pages[ref]
  const pool = Object.values(pages).filter((page) => page.trashed === trashed && page.parentType !== 'database')
  const needle = ref.trim().toLowerCase()
  let matches = pool.filter((page) => titleOf(page).toLowerCase() === needle)
  if (!matches.length) matches = pool.filter((page) => titleOf(page).toLowerCase().includes(needle))
  if (matches.length === 1) return matches[0]
  if (!matches.length) {
    throw new Error(`No ${trashed ? 'trashed ' : ''}note matches "${ref}". Call search_notes${trashed ? ' with in_trash: true' : ''} to find the right one.`)
  }
  const options = matches.slice(0, 5).map((page) => `"${titleOf(page)}" (id ${page.id}${pathOf(page) ? `, in ${pathOf(page)}` : ''})`)
  throw new Error(`"${ref}" matches ${matches.length} notes: ${options.join('; ')}. Ask the user which one, then pass its id.`)
}

export function findDatabase(ref: string): Database {
  const { databases } = state()
  if (databases[ref]) return databases[ref]
  const byTitle = Object.values(databases).filter((db) => db.title.trim().toLowerCase() === ref.trim().toLowerCase())
  if (byTitle.length === 1) return byTitle[0]
  const page = findPage(ref)
  const database = page.databaseId ? databases[page.databaseId] : undefined
  if (!database) throw new Error(`"${titleOf(page)}" is a text note, not a database. Use read_note or edit_note for it.`)
  return database
}

const isInside = (page: Page, ancestorId: string) => selectAncestry(state(), page.id).some((p) => p.id === ancestorId)

const paginate = <T>(items: T[], page: number) => ({
  total_count: items.length,
  page,
  page_size: PAGE_SIZE,
  has_more: page * PAGE_SIZE < items.length,
  items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
})

const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/* --------------------------------- reading -------------------------------- */

export function searchNotes({ query, inside, favorites_only, in_trash, page }: z.output<typeof S.searchNotes>) {
  const parent = inside ? findPage(inside) : undefined
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const found = Object.values(state().pages)
    .filter((p) => p.trashed === !!in_trash && p.parentType !== 'database')
    .filter((p) => !favorites_only || p.favorite)
    .filter((p) => !parent || (p.id !== parent.id && isInside(p, parent.id)))
    .filter((p) => {
      if (!words.length) return true
      const haystack = `${titleOf(p)}\n${p.kind === 'page' ? docToText(p.content) : ''}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const { items, ...meta } = paginate(found, page)
  return {
    ...meta,
    notes: items.map((p) => ({ ...brief(p), kind: p.kind, favorite: p.favorite || undefined, edited: new Date(p.updatedAt).toISOString().slice(0, 10) })),
  }
}

export function readNote({ note, offset }: z.output<typeof S.readNote>) {
  const page = findPage(note)
  const children = selectChildren(state(), page.id).map(titleOf)
  const base = { ...brief(page), untitled: page.title || page.kind === 'database' ? undefined : true, kind: page.kind, locked: page.locked || undefined, favorite: page.favorite || undefined }
  if (page.kind === 'database') {
    const database = state().databases[page.databaseId ?? '']
    return { ...base, columns: database?.properties.map((p) => `${p.name} (${p.type})`), row_count: database ? selectChildren(state(), database.id).length : 0, hint: 'Use query_database to read rows.' }
  }
  const content = contentOf(page)
  if (content) markRead(page.id, JSON.parse(content))
  const text = docToText(content)
  const end = offset + READ_CHUNK
  return {
    ...base,
    sub_notes: children.length ? children.slice(0, 15) : undefined,
    text: text.slice(offset, end) || '(empty)',
    next_offset: end < text.length ? end : undefined,
  }
}

/* ------------------------------- navigation ------------------------------- */

export function openNote({ note }: z.output<typeof S.openNote>, go: (path: string) => void) {
  if (note.trim().toLowerCase() === 'trash') {
    go('/s-note/trash')
    return 'Showing the trash.'
  }
  const page = findPage(note)
  go(`/s-note/${page.id}`)
  return `Opened "${titleOf(page)}".`
}

/* -------------------------------- writing --------------------------------- */

export async function createNote({ title, content, inside, icon, as_database, open }: z.output<typeof S.createNote>, go: (path: string) => void) {
  const store = state()
  const parent = inside ? findPage(inside) : undefined
  if (parent?.kind === 'database') throw new Error(`"${titleOf(parent)}" is a database. Add rows to it with update_database_rows instead.`)
  const parentId = parent?.id ?? null
  const parentType = parent ? 'page' : 'workspace'

  let created: Page
  if (as_database) {
    const { page, database } = await store.createFullPageDatabase(parentId, parentType)
    await store.updateDatabase(database.id, { title })
    if (icon) await store.updatePage(page.id, { icon })
    created = page
  } else {
    created = await store.createPage({ parentId, parentType, title, icon: icon ?? '' })
    if (content) {
      const { writeContent } = await import('./markdown')
      await store.updatePage(created.id, { content: writeContent('', content, 'replace', created.id) })
    }
  }
  if (open) go(`/s-note/${created.id}`)
  return { status: 'created', id: created.id, title, inside: parent ? titleOf(parent) : 'workspace', opened: open }
}

export async function editNote(args: z.output<typeof S.editNote>) {
  const { note, content, mode, rewrite_whole_note, title, icon, favorite, locked, full_width, small_text, font } = args
  const store = state()
  const page = findPage(note)
  const changesBody = content !== undefined || title !== undefined || icon !== undefined
  if (page.locked && locked !== false && changesBody) {
    throw new Error(`"${titleOf(page)}" is locked. Ask the user before unlocking it (pass locked: false).`)
  }
  if (content !== undefined && page.kind === 'database') throw new Error(`"${titleOf(page)}" is a database. Use update_database_rows to change its rows.`)

  const patch: Partial<Page> = {}
  if (icon !== undefined) patch.icon = icon
  if (favorite !== undefined) patch.favorite = favorite
  if (locked !== undefined) patch.locked = locked
  if (full_width !== undefined) patch.fullWidth = full_width
  if (small_text !== undefined) patch.smallText = small_text
  if (font !== undefined) patch.font = font
  if (title !== undefined) {
    if (page.kind === 'database' && page.databaseId) await store.updateDatabase(page.databaseId, { title })
    else patch.title = title
  }
  if (!Object.keys(patch).length && title === undefined && content === undefined) throw new Error('Nothing to change. Pass content, title, icon or a setting.')

  const changed = [...Object.keys(patch), ...(title !== undefined && !patch.title ? ['title'] : [])]
  if (content !== undefined) {
    const current = contentOf(page)
    assertRead(page.id, titleOf(page), JSON.parse(current || '{}'))
    const next = JSON.parse((await import('./markdown')).writeContent(current, content, rewrite_whole_note ? 'replace' : mode, page.id))
    const live = getLiveEditor(page.id)
    // Through the open editor the change shows at once, autosaves and Ctrl+Z undoes it; a closed note is saved directly.
    if (live) live.chain().setContent(next, { emitUpdate: true }).run()
    else patch.content = JSON.stringify(next)
    changed.push('content')
    forgetRead(page.id)
  }
  if (Object.keys(patch).length) await store.updatePage(page.id, patch)
  return { status: 'updated', id: page.id, title: title ?? titleOf(page), changed: [...new Set(changed)] }
}

export async function duplicateNote({ note }: z.output<typeof S.duplicateNote>) {
  const page = findPage(note)
  const copy = await state().duplicatePage(page.id)
  if (!copy) throw new Error(`"${titleOf(page)}" is a database; only text notes can be duplicated.`)
  return { status: 'duplicated', id: copy.id, title: copy.title }
}

export async function moveNotes({ notes, inside }: z.output<typeof S.moveNotes>) {
  const target = inside ? findPage(inside) : undefined
  if (target?.kind === 'database') throw new Error(`"${titleOf(target)}" is a database; notes can only move under text notes or the workspace.`)
  const pages = notes.map((ref) => findPage(ref))
  for (const page of pages) {
    if (target && (page.id === target.id || isInside(target, page.id))) {
      throw new Error(`Cannot move "${titleOf(page)}" inside itself or one of its sub-notes. Nothing was moved.`)
    }
  }
  await Promise.all(pages.map((page) => state().movePage(page.id, target?.id ?? null)))
  return { status: 'moved', notes: pages.map(titleOf), inside: target ? titleOf(target) : 'workspace' }
}

export async function trashNotes({ notes, restore }: z.output<typeof S.trashNotes>) {
  const pages = notes.map((ref) => findPage(ref, { trashed: !!restore }))
  await Promise.all(pages.map((page) => state().setPageTrashed(page.id, !restore)))
  return { status: restore ? 'restored' : 'trashed', notes: pages.map(titleOf), note: restore ? undefined : 'Sub-notes moved too. Restore with trash_notes and restore: true.' }
}

export async function deleteNotesForever({ notes }: z.output<typeof S.deleteNotesForever>) {
  const pages = notes.map((ref) => findPage(ref, { trashed: true }))
  await Promise.all(pages.map((page) => state().destroyPage(page.id)))
  return { status: 'deleted', notes: pages.map(titleOf) }
}

/* -------------------------------- databases ------------------------------- */

const cellText = (prop: PropertyDef, value: PropertyValue) =>
  prop.type === 'person' ? (state().people.find((p) => p.id === value)?.name ?? '') : valueText(prop, value)

const rowCells = (database: Database, row: Page) => {
  const cells: Record<string, string> = { id: row.id }
  for (const prop of database.properties) {
    const text = prop.type === 'title' ? titleOf(row) : prop.type === 'created_time' ? new Date(row.createdAt).toISOString().slice(0, 10) : cellText(prop, row.properties[prop.id] ?? null)
    if (text) cells[prop.name] = clip(text)
  }
  return cells
}

const findColumn = (database: Database, name: string) => {
  const prop = database.properties.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  if (!prop) throw new Error(`"${database.title || 'This database'}" has no column "${name}". Columns: ${database.properties.map((p) => p.name).join(', ')}.`)
  return prop
}

export function queryDatabase({ database: ref, where, page }: z.output<typeof S.queryDatabase>) {
  const database = findDatabase(ref)
  const filters = Object.entries(where ?? {}).map(([name, text]) => [findColumn(database, name), text.toLowerCase()] as const)
  const rows = selectChildren(state(), database.id)
    .map((row) => rowCells(database, row))
    .filter((cells) => filters.every(([prop, text]) => (cells[prop.name] ?? '').toLowerCase().includes(text)))
  const { items, ...meta } = paginate(rows, page)
  return { database: database.title || 'Untitled', columns: database.properties.map((p) => p.name), ...meta, rows: items }
}

/** Turns "today", "in 3 days" or "2026-10-20" into a stored date, so the agent never does date math. */
export function parseDate(text: string) {
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  const lower = text.trim().toLowerCase()
  const relative = lower.match(/^in (\d+) days?$/)
  if (lower === 'today') return day
  if (lower === 'tomorrow') return new Date(day.getTime() + 864e5)
  if (lower === 'yesterday') return new Date(day.getTime() - 864e5)
  if (relative) return new Date(day.getTime() + Number(relative[1]) * 864e5)
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const OPTION_COLORS = ['gray', 'blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow']

/** Converts what the agent said into the value a column stores, adding select options and people as needed. */
async function toCell(prop: PropertyDef, raw: z.output<typeof S.updateDatabaseRows>['rows'][number]['values'][string]): Promise<PropertyValue> {
  if (raw === null || raw === '') return null
  const text = Array.isArray(raw) ? raw.join(', ') : String(raw)
  switch (prop.type) {
    case 'number': {
      const number = typeof raw === 'number' ? raw : Number(text)
      if (Number.isNaN(number)) throw new Error(`"${prop.name}" needs a number, got "${text}".`)
      return number
    }
    case 'checkbox':
      return typeof raw === 'boolean' ? raw : ['true', 'yes', 'done', 'checked', '1'].includes(text.toLowerCase())
    case 'date': {
      const date = parseDate(text)
      if (!date) throw new Error(`"${prop.name}" needs a date like 2026-10-20, "today" or "in 3 days"; got "${text}".`)
      return { start: isoDay(date) }
    }
    case 'person': {
      const person = state().people.find((p) => p.name.toLowerCase() === text.toLowerCase())
      return (person ?? (await state().createPerson(text))).id
    }
    case 'select':
    case 'status':
    case 'multi_select': {
      const names = Array.isArray(raw) ? raw : prop.type === 'multi_select' ? text.split(',') : [text]
      const ids = names.map((name) => {
        const trimmed = name.trim()
        const option = prop.options?.find((o) => o.name.toLowerCase() === trimmed.toLowerCase())
        if (option) return option.id
        if (prop.type === 'status') throw new Error(`"${prop.name}" has no status "${trimmed}". Choose one of: ${prop.options?.map((o) => o.name).join(', ')}.`)
        const created: SelectOption = { id: crypto.randomUUID(), name: trimmed, color: OPTION_COLORS[(prop.options?.length ?? 0) % OPTION_COLORS.length] }
        prop.options = [...(prop.options ?? []), created]
        return created.id
      })
      return prop.type === 'multi_select' ? ids : ids[0]
    }
    case 'created_time':
      throw new Error(`"${prop.name}" is set automatically and cannot be changed.`)
    default:
      return text
  }
}

export async function updateDatabaseRows({ database: ref, rows }: z.output<typeof S.updateDatabaseRows>) {
  const store = state()
  const original = findDatabase(ref)
  // Work on a copy so new select options are saved once, after every value has been checked.
  const database: Database = { ...original, properties: original.properties.map((p) => ({ ...p })) }
  const existing = selectChildren(store, database.id)

  const planned = []
  for (const { row, values } of rows) {
    let target: Page | undefined
    if (row) {
      const needle = row.trim().toLowerCase()
      const matches = existing.filter((r) => r.id === row || titleOf(r).toLowerCase() === needle)
      if (matches.length !== 1) {
        throw new Error(matches.length ? `${matches.length} rows are named "${row}"; pass the row id from query_database.` : `No row "${row}" in "${database.title || 'this database'}". Omit row to add it as a new row. Nothing was changed.`)
      }
      target = matches[0]
    }
    let title: string | undefined
    const cells: Record<string, PropertyValue> = {}
    for (const [name, raw] of Object.entries(values)) {
      const prop = findColumn(database, name)
      if (prop.type === 'title') title = raw === null ? '' : String(raw)
      else cells[prop.id] = await toCell(prop, raw)
    }
    planned.push({ target, title, cells })
  }

  if (JSON.stringify(database.properties) !== JSON.stringify(original.properties)) await store.updateDatabase(database.id, { properties: database.properties })
  const results = []
  for (const { target, title, cells } of planned) {
    if (target) {
      await store.updatePage(target.id, { properties: { ...target.properties, ...cells }, ...(title !== undefined && { title }) })
      results.push({ updated: title ?? titleOf(target) })
    } else {
      const created = await store.addRow(database.id, cells, title ?? '')
      results.push({ added: pageTitle(created.title), id: created.id })
    }
  }
  return { status: 'saved', database: database.title || 'Untitled', rows: results }
}
