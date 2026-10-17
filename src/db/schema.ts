import { bigint, customType, index, jsonb, pgTable, text } from 'drizzle-orm/pg-core'

import { EMBEDDING_DIMENSIONS } from '@/constants/ai'

/**
 * Every table keeps what queries need (keys, parents, sort fields) as real columns and the rest of the record in
 * `data`. With the vault encrypting, `data` is `{ "__enc": … }` and only the plain columns can be filtered on.
 */
const data = () => jsonb('data').notNull()
const time = (name: string) => bigint(name, { mode: 'number' })

/** pgvector `vector(n)`, read and written as a Float32Array. */
const vector = customType<{ data: Float32Array; driverData: string; config: { dimensions: number } }>({
  dataType: (config) => `vector(${config?.dimensions ?? EMBEDDING_DIMENSIONS})`,
  toDriver: (value) => `[${Array.from(value).join(',')}]`,
  fromDriver: (value) => new Float32Array(JSON.parse(value) as number[]),
})

/* ----------------------------------- S-Note ----------------------------------- */

export const notePages = pgTable('note_pages', { id: text('id').primaryKey(), parentId: text('parent_id'), data: data() }, (t) => [
  index('note_pages_parent').on(t.parentId),
])
export const noteDatabases = pgTable('note_databases', { id: text('id').primaryKey(), data: data() })
export const noteViews = pgTable(
  'note_views',
  { id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), databaseId: text('database_id').notNull(), data: data() },
  (t) => [index('note_views_owner').on(t.ownerId), index('note_views_database').on(t.databaseId)],
)
export const noteSynced = pgTable('note_synced', { id: text('id').primaryKey(), data: data() })
export const notePeople = pgTable('note_people', { id: text('id').primaryKey(), data: data() })
export const noteSettings = pgTable('note_settings', { key: text('key').primaryKey(), data: data() })

/* --------------------------------- Ask Sensei chats --------------------------------- */

export const noteChats = pgTable('note_chats', { id: text('id').primaryKey(), updatedAt: time('updated_at').notNull(), data: data() })
export const noteChatMessages = pgTable(
  'note_chat_messages',
  { id: text('id').primaryKey(), chatId: text('chat_id').notNull(), createdAt: time('created_at').notNull(), data: data() },
  (t) => [index('note_chat_messages_chat').on(t.chatId)],
)
export const noteWidgetChats = pgTable('note_widget_chats', {
  id: text('id').primaryKey(),
  updatedAt: time('updated_at').notNull(),
  data: data(),
})
export const terminalSessions = pgTable('terminal_sessions', { chatId: text('chat_id').primaryKey(), data: data() })

/* ------------------------------------ AI ------------------------------------ */

export const skills = pgTable('skills', { name: text('name').primaryKey(), data: data() })
export const usageLogs = pgTable('usage_logs', { id: text('id').primaryKey(), at: time('at').notNull(), data: data() }, (t) => [
  index('usage_logs_at').on(t.at),
])

export const memorySemantic = pgTable('memory_semantic', { id: text('id').primaryKey(), data: data() })
export const memoryEpisodes = pgTable(
  'memory_episodes',
  { id: text('id').primaryKey(), chatId: text('chat_id'), createdAt: time('created_at').notNull(), scope: text('scope'), data: data() },
  (t) => [
    index('memory_episodes_chat').on(t.chatId),
    index('memory_episodes_created').on(t.createdAt),
    index('memory_episodes_scope').on(t.scope),
  ],
)
export const memoryProcedures = pgTable('memory_procedures', { id: text('id').primaryKey(), data: data() })
export const memorySession = pgTable(
  'memory_session',
  { id: text('id').primaryKey(), chatId: text('chat_id').notNull(), data: data() },
  (t) => [index('memory_session_chat').on(t.chatId)],
)
/** Embeddings stay plain: pgvector cannot search ciphertext. */
export const memoryVectors = pgTable('memory_vectors', {
  key: text('key').primaryKey(),
  kind: text('kind').notNull(),
  refId: text('ref_id').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
})

/* ------------------------------------ apps ------------------------------------ */

/** The password record the vault is opened with: never encrypted, it is what unlocks everything else. */
export const profiles = pgTable('profiles', { id: text('id').primaryKey(), data: jsonb('data').notNull() })
export const sbrowseGrants = pgTable('sbrowse_grants', { id: text('id').primaryKey(), data: data() })

export const s3dDocs = pgTable('s3d_docs', { id: text('id').primaryKey(), updatedAt: time('updated_at').notNull(), data: data() })
export const s3dVersions = pgTable('s3d_versions', { id: text('id').primaryKey(), docId: text('doc_id').notNull(), data: data() }, (t) => [
  index('s3d_versions_doc').on(t.docId),
])
export const s3dFiles = pgTable(
  's3d_files',
  { id: text('id').primaryKey(), docId: text('doc_id'), lastOpenedAt: time('last_opened_at').notNull(), data: data() },
  (t) => [index('s3d_files_opened').on(t.lastOpenedAt), index('s3d_files_doc').on(t.docId)],
)
export const s3dChats = pgTable('s3d_chats', { id: text('id').primaryKey(), docId: text('doc_id').notNull(), data: data() }, (t) => [
  index('s3d_chats_doc').on(t.docId),
])
export const s3dSettings = pgTable('s3d_settings', { key: text('key').primaryKey(), data: data() })

export const sdrawFiles = pgTable('sdraw_files', { id: text('id').primaryKey(), updatedAt: time('updated_at').notNull(), data: data() })
export const sdrawChats = pgTable(
  'sdraw_chats',
  {
    id: text('id').primaryKey(),
    fileId: text('file_id')
      .notNull()
      .references(() => sdrawFiles.id, { onDelete: 'cascade' }),
    updatedAt: time('updated_at').notNull(),
    data: data(),
  },
  (t) => [index('sdraw_chats_file').on(t.fileId)],
)
export const sdrawSettings = pgTable('sdraw_settings', { key: text('key').primaryKey(), data: data() })
