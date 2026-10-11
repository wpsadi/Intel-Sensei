import type { Chat, ChatMessage, Database, Page, ParentType, Person, PropertyDef, PropertyValue, SyncedBlock, View, ViewType } from './types'
import { getDb, notify, uid } from './idb'

export const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

/* ---------------------------------- pages --------------------------------- */

export const pagesRepo = {
  async get(id: string) {
    return (await getDb()).get('pages', id)
  },

  async all() {
    return (await getDb()).getAll('pages')
  },

  async children(parentId: string) {
    const rows = await (await getDb()).getAllFromIndex('pages', 'byParent', parentId)
    return rows.filter((p) => !p.trashed).sort((a, b) => a.order - b.order)
  },

  async roots() {
    const rows = await (await getDb()).getAll('pages')
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
    await (await getDb()).put('pages', page)
    notify('pages', page.id)
    return page
  },

  async update(id: string, patch: Partial<Omit<Page, 'id'>>) {
    const db = await getDb()
    const tx = db.transaction('pages', 'readwrite')
    const current = await tx.store.get(id)
    if (!current) return
    const next = { ...current, ...patch, updatedAt: Date.now() }
    await tx.store.put(next)
    await tx.done
    notify('pages', id)
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
    const db = await getDb()
    const tx = db.transaction('pages', 'readwrite')
    const queue = [id]
    while (queue.length) {
      const current = queue.pop()!
      const page = await tx.store.get(current)
      if (!page) continue
      await tx.store.put({ ...page, trashed, updatedAt: Date.now() })
      const kids = await tx.store.index('byParent').getAllKeys(current)
      queue.push(...kids)
      if (page.databaseId) queue.push(...(await tx.store.index('byParent').getAllKeys(page.databaseId)))
    }
    await tx.done
    notify('pages', id)
  },

  async destroy(id: string) {
    const db = await getDb()
    const tx = db.transaction(['pages', 'databases', 'views'], 'readwrite')
    const pages = tx.objectStore('pages')
    const queue = [id]
    while (queue.length) {
      const current = queue.pop()!
      const page = await pages.get(current)
      queue.push(...(await pages.index('byParent').getAllKeys(current)))
      if (page?.databaseId) {
        queue.push(...(await pages.index('byParent').getAllKeys(page.databaseId)))
        await tx.objectStore('databases').delete(page.databaseId)
        const views = await tx.objectStore('views').index('byDatabase').getAllKeys(page.databaseId)
        await Promise.all(views.map((v) => tx.objectStore('views').delete(v)))
      }
      await pages.delete(current)
    }
    await tx.done
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
    return (await getDb()).get('databases', id)
  },

  async all() {
    return (await getDb()).getAll('databases')
  },

  async create(pageId: string, title = '', viewType: ViewType = 'table') {
    const now = Date.now()
    const database: Database = { id: uid(), pageId, title, properties: DEFAULT_PROPERTIES(), createdAt: now, updatedAt: now }
    await (await getDb()).put('databases', database)
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
    const db = await getDb()
    const current = await db.get('databases', id)
    if (!current) return
    await db.put('databases', { ...current, ...patch, updatedAt: Date.now() })
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
    return (await getDb()).getAll('views')
  },

  async byOwner(ownerId: string) {
    const rows = await (await getDb()).getAllFromIndex('views', 'byOwner', ownerId)
    return rows.sort((a, b) => a.order - b.order)
  },

  async create(databaseId: string, ownerId: string, type: ViewType) {
    const view: View = { id: uid(), databaseId, ownerId, type, name: VIEW_LABELS[type], order: Date.now() }
    await (await getDb()).put('views', view)
    notify('views', ownerId)
    return view
  },

  async update(id: string, patch: Partial<Omit<View, 'id'>>) {
    const db = await getDb()
    const current = await db.get('views', id)
    if (!current) return
    await db.put('views', { ...current, ...patch })
    notify('views', current.ownerId)
  },

  async remove(view: View) {
    await (await getDb()).delete('views', view.id)
    notify('views', view.ownerId)
  },
}

/* ------------------------------ synced blocks ------------------------------ */

export const syncedRepo = {
  async get(id: string) {
    return (await getDb()).get('synced', id)
  },

  async put(block: Omit<SyncedBlock, 'updatedAt'>) {
    await (await getDb()).put('synced', { ...block, updatedAt: Date.now() })
    notify('synced', block.id)
  },
}

/* --------------------------------- people --------------------------------- */

const PERSON_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'red', 'yellow', 'brown']

export const peopleRepo = {
  async all() {
    return (await getDb()).getAll('people')
  },

  async create(name: string) {
    const person: Person = { id: uid(), name, color: PERSON_COLORS[Math.floor(Math.random() * PERSON_COLORS.length)] }
    await (await getDb()).put('people', person)
    notify('people', person.id)
    return person
  },
}

/* -------------------------------- settings -------------------------------- */

export const settingsRepo = {
  async all() {
    const rows = await (await getDb()).getAll('settings')
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  },

  async get(key: string) {
    return (await (await getDb()).get('settings', key))?.value ?? ''
  },

  async set(key: string, value: string) {
    await (await getDb()).put('settings', { key, value })
    notify('settings', key)
  },
}

/* ---------------------------------- chats --------------------------------- */

export const chatsRepo = {
  async all() {
    return (await getDb()).getAll('chats')
  },

  async put(chat: Chat) {
    await (await getDb()).put('chats', chat)
  },

  async remove(id: string) {
    await (await getDb()).delete('chats', id)
  },
}

export const chatMessagesRepo = {
  async all() {
    return (await getDb()).getAll('chatMessages')
  },

  async put(message: ChatMessage) {
    await (await getDb()).put('chatMessages', message)
  },

  async removeByChat(chatId: string) {
    const tx = (await getDb()).transaction('chatMessages', 'readwrite')
    const keys = await tx.store.index('byChat').getAllKeys(chatId)
    await Promise.all(keys.map((key) => tx.store.delete(key)))
    await tx.done
  },

  async remove(id: string) {
    await (await getDb()).delete('chatMessages', id)
  },
}
