/**
 * The five kinds of memory, each in its own folder:
 * - semantic: facts and knowledge. Pinned facts go into every prompt, the rest are searched.
 * - episodic: things that happened, mainly the past conversations. Searched by meaning.
 * - procedural: how the user wants things done. Searched by meaning, the latest ones are in the prompt.
 * - session: notes that belong to one chat. They are in the prompt of that chat only.
 * - scratchpad: working notes for one agent loop. Never saved.
 */
export type MemoryKind = 'semantic' | 'episodic' | 'procedural' | 'session' | 'scratchpad'

/** The kinds that are searched by meaning, each with its own HNSW index. */
export type VectorKind = 'semantic' | 'episodic' | 'procedural'

/** A fact or piece of knowledge. Pinned facts are short and always relevant, such as the user's name. */
export interface SemanticFact {
  id: string
  text: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

/** Something that happened: one turn of a conversation, or an event the model wrote down. */
export interface Episode {
  id: string
  /** The chat it happened in, when there was one. */
  chatId?: string
  role: 'user' | 'assistant' | 'event'
  content: string
  createdAt: number
}

/** A way of doing something that the user wants repeated, such as "answer code questions in TypeScript". */
export interface Procedure {
  id: string
  name: string
  instructions: string
  createdAt: number
  updatedAt: number
}

/** A note that only matters inside one chat. */
export interface SessionNote {
  id: string
  chatId: string
  text: string
  createdAt: number
}

/** The embedding of a fact, episode or procedure. `kind` picks the HNSW index it belongs to. */
export interface VectorRecord {
  /** `${kind}:${refId}` */
  key: string
  kind: VectorKind
  refId: string
  vector: Float32Array
}

/** A search hit. `score` is cosine similarity, 1 is identical. For keyword search it is the share of terms found. */
export interface MemoryHit<T> {
  item: T
  score: number
}
