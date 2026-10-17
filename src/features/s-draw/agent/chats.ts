import { and, desc, eq } from 'drizzle-orm'

import { sdrawChats } from '@/db/schema'

import { sdrawChatsStore } from '../s-draw.db'
import type { IDrawChat } from '../s-draw.types'

export const drawChats = {
  all: (fileId: string) => sdrawChatsStore.list({ where: eq(sdrawChats.fileId, fileId), orderBy: [desc(sdrawChats.updatedAt)] }),
  get: async (fileId: string, id: string) =>
    (await sdrawChatsStore.list({ where: and(eq(sdrawChats.fileId, fileId), eq(sdrawChats.id, id)), limit: 1 }))[0],
  put: async (chat: IDrawChat) => {
    const existing = await sdrawChatsStore.get(chat.id)
    if (existing && existing.fileId !== chat.fileId) throw new Error('This conversation belongs to another drawing file')
    await sdrawChatsStore.put(chat)
  },
  remove: (fileId: string, id: string) => sdrawChatsStore.removeWhere(and(eq(sdrawChats.fileId, fileId), eq(sdrawChats.id, id))!),
}
