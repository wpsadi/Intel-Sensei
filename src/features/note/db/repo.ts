import { desc, eq } from 'drizzle-orm'

import { getDb } from '@/db/client'
import * as t from '@/db/schema'

import { notify, uid } from './changes'
import {
  chatMessagesStore,
  chatsStore,
  databasesStore,
  pagesStore,
  peopleStore,
  settingsStore,
  syncedStore,
  viewsStore,
  widgetChatsStore,
} from './stores'
import type {
  Chat,
  ChatMessage,
  Database,
  Page,
  ParentType,
  Person,
  PropertyDef,
  PropertyValue,
  SyncedBlock,
  View,
  ViewType,
  WidgetChat,
} from './types'

export const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

/* ---------------------------------- pages --------------------------------- */

export const pagesRepo = {
  async get(id: string) {
    return pagesStore.get(id)
  },

  async all() {
    return pagesStore.list()
  },

  async children(parentId: string) {
    const rows = await pagesStore.list({ where: eq(t.notePages.parentId, parentId) })
    return rows.filter((p) => !p.trashed).sort((a, b) => a.order - b.order)
  },

  async roots() {
    const rows = await pagesStore.list()
    return rows.filter((p) => p.parentType === 'workspace' && !p.trashed).sort((a, b) => a.order - b.order)
  },

  async create(input: Partial<Page> & { parentId: string | null; parentType: ParentType }) {
    const now = Date.now()
    const page: Page = {
      id: uid(),
      kind: 'page',
      title: '',
      icon: '',
      cover: '',
      content: EMPTY_DOC,
      properties: {},
      favorite: false,
      trashed: false,
      font: 'default',
      smallText: false,
      fullWidth: false,
      locked: false,
      order: now,
      createdAt: now,
      updatedAt: now,
      ...input,
    }
    await pagesStore.put(page)
    notify('pages', page.id)
    return page
  },

  async update(id: string, patch: Partial<Omit<Page, 'id'>>) {
    const next = await (
      await getDb()
    ).transaction(async (tx) => {
      const current = await pagesStore.get(id, tx)
      if (!current) return
      const updated = { ...current, ...patch, updatedAt: Date.now() }
      await pagesStore.put(updated, tx)
      return updated
    })
    if (next) notify('pages', id)
    return next
  },

  async setProperty(id: string, propertyId: string, value: PropertyValue) {
    const page = await pagesRepo.get(id)
    if (!page) return
    return pagesRepo.update(id, { properties: { ...page.properties, [propertyId]: value } })
  },

  /** Copies a page's own document and properties (not its children) beside the original. */
  async duplicate(id: string) {
    const page = await pagesRepo.get(id)
    if (!page || page.kind !== 'page') return
    return pagesRepo.create({
      parentId: page.parentId,
      parentType: page.parentType,
      title: `${page.title || 'Untitled'} (copy)`,
      icon: page.icon,
      cover: page.cover,
      coverY: page.coverY,
      content: page.content,
      properties: page.properties,
      font: page.font,
      smallText: page.smallText,
      fullWidth: page.fullWidth,
    })
  },

  /** Re-parents a page. `parentId: null` moves it to the workspace root. */
  async move(id: string, parentId: string | null) {
    return pagesRepo.update(id, { parentId, parentType: parentId ? 'page' : 'workspace' })
  },

  /** Moves a page and all of its descendants to (or out of) the trash. */
  async setTrashed(id: string, trashed: boolean) {
    await (
      await getDb()
    ).transaction(async (tx) => {
      const queue = [id]
      while (queue.length) {
        const current = queue.pop()!
        const page = await pagesStore.get(current, tx)
        if (!page) continue
        await pagesStore.put({ ...page, trashed, updatedAt: Date.now() }, tx)
        queue.push(...(await pagesStore.keys(eq(t.notePages.parentId, current), tx)))
        if (page.databaseId) queue.push(...(await pagesStore.keys(eq(t.notePages.parentId, page.databaseId), tx)))
      }
    })
    notify('pages', id)
  },

  async destroy(id: string) {
    await (
      await getDb()
    ).transaction(async (tx) => {
      const queue = [id]
      while (queue.length) {
        const current = queue.pop()!
        const page = await pagesStore.get(current, tx)
        queue.push(...(await pagesStore.keys(eq(t.notePages.parentId, current), tx)))
        if (page?.databaseId) {
          queue.push(...(await pagesStore.keys(eq(t.notePages.parentId, page.databaseId), tx)))
          await databasesStore.remove(page.databaseId, tx)
          await viewsStore.removeWhere(eq(t.noteViews.databaseId, page.databaseId), tx)
        }
        await pagesStore.remove(current, tx)
      }
    })
    notify('pages', id)
  },

  /** Ancestor chain from the workspace root down to (and including) the page. */
  async ancestry(id: string) {
    const chain: Page[] = []
    let cursor = await pagesRepo.get(id)
    while (cursor) {
      chain.unshift(cursor)
      if (cursor.parentType === 'workspace' || !cursor.parentId) break
      if (cursor.parentType === 'database') {
        const db = await databasesRepo.get(cursor.parentId)
        cursor = db ? await pagesRepo.get(db.pageId) : undefined
      } else {
        cursor = await pagesRepo.get(cursor.parentId)
      }
    }
    return chain
  },
}

/* -------------------------------- databases ------------------------------- */

const DEFAULT_PROPERTIES = (): PropertyDef[] => [
  { id: 'title', name: 'Name', type: 'title' },
  {
    id: uid(),
    name: 'Status',
    type: 'status',
    options: [
      { id: uid(), name: 'Not started', color: 'gray' },
      { id: uid(), name: 'In progress', color: 'blue' },
      { id: uid(), name: 'Done', color: 'green' },
    ],
  },
  { id: uid(), name: 'Date', type: 'date' },
]

export const databasesRepo = {
  async get(id: string) {
    return databasesStore.get(id)
  },

  async all() {
    return databasesStore.list()
  },

  async create(pageId: string, title = '', viewType: ViewType = 'table') {
    const now = Date.now()
    const database: Database = { id: uid(), pageId, title, properties: DEFAULT_PROPERTIES(), createdAt: now, updatedAt: now }
    await databasesStore.put(database)
    await viewsRepo.create(database.id, database.id, viewType)
    notify('databases', database.id)
    return database
  },

  /** Creates a page whose whole body is a database. */
  async createFullPage(parentId: string | null, parentType: ParentType) {
    const page = await pagesRepo.create({ parentId, parentType, kind: 'database' })
    const database = await databasesRepo.create(page.id)
    await pagesRepo.update(page.id, { databaseId: database.id })
    return { page, database }
  },

  async update(id: string, patch: Partial<Omit<Database, 'id'>>) {
    const current = await databasesStore.get(id)
    if (!current) return
    await databasesStore.put({ ...current, ...patch, updatedAt: Date.now() })
    notify('databases', id)
  },

  async rows(id: string) {
    return pagesRepo.children(id)
  },

  async addRow(databaseId: string, properties: Record<string, PropertyValue> = {}, title = '') {
    return pagesRepo.create({ parentId: databaseId, parentType: 'database', properties, title })
  },
}

/* ---------------------------------- views --------------------------------- */

export const VIEW_LABELS: Record<ViewType, string> = {
  table: 'Table',
  board: 'Board',
  gallery: 'Gallery',
  list: 'List',
  feed: 'Feed',
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  timeline: 'Timeline',
  map: 'Map',
  bar_vertical: 'Vertical bar chart',
  bar_horizontal: 'Horizontal bar chart',
  line: 'Line chart',
  donut: 'Donut chart',
  number: 'Number chart',
  form: 'Form',
}

export const viewsRepo = {
  async all() {
    return viewsStore.list()
  },

  async byOwner(ownerId: string) {
    const rows = await viewsStore.list({ where: eq(t.noteViews.ownerId, ownerId) })
    return rows.sort((a, b) => a.order - b.order)
  },

  async create(databaseId: string, ownerId: string, type: ViewType) {
    const view: View = { id: uid(), databaseId, ownerId, type, name: VIEW_LABELS[type], order: Date.now() }
    await viewsStore.put(view)
    notify('views', ownerId)
    return view
  },

  async update(id: string, patch: Partial<Omit<View, 'id'>>) {
    const current = await viewsStore.get(id)
    if (!current) return
    await viewsStore.put({ ...current, ...patch })
    notify('views', current.ownerId)
  },

  async remove(view: View) {
    await viewsStore.remove(view.id)
    notify('views', view.ownerId)
  },
}

/* ------------------------------ synced blocks ------------------------------ */

export const syncedRepo = {
  async get(id: string) {
    return syncedStore.get(id)
  },

  async put(block: Omit<SyncedBlock, 'updatedAt'>) {
    await syncedStore.put({ ...block, updatedAt: Date.now() })
    notify('synced', block.id)
  },
}

/* --------------------------------- people --------------------------------- */

const PERSON_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown']

export const peopleRepo = {
  async all() {
    return peopleStore.list()
  },

  async create(name: string) {
    const person: Person = { id: uid(), name, color: PERSON_COLORS[Math.floor(Math.random() * PERSON_COLORS.length)] }
    await peopleStore.put(person)
    notify('people', person.id)
    return person
  },
}

/* -------------------------------- settings -------------------------------- */

export const settingsRepo = {
  async all() {
    const rows = await settingsStore.list()
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  },

  async get(key: string) {
    return (await settingsStore.get(key))?.value ?? ''
  },

  async set(key: string, value: string) {
    await settingsStore.put({ key, value })
    notify('settings', key)
  },
}

/* ---------------------------------- chats --------------------------------- */

export const chatsRepo = {
  async all() {
    return chatsStore.list()
  },

  async put(chat: Chat) {
    await chatsStore.put(chat)
  },

  async remove(id: string) {
    await chatsStore.remove(id)
  },
}

export const chatMessagesRepo = {
  async all() {
    return chatMessagesStore.list()
  },

  async put(message: ChatMessage) {
    await chatMessagesStore.put(message)
  },

  async removeByChat(chatId: string) {
    await chatMessagesStore.removeWhere(eq(t.noteChatMessages.chatId, chatId))
  },

  async remove(id: string) {
    await chatMessagesStore.remove(id)
  },
}

/** Chats from the floating Sensei widget, newest first. */
export const widgetChatsRepo = {
  async all() {
    return widgetChatsStore.list({ orderBy: [desc(t.noteWidgetChats.updatedAt)] })
  },

  async get(id: string) {
    return widgetChatsStore.get(id)
  },

  async put(chat: WidgetChat) {
    await widgetChatsStore.put(chat)
  },

  async remove(id: string) {
    await widgetChatsStore.remove(id)
  },
}
