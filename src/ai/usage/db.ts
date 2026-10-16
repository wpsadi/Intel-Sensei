import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

export type UsageProvider = 'google' | 'anthropic' | 'openai'

/** One model call (or one agent step): what was sent and what came back. Cost is worked out when shown, from models.dev prices. */
export interface UsageLog {
  id: string
  at: number
  provider: UsageProvider
  model: string
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  /** Input tokens read from the provider's cache. They are part of `inputTokens` and cost less. */
  cachedTokens?: number
  /** Input tokens written to the provider's cache (Anthropic). Also part of `inputTokens`. */
  cacheWriteTokens?: number
}

export const usageStore = recordStore<UsageLog>(t.usageLogs, { key: 'id', columns: (log) => ({ at: log.at }) })
