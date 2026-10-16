import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

import type { Chat, ChatMessage, Database, Page, Person, Setting, SyncedBlock, View, WidgetChat } from './types'

/** S-Note's and Ask Sensei's tables. `repo.ts` is the API the app uses; this is where the rows are described. */
export const pagesStore = recordStore<Page>(t.notePages, { key: 'id', columns: (p) => ({ parentId: p.parentId }) })
export const databasesStore = recordStore<Database>(t.noteDatabases, { key: 'id' })
export const viewsStore = recordStore<View>(t.noteViews, {
  key: 'id',
  columns: (v) => ({ ownerId: v.ownerId, databaseId: v.databaseId }),
})
export const syncedStore = recordStore<SyncedBlock>(t.noteSynced, { key: 'id' })
export const peopleStore = recordStore<Person>(t.notePeople, { key: 'id' })
export const settingsStore = recordStore<Setting>(t.noteSettings, { key: 'key' })
export const chatsStore = recordStore<Chat>(t.noteChats, { key: 'id', columns: (c) => ({ updatedAt: c.updatedAt }) })
export const chatMessagesStore = recordStore<ChatMessage>(t.noteChatMessages, {
  key: 'id',
  columns: (m) => ({ chatId: m.chatId, createdAt: m.createdAt }),
})
export const widgetChatsStore = recordStore<WidgetChat>(t.noteWidgetChats, { key: 'id', columns: (c) => ({ updatedAt: c.updatedAt }) })
