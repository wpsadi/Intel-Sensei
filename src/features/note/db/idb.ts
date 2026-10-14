import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { secureDb } from '@/features/vault/secure-db'

import type { Chat, ChatMessage, Database, Page, Person, Setting, SyncedBlock, View, WidgetChat } from './types'

interface SNoteSchema extends DBSchema {
  pages: { key: string; value: Page; indexes: { byParent: string } }
  databases: { key: string; value: Database }
  views: { key: string; value: View; indexes: { byOwner: string; byDatabase: string } }
  synced: { key: string; value: SyncedBlock }
  people: { key: string; value: Person }
  settings: { key: string; value: Setting }
  chats: { key: string; value: Chat }
  chatMessages: { key: string; value: ChatMessage; indexes: { byChat: string } }
  widgetChats: { key: string; value: WidgetChat }
}

export type StoreName = 'pages' | 'databases' | 'views' | 'synced' | 'people' | 'settings' | 'chats' | 'chatMessages' | 'widgetChats'

const DB_NAME = 'snote'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase<SNoteSchema>> | null = null

export function getDb() {
  dbPromise ??= openDB<SNoteSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const pages = db.createObjectStore('pages', { keyPath: 'id' })
        pages.createIndex('byParent', 'parentId')
        db.createObjectStore('databases', { keyPath: 'id' })
        const views = db.createObjectStore('views', { keyPath: 'id' })
        views.createIndex('byOwner', 'ownerId')
        views.createIndex('byDatabase', 'databaseId')
        db.createObjectStore('synced', { keyPath: 'id' })
        db.createObjectStore('people', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      if (oldVersion < 2) {
        db.createObjectStore('chats', { keyPath: 'id' })
        const messages = db.createObjectStore('chatMessages', { keyPath: 'id' })
        messages.createIndex('byChat', 'chatId')
      }
      if (oldVersion < 3) db.createObjectStore('widgetChats', { keyPath: 'id' })
    },
  }).then((db) => secureDb(db, DB_NAME))
  return dbPromise
}

/* ---------- change notifications (same tab + other tabs) ---------- */

type Listener = (store: StoreName, id: string) => void
const listeners = new Set<Listener>()
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('snote-changes')

channel?.addEventListener('message', (event: MessageEvent<{ store: StoreName; id: string }>) => {
  listeners.forEach((fn) => fn(event.data.store, event.data.id))
})

export function notify(store: StoreName, id: string) {
  listeners.forEach((fn) => fn(store, id))
  channel?.postMessage({ store, id })
}

export function subscribe(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const uid = () => crypto.randomUUID()
