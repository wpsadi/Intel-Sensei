import { asc, desc, eq } from 'drizzle-orm'

import { getDb } from '@/db/client'
import * as t from '@/db/schema'
import { notify, uid } from '@/features/note/db/changes'
import { chatMessagesStore, chatsStore } from '@/features/note/db/stores'
import type { Chat, ChatMessage } from '@/features/note/db/types'

export const chatsRepo = {
  /** Newest conversation first. */
  async list() {
    return chatsStore.list({ orderBy: [desc(t.noteChats.updatedAt)] })
  },

  async create(title = 'New chat') {
    const now = Date.now()
    const chat: Chat = { id: uid(), title, createdAt: now, updatedAt: now }
    await chatsStore.put(chat)
    notify('chats', chat.id)
    return chat
  },

  /** Messages of one chat, oldest first. */
  async messages(chatId: string) {
    return chatMessagesStore.list({ where: eq(t.noteChatMessages.chatId, chatId), orderBy: [asc(t.noteChatMessages.createdAt)] })
  },

  /** Adds a message and bumps the chat so it sorts to the top of the list. */
  async append(chatId: string, role: ChatMessage['role'], content: string) {
    const message = await (
      await getDb()
    ).transaction(async (tx) => {
      const chat = await chatsStore.get(chatId, tx)
      if (!chat) throw new Error(`Chat ${chatId} does not exist`)
      const now = Date.now()
      const saved: ChatMessage = { id: uid(), chatId, role, content, createdAt: now }
      await chatMessagesStore.put(saved, tx)
      await chatsStore.put({ ...chat, updatedAt: now }, tx)
      return saved
    })
    notify('chatMessages', message.id)
    return message
  },

  async rename(chatId: string, title: string) {
    const chat = await chatsStore.get(chatId)
    if (!chat) return
    await chatsStore.put({ ...chat, title })
    notify('chats', chatId)
  },

  /** Deletes a chat together with all of its messages. */
  async remove(chatId: string) {
    await (
      await getDb()
    ).transaction(async (tx) => {
      await chatMessagesStore.removeWhere(eq(t.noteChatMessages.chatId, chatId), tx)
      await chatsStore.remove(chatId, tx)
    })
    notify('chats', chatId)
  },
}
