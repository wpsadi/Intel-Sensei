import { tool } from 'ai'
import { z } from 'zod'

import { FIRECRAWL_KEY } from '@/ai/utils/firecrawl-key'
import type { ChatSearch } from '@/features/note/db/types'

export interface WebSearchResult {
  /** The results as text for the model: title, link and snippet of each page. */
  text: string
  sources: { url: string; title?: string }[]
}

interface FirecrawlResult {
  url?: string
  title?: string
  description?: string
}

/**
 * Searches the web with Firecrawl. Works without a key on Firecrawl's free keyless tier, which is
 * rate-limited per IP; a key from Settings → AI providers is sent when saved. Used by the
 * search tool below.
 */
export async function searchWeb(query: string, abortSignal?: AbortSignal): Promise<WebSearchResult> {
  const apiKey = FIRECRAWL_KEY.value
  const response = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ query, limit: 5 }),
    signal: abortSignal,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.success) throw new Error(body?.error ?? `Web search failed (${response.status})`)
  const data = body.data as { web?: FirecrawlResult[]; news?: FirecrawlResult[] }
  const results = [...(data.web ?? []), ...(data.news ?? [])].filter((result): result is FirecrawlResult & { url: string } => !!result.url)
  const sources = results.map((result) => ({ url: result.url, title: result.title }))
  const text = results.length
    ? results.map((result) => `${result.title ?? result.url}\n${result.url}\n${result.description ?? ''}`.trim()).join('\n\n')
    : 'No results found.'
  return { text, sources }
}

/** Replaces the search with the same id, or adds it at the end. */
export function upsertSearch(searches: ChatSearch[], search: ChatSearch) {
  return searches.some((item) => item.id === search.id)
    ? searches.map((item) => (item.id === search.id ? search : item))
    : [...searches, search]
}

/**
 * The web search tool, shared by the chat and the live call. `onSearch` hears about each search when it
 * starts and again when it finishes or fails, always with the same id.
 */
export function createSearchTool(onSearch?: (search: ChatSearch) => void) {
  return tool({
    description: 'Search the web for current or factual information, such as news, recent events, prices or anything you are unsure of.',
    inputSchema: z.object({ query: z.string().describe('What to find out') }),
    execute: async ({ query }, { abortSignal }) => {
      const id = crypto.randomUUID()
      onSearch?.({ id, query, status: 'running' })
      try {
        const { text, sources } = await searchWeb(query, abortSignal)
        onSearch?.({ id, query, status: 'done', sources })
        return text
      } catch (error) {
        onSearch?.({ id, query, status: 'failed', error: error instanceof Error ? error.message : undefined })
        throw error
      }
    },
  })
}
