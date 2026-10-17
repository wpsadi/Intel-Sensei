import { desc } from 'drizzle-orm'

import { whenLegacyImported } from '@/db/client'
import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

import { type IDrawChat, type IDrawFile, type IDrawWorkspace, LEGACY_DRAW_FILE_ID } from './s-draw.types'

export const sdrawFilesStore = recordStore<IDrawFile>(t.sdrawFiles, { key: 'id', columns: (file) => ({ updatedAt: file.updatedAt }) })
export const sdrawChatsStore = recordStore<IDrawChat>(t.sdrawChats, {
  key: 'id',
  columns: (chat) => ({ fileId: chat.fileId, updatedAt: chat.updatedAt }),
})
export const sdrawSettingsStore = recordStore<{ key: string; value: string }>(t.sdrawSettings, { key: 'key' })

export async function resolveDrawFileId() {
  await whenLegacyImported()
  const recent = (await sdrawSettingsStore.get('last-file-id'))?.value
  if (recent && (await sdrawFilesStore.get(recent))) return recent
  return (await sdrawFilesStore.list({ orderBy: [desc(t.sdrawFiles.updatedAt)], limit: 1 }))[0]?.id ?? crypto.randomUUID()
}

export async function readDrawWorkspace(fileId = LEGACY_DRAW_FILE_ID) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(fileId)) throw new Error('Invalid drawing file ID')
  await whenLegacyImported()
  return sdrawFilesStore.get(fileId)
}

export async function writeDrawWorkspace(workspace: IDrawWorkspace, fileId = LEGACY_DRAW_FILE_ID) {
  await sdrawFilesStore.put({ ...workspace, id: fileId, updatedAt: Date.now() })
  await sdrawSettingsStore.put({ key: 'last-file-id', value: fileId })
}
