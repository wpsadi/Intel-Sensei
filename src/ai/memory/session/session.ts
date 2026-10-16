import { eq } from 'drizzle-orm'

import * as t from '@/db/schema'

import { sessionStore } from '../db'
import type { SessionNote } from '../types'

/** Every call needs a chat id: session memory never reads or writes across chats. */
function requireChat(chatId: string) {
  if (!chatId) throw new Error('Session memory needs a chat.')
}

/**
 * Session memory: notes that belong to one chat, such as the goal of the conversation or what was decided.
 * Every operation is filtered by chat id, so a chat can never see or change another chat's notes. Gone
 * when the chat is deleted.
 */
export const sessionMemory = {
  async list(chatId: string) {
    requireChat(chatId)
    const notes = await sessionStore.list({ where: eq(t.memorySession.chatId, chatId) })
    return notes.sort((a, b) => a.createdAt - b.createdAt)
  },

  async add(chatId: string, text: string) {
    requireChat(chatId)
    const note: SessionNote = { id: crypto.randomUUID(), chatId, text: text.trim(), createdAt: Date.now() }
    await sessionStore.put(note)
    return note
  },

  /** Removes a note of this chat. Returns false when the id is unknown or belongs to another chat. */
  async remove(chatId: string, id: string) {
    requireChat(chatId)
    const note = await sessionStore.get(id)
    if (!note || note.chatId !== chatId) return false
    await sessionStore.remove(id)
    return true
  },

  async clear(chatId: string) {
    requireChat(chatId)
    await sessionStore.removeWhere(eq(t.memorySession.chatId, chatId))
  },

  /** This chat's notes as a block for the system prompt, or '' when there are none. */
  async toPrompt(chatId: string) {
    const notes = await sessionMemory.list(chatId)
    if (!notes.length) return ''
    return `Session memory (notes for this chat only):\n${notes.map((note) => `- [${note.id}] ${note.text}`).join('\n')}`
  },
}
