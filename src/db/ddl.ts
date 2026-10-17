import { EMBEDDING_DIMENSIONS } from '@/constants/ai'

/** The tables of `schema.ts`, as SQL. Each step runs once; add a new step to change the database, never edit an old one. */
export const MIGRATIONS: string[] = [
  `
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS note_pages (id text PRIMARY KEY, parent_id text, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS note_pages_parent ON note_pages (parent_id);
  CREATE TABLE IF NOT EXISTS note_databases (id text PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS note_views (id text PRIMARY KEY, owner_id text NOT NULL, database_id text NOT NULL, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS note_views_owner ON note_views (owner_id);
  CREATE INDEX IF NOT EXISTS note_views_database ON note_views (database_id);
  CREATE TABLE IF NOT EXISTS note_synced (id text PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS note_people (id text PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS note_settings (key text PRIMARY KEY, data jsonb NOT NULL);

  CREATE TABLE IF NOT EXISTS note_chats (id text PRIMARY KEY, updated_at bigint NOT NULL, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS note_chat_messages (id text PRIMARY KEY, chat_id text NOT NULL, created_at bigint NOT NULL, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS note_chat_messages_chat ON note_chat_messages (chat_id);
  CREATE TABLE IF NOT EXISTS note_widget_chats (id text PRIMARY KEY, updated_at bigint NOT NULL, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS terminal_sessions (chat_id text PRIMARY KEY, data jsonb NOT NULL);

  CREATE TABLE IF NOT EXISTS skills (name text PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS usage_logs (id text PRIMARY KEY, at bigint NOT NULL, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS usage_logs_at ON usage_logs (at);

  CREATE TABLE IF NOT EXISTS memory_semantic (id text PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_episodes (id text PRIMARY KEY, chat_id text, created_at bigint NOT NULL, scope text, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS memory_episodes_chat ON memory_episodes (chat_id);
  CREATE INDEX IF NOT EXISTS memory_episodes_created ON memory_episodes (created_at);
  CREATE INDEX IF NOT EXISTS memory_episodes_scope ON memory_episodes (scope);
  CREATE TABLE IF NOT EXISTS memory_procedures (id text PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS memory_session (id text PRIMARY KEY, chat_id text NOT NULL, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS memory_session_chat ON memory_session (chat_id);
  CREATE TABLE IF NOT EXISTS memory_vectors (key text PRIMARY KEY, kind text NOT NULL, ref_id text NOT NULL, embedding vector(${EMBEDDING_DIMENSIONS}) NOT NULL);
  CREATE INDEX IF NOT EXISTS memory_vectors_semantic ON memory_vectors USING hnsw (embedding vector_cosine_ops) WHERE kind = 'semantic';
  CREATE INDEX IF NOT EXISTS memory_vectors_episodic ON memory_vectors USING hnsw (embedding vector_cosine_ops) WHERE kind = 'episodic';
  CREATE INDEX IF NOT EXISTS memory_vectors_procedural ON memory_vectors USING hnsw (embedding vector_cosine_ops) WHERE kind = 'procedural';
  CREATE TABLE IF NOT EXISTS profiles (id text PRIMARY KEY, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS sbrowse_grants (id text PRIMARY KEY, data jsonb NOT NULL);

  CREATE TABLE IF NOT EXISTS s3d_docs (id text PRIMARY KEY, updated_at bigint NOT NULL, data jsonb NOT NULL);
  CREATE TABLE IF NOT EXISTS s3d_versions (id text PRIMARY KEY, doc_id text NOT NULL, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS s3d_versions_doc ON s3d_versions (doc_id);
  CREATE TABLE IF NOT EXISTS s3d_files (id text PRIMARY KEY, doc_id text, last_opened_at bigint NOT NULL, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS s3d_files_opened ON s3d_files (last_opened_at);
  CREATE INDEX IF NOT EXISTS s3d_files_doc ON s3d_files (doc_id);
  CREATE TABLE IF NOT EXISTS s3d_chats (id text PRIMARY KEY, doc_id text NOT NULL, data jsonb NOT NULL);
  CREATE INDEX IF NOT EXISTS s3d_chats_doc ON s3d_chats (doc_id);
  CREATE TABLE IF NOT EXISTS s3d_settings (key text PRIMARY KEY, data jsonb NOT NULL);
  `,
  // Capabilities were added after the initial schema. Keeping this as a separate
  // migration makes existing PGlite databases pick up their HNSW index too.
  `CREATE INDEX IF NOT EXISTS memory_vectors_capability ON memory_vectors USING hnsw (embedding vector_cosine_ops) WHERE kind = 'capability';`,
]
