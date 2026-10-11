import { getMemoryDb } from '../db'
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
    const notes = await (await getMemoryDb()).getAllFromIndex('session', 'byChat', chatId)
    return notes.sort((a, b) => a.createdAt - b.createdAt)
  },

  async add(chatId: string, text: string) {
    requireChat(chatId)
    const note: SessionNote = { id: crypto.randomUUID(), chatId, text: text.trim(), createdAt: Date.now() }
    await (await getMemoryDb()).put('session', note)
    return note
  },

  /** Removes a note of this chat. Returns false when the id is unknown or belongs to another chat. */
  async remove(chatId: string, id: string) {
    requireChat(chatId)
    const db = await getMemoryDb()
    const note = await db.get('session', id)
    if (!note || note.chatId !== chatId) return false
    await db.delete('session', id)
    return true
  },

  async clear(chatId: string) {
    for (const note of await sessionMemory.list(chatId)) await (await getMemoryDb()).delete('session', note.id)
  },

  /** This chat's notes as a block for the system prompt, or '' when there are none. */
  async toPrompt(chatId: string) {
    const notes = await sessionMemory.list(chatId)
    if (!notes.length) return ''
    return `Session memory (notes for this chat only):\n${notes.map((note) => `- [${note.id}] ${note.text}`).join('\n')}`
  },
}
