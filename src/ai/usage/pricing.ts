import type { ProviderMap } from '@opencode-ai/models'

import { fetchProviders } from '@/ai/models-dev'

import type { UsageLog } from './db'

const CACHE_KEY = 'sensei.models_dev_prices'
const MAX_AGE = 24 * 60 * 60 * 1000

/** What a model costs, USD per million tokens. */
export interface Price {
  input: number
  output: number
  reasoning?: number
  cacheRead?: number
  cacheWrite?: number
}

type PriceTable = Record<string, Record<string, Price>>

/** Keeps only the prices of the providers the app calls, so the cached copy stays small. */
function slim(providers: ProviderMap): PriceTable {
  const table: PriceTable = {}
  for (const id of ['google', 'anthropic', 'openai']) {
    const models = providers[id]?.models ?? {}
    table[id] = {}
    for (const [name, model] of Object.entries(models)) {
      const cost = model.cost
      if (cost)
        table[id][name] = {
          input: cost.input,
          output: cost.output,
          reasoning: cost.reasoning,
          cacheRead: cost.cache_read,
          cacheWrite: cost.cache_write,
        }
    }
  }
  return table
}

function cached(): { at: number; table: PriceTable } | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
  } catch {
    return null
  }
}

let pending: Promise<PriceTable> | null = null

/** Prices from models.dev, refreshed once a day. Offline, the last copy is used, and with none every cost shows as unknown. */
export function loadPrices(): Promise<PriceTable> {
  const saved = cached()
  if (saved && Date.now() - saved.at < MAX_AGE) return Promise.resolve(saved.table)
  pending ??= fetchProviders()
    .then((providers) => {
      const table = slim(providers)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), table }))
      } catch {
        // Storage is full or blocked; the prices are just fetched again next time.
      }
      return table
    })
    .catch(() => saved?.table ?? {})
    .finally(() => {
      pending = null
    })
  return pending
}

export function priceOf(table: PriceTable, log: Pick<UsageLog, 'provider' | 'model'>): Price | undefined {
  const models = table[log.provider]
  // Providers add suffixes such as "-preview" or dates; fall back to the longest known name the model starts with.
  if (!models) return undefined
  if (models[log.model]) return models[log.model]
  const match = Object.keys(models)
    .filter((name) => log.model.startsWith(name))
    .sort((a, b) => b.length - a.length)[0]
  return match ? models[match] : undefined
}

/** USD for one log, or null when models.dev has no price for the model. */
export function costOf(table: PriceTable, log: UsageLog): number | null {
  const price = priceOf(table, log)
  if (!price) return null
  const cached = log.cachedTokens ?? 0
  const written = log.cacheWriteTokens ?? 0
  const fresh = Math.max(0, log.inputTokens - cached - written)
  // Reasoning tokens are counted inside the output tokens and, when priced apart, billed at their own rate.
  const reasoning = log.reasoningTokens ?? 0
  const plainOutput = price.reasoning !== undefined ? Math.max(0, log.outputTokens - reasoning) : log.outputTokens
  return (
    (fresh * price.input +
      cached * (price.cacheRead ?? price.input) +
      written * (price.cacheWrite ?? price.input) +
      plainOutput * price.output +
      (price.reasoning !== undefined ? reasoning * price.reasoning : 0)) /
    1_000_000
  )
}
