import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { getDb, whenLegacyImported } from '@/db/client'
import { sdrawChats, sdrawFiles } from '@/db/schema'
import { vault } from '@/features/vault/vault'

import { drawChats } from './agent/chats'
import { readDrawWorkspace, resolveDrawFileId, writeDrawWorkspace } from './s-draw.db'
import type { IDrawChat, IDrawWorkspace } from './s-draw.types'

const workspace: IDrawWorkspace = { sheets: [], activeId: '', libraryItems: [] }
const chat = (id: string, fileId: string): IDrawChat => ({ id, fileId, title: id, messages: [], updatedAt: Date.now() })

describe('SDraw PGlite records', () => {
  beforeAll(() => whenLegacyImported(), 60000)

  it('persists files and scopes conversation reads and deletion by file ID', async () => {
    await writeDrawWorkspace(workspace, 'file-a')
    await writeDrawWorkspace(workspace, 'file-b')
    await drawChats.put(chat('chat-a', 'file-a'))
    await drawChats.put(chat('chat-b', 'file-b'))
    expect((await drawChats.all('file-a')).map((item) => item.id)).toEqual(['chat-a'])
    expect(await drawChats.get('file-b', 'chat-a')).toBeUndefined()
    await drawChats.remove('file-b', 'chat-a')
    expect(await drawChats.get('file-a', 'chat-a')).toMatchObject({ fileId: 'file-a' })
    await expect(drawChats.put(chat('chat-a', 'file-b'))).rejects.toThrow('another drawing file')
    expect(await readDrawWorkspace('file-a')).toMatchObject({ id: 'file-a', ...workspace })
    expect(await resolveDrawFileId()).toBe('file-b')
    const [row] = await (await getDb()).select().from(sdrawChats).where(eq(sdrawChats.id, 'chat-a'))
    expect(row.fileId).toBe('file-a')
  })

  it('enforces the file reference for conversations', async () => {
    await expect(drawChats.put(chat('orphan', 'missing-file'))).rejects.toThrow()
    expect(await drawChats.get('missing-file', 'orphan')).toBeUndefined()
  })

  it('uses the shared vault encryption for drawings and conversations', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    vault.set({ key, encrypting: true })
    try {
      await writeDrawWorkspace(workspace, 'encrypted-file')
      await drawChats.put({ ...chat('encrypted-chat', 'encrypted-file'), title: 'Private drawing conversation' })
      const db = await getDb()
      const [file] = await db.select().from(sdrawFiles).where(eq(sdrawFiles.id, 'encrypted-file'))
      const [conversation] = await db.select().from(sdrawChats).where(eq(sdrawChats.id, 'encrypted-chat'))
      expect(file.data).toHaveProperty('__enc')
      expect(conversation.data).toHaveProperty('__enc')
      expect(JSON.stringify(conversation.data)).not.toContain('Private drawing conversation')
      expect((await drawChats.get('encrypted-file', 'encrypted-chat'))?.title).toBe('Private drawing conversation')
      expect(await readDrawWorkspace('encrypted-file')).toMatchObject(workspace)
    } finally {
      vault.set({ key: null, encrypting: false })
    }
  })
})
