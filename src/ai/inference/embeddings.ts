import { embed } from 'ai'
import { createGoogle, type GoogleEmbeddingModelOptions } from '@ai-sdk/google'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { EMBEDDING_DIMENSIONS } from '@/constants/ai'
import { recordUsage } from '@/ai/usage'

/** What the vector is for. Documents and queries are embedded differently so a query lands near its answers. */
export type EmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY'

/**
 * Gemini embeddings for text, using the saved Gemini key. Every embedding in the app goes through here,
 * as a Float32Array of `EMBEDDING_DIMENSIONS` numbers. Each method throws when no key is saved. Vectors
 * from the two methods cannot be compared, so search only against vectors made by the same one.
 */
export class EMBEDDINGS {
  /** Embeds a text with gemini-embedding-001. */
  static async embed_v1(value: string, taskType: EmbeddingTask = 'RETRIEVAL_DOCUMENT') {
    const apiKey = GEMINI_KEY.value
    if (!apiKey) throw new Error('Add your Gemini API key in Settings → AI features to use embeddings.')
    const { embedding, usage } = await embed({
      model: createGoogle({ apiKey }).embedding('gemini-embedding-001'),
      value,
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType } satisfies GoogleEmbeddingModelOptions },
    })
    void recordUsage({ provider: 'google', model: 'gemini-embedding-001', inputTokens: usage.tokens, outputTokens: 0 })
    return Float32Array.from(embedding)
  }

  /** Embeds a text with gemini-embedding-2. */
  static async embed_v2(value: string, taskType: EmbeddingTask = 'RETRIEVAL_DOCUMENT') {
    const apiKey = GEMINI_KEY.value
    if (!apiKey) throw new Error('Add your Gemini API key in Settings → AI features to use embeddings.')
    const { embedding, usage } = await embed({
      model: createGoogle({ apiKey }).embedding('gemini-embedding-2'),
      value,
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType } satisfies GoogleEmbeddingModelOptions },
    })
    void recordUsage({ provider: 'google', model: 'gemini-embedding-2', inputTokens: usage.tokens, outputTokens: 0 })
    return Float32Array.from(embedding)
  }
}
