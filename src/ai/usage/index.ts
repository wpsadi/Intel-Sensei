import { type UsageLog, getUsageDb } from './db'

export { costOf, loadPrices } from './pricing'
export type { UsageLog, UsageProvider } from './db'

/** The token counts of the AI SDK's `LanguageModelUsage`, or the parts of it we use. */
interface SdkUsage {
  inputTokens?: number
  outputTokens?: number
  outputTokenDetails?: { reasoningTokens?: number }
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }
}

export type UsageEntry = Omit<UsageLog, 'id' | 'at'>

/** Appends a call to the usage log. Never throws: tracking must not break the call it measures. */
export async function recordUsage(entry: UsageEntry) {
  if (!entry.inputTokens && !entry.outputTokens) return
  try {
    const db = await getUsageDb()
    await db.put('logs', { ...entry, id: crypto.randomUUID(), at: Date.now() })
    window.dispatchEvent(new Event('sensei-usage'))
  } catch {
    // The log is best-effort.
  }
}

/** Logs the usage the AI SDK reported for one call. */
export function recordSdkUsage(base: Pick<UsageEntry, 'provider' | 'model'>, usage: SdkUsage | undefined) {
  if (!usage) return Promise.resolve()
  return recordUsage({
    ...base,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens || undefined,
    cachedTokens: usage.inputTokenDetails?.cacheReadTokens || undefined,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens || undefined,
  })
}

export async function listUsage(): Promise<UsageLog[]> {
  return (await getUsageDb()).getAllFromIndex('logs', 'byAt')
}

export async function clearUsage() {
  await (await getUsageDb()).clear('logs')
  window.dispatchEvent(new Event('sensei-usage'))
}
