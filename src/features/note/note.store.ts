import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import { type StoreName, subscribe } from './db/idb'
import { databasesRepo, pagesRepo, peopleRepo, settingsRepo, syncedRepo, viewsRepo } from './db/repo'
import type { Database, Page, ParentType, Person, PropertyValue, View, ViewType } from './db/types'

/**
 * In-memory copy of the notes data. IndexedDB stays the source of truth:
 * every write goes through an action here, and the matching collection is
 * re-read whenever `notify` reports a change (same tab or another tab).
 */
interface INoteStore {
  /** False until the first load from IndexedDB finishes. Gate UI on this. */
  ready: boolean
  pages: Record<string, Page>
  databases: Record<string, Database>
  views: Record<string, View>
  people: Person[]
  settings: Record<string, string>
  /** Bumped when page content is rewritten outside the editor, so an open editor remounts with it. */
  contentRevision: Record<string, number>

  refresh(store: StoreName): Promise<void>

  createPage(input: Partial<Page> & { parentId: string | null; parentType: ParentType }): Promise<Page>
  updatePage(id: string, patch: Partial<Omit<Page, 'id'>>): Promise<void>
  setPageProperty(id: string, propertyId: string, value: PropertyValue): Promise<void>
  duplicatePage(id: string): Promise<Page | undefined>
  movePage(id: string, parentId: string | null): Promise<void>
  setPageTrashed(id: string, trashed: boolean): Promise<void>
  destroyPage(id: string): Promise<void>

  createDatabase(pageId: string, title?: string, viewType?: ViewType): Promise<Database>
  createFullPageDatabase(parentId: string | null, parentType: ParentType): Promise<{ page: Page; database: Database }>
  updateDatabase(id: string, patch: Partial<Omit<Database, 'id'>>): Promise<void>
  addRow(databaseId: string, properties?: Record<string, PropertyValue>, title?: string): Promise<Page>

  createView(databaseId: string, ownerId: string, type: ViewType): Promise<View>
  updateView(id: string, patch: Partial<Omit<View, 'id'>>): Promise<void>
  removeView(view: View): Promise<void>

  createPerson(name: string): Promise<Person>

  setSetting(key: string, value: string): Promise<void>

  putSynced(id: string, content: string): Promise<void>

  reloadContent(id: string): void
}

const STORES: StoreName[] = ['pages', 'databases', 'views', 'people', 'settings']

/** Latest request per collection wins, so a slow read cannot overwrite a newer one. */
const tickets: Partial<Record<StoreName, number>> = {}

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((row) => [row.id, row]))

export const useNoteStore = create<INoteStore>()(
  immer((set) => ({
    ready: false,
    pages: {},
    databases: {},
    views: {},
    people: [],
    settings: {},
    contentRevision: {},

    async refresh(store) {
      const ticket = (tickets[store] ?? 0) + 1
      tickets[store] = ticket
      const apply = (update: (draft: INoteStore) => void) => {
        if (tickets[store] === ticket) set(update)
      }
      switch (store) {
        case 'pages': {
          const rows = await pagesRepo.all()
          apply((s) => {
            s.pages = byId(rows)
          })
          break
        }
        case 'databases': {
          const rows = await databasesRepo.all()
          apply((s) => {
            s.databases = byId(rows)
          })
          break
        }
        case 'views': {
          const rows = await viewsRepo.all()
          apply((s) => {
            s.views = byId(rows)
          })
          break
        }
        case 'people': {
          const rows = await peopleRepo.all()
          apply((s) => {
            s.people = rows
          })
          break
        }
        case 'settings': {
          const rows = await settingsRepo.all()
          apply((s) => {
            s.settings = rows
          })
          break
        }
      }
    },

    async createPage(input) {
      const page = await pagesRepo.create(input)
      return page
    },

    async updatePage(id, patch) {
      await pagesRepo.update(id, patch)
    },

    async setPageProperty(id, propertyId, value) {
      await pagesRepo.setProperty(id, propertyId, value)
    },

    async duplicatePage(id) {
      return pagesRepo.duplicate(id)
    },

    async movePage(id, parentId) {
      await pagesRepo.move(id, parentId)
    },

    async setPageTrashed(id, trashed) {
      await pagesRepo.setTrashed(id, trashed)
    },

    async destroyPage(id) {
      await pagesRepo.destroy(id)
    },

    async createDatabase(pageId, title, viewType) {
      return databasesRepo.create(pageId, title, viewType)
    },

    async createFullPageDatabase(parentId, parentType) {
      return databasesRepo.createFullPage(parentId, parentType)
    },

    async updateDatabase(id, patch) {
      await databasesRepo.update(id, patch)
    },

    async addRow(databaseId, properties, title) {
      return databasesRepo.addRow(databaseId, properties, title)
    },

    async createView(databaseId, ownerId, type) {
      return viewsRepo.create(databaseId, ownerId, type)
    },

    async updateView(id, patch) {
      await viewsRepo.update(id, patch)
    },

    async removeView(view) {
      await viewsRepo.remove(view)
    },

    async createPerson(name) {
      return peopleRepo.create(name)
    },

    async setSetting(key, value) {
      await settingsRepo.set(key, value)
    },

    async putSynced(id, content) {
      await syncedRepo.put({ id, content })
    },

    reloadContent(id) {
      set((s) => {
        s.contentRevision[id] = (s.contentRevision[id] ?? 0) + 1
      })
    },
  })),
)

/* ------------------------------ selectors ------------------------------ */

/** Ancestor chain from the workspace root down to (and including) the page. */
export function selectAncestry(state: Pick<INoteStore, 'pages' | 'databases'>, id: string | undefined) {
  const chain: Page[] = []
  let cursor = id ? state.pages[id] : undefined
  while (cursor) {
    chain.unshift(cursor)
    if (cursor.parentType === 'workspace' || !cursor.parentId) break
    if (cursor.parentType === 'database') {
      const database = state.databases[cursor.parentId]
      cursor = database ? state.pages[database.pageId] : undefined
    } else {
      cursor = state.pages[cursor.parentId]
    }
  }
  return chain
}

/** Pages under a parent (or workspace roots when `parentId` is null), trash excluded, in display order. */
export function selectChildren(state: Pick<INoteStore, 'pages'>, parentId: string | null) {
  return Object.values(state.pages)
    .filter((page) => !page.trashed && (parentId ? page.parentId === parentId : page.parentType === 'workspace'))
    .sort((a, b) => a.order - b.order)
}

/* ------------------------------- sync ------------------------------- */

let started = false

/** Loads every collection once and keeps it in sync with IndexedDB. Safe to call more than once. */
export function startNoteSync() {
  if (started) return
  started = true
  subscribe((store) => {
    if (STORES.includes(store)) void useNoteStore.getState().refresh(store)
  })
  // One failing collection must not leave the whole app stuck on "loading", so always mark ready.
  Promise.allSettled(STORES.map((store) => useNoteStore.getState().refresh(store))).then((results) => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') console.error(`Failed to load ${STORES[index]}`, result.reason)
    })
    useNoteStore.setState({ ready: true })
  })
}
