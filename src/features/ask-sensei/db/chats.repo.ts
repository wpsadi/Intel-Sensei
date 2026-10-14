import { getDb, notify, uid } from '@/features/note/db/idb'
import type { Chat, ChatMessage } from '@/features/note/db/types'

export const chatsRepo = {
  /** Newest conversation first. */
  async list() {
    const rows = await (await getDb()).getAll('chats')
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  },

  async create(title = 'New chat') {
    const now = Date.now()
    const chat: Chat = { id: uid(), title, createdAt: now, updatedAt: now }
    await (await getDb()).put('chats', chat)
    notify('chats', chat.id)
    return chat
  },

  /** Messages of one chat, oldest first. */
  async messages(chatId: string) {
    const rows = await (await getDb()).getAllFromIndex('chatMessages', 'byChat', chatId)
    return rows.sort((a, b) => a.createdAt - b.createdAt)
  },

  /** Adds a message and bumps the chat so it sorts to the top of the list. */
  async append(chatId: string, role: ChatMessage['role'], content: string) {
    const db = await getDb()
    const tx = db.transaction(['chats', 'chatMessages'], 'readwrite')
    const chat = await tx.objectStore('chats').get(chatId)
    if (!chat) {
      tx.abort()
      throw new Error(`Chat ${chatId} does not exist`)
    }
    const now = Date.now()
    const message: ChatMessage = { id: uid(), chatId, role, content, createdAt: now }
    await tx.objectStore('chatMessages').put(message)
    await tx.objectStore('chats').put({ ...chat, updatedAt: now })
    await tx.done
    notify('chatMessages', message.id)
    return message
  },

  async rename(chatId: string, title: string) {
    const db = await getDb()
    const tx = db.transaction('chats', 'readwrite')
    const chat = await tx.store.get(chatId)
    if (!chat) return
    await tx.store.put({ ...chat, title })
    await tx.done
    notify('chats', chatId)
  },

  /** Deletes a chat together with all of its messages. */
  async remove(chatId: string) {
    const db = await getDb()
    const tx = db.transaction(['chats', 'chatMessages'], 'readwrite')
    const messageKeys = await tx.objectStore('chatMessages').index('byChat').getAllKeys(chatId)
    await Promise.all(messageKeys.map((key) => tx.objectStore('chatMessages').delete(key)))
    await tx.objectStore('chats').delete(chatId)
    await tx.done
    notify('chats', chatId)
  },
}
