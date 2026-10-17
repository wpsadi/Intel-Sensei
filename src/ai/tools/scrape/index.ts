import { tool } from 'ai'
import { z } from 'zod'

import { callFirecrawlMcp, firecrawlMcpConfigured, firecrawlMcpData } from '@/ai/mcp/firecrawl'
import { writeSandboxFile } from '@/ai/sandbox/client'

/** Most characters one scrape reply returns, about 8k tokens. A longer page is read in pieces with `offset`. */
const REPLY_CHARS = 30_000
/** Most characters of a page kept, so a huge PDF cannot flood memory. */
const PAGE_MAX_CHARS = 2_000_000

export interface ScrapedPage {
  markdown: string
  title?: string
  status?: number
}

/**
 * Reads a page or PDF as markdown with Firecrawl, which fetches it from its own servers, so a site that blocks the
 * browser (CORS) can still be read. Works without a key on Firecrawl's keyless tier, which is rate-limited per IP; a key from Settings → AI
 * features is sent when saved.
 */
export async function scrapePage(url: string, abortSignal?: AbortSignal): Promise<ScrapedPage> {
  let data: { markdown?: string; metadata?: { title?: string; statusCode?: number } }
  if (firecrawlMcpConfigured()) {
    const result = firecrawlMcpData(
      await callFirecrawlMcp('firecrawl_scrape', { url, formats: ['markdown'], onlyMainContent: true }, abortSignal),
    )
    data = z
      .object({
        markdown: z.string().optional(),
        metadata: z.object({ title: z.string().optional(), statusCode: z.number().optional() }).optional(),
      })
      .parse(result)
  } else {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: abortSignal,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.success) throw new Error(body?.error ?? `Scrape failed (${response.status})`)
    data = body.data as typeof data
  }
  return { markdown: (data.markdown ?? '').slice(0, PAGE_MAX_CHARS), title: data.metadata?.title, status: data.metadata?.statusCode }
}

/** The reply text: the part of the page asked for, and where to continue when it was cut. */
export function formatScrape(url: string, page: ScrapedPage, offset: number, saved?: string) {
  const total = page.markdown.length
  const head = `${page.title ? `${page.title}\n` : ''}${url}${page.status && page.status >= 400 ? `\nThe site answered with ${page.status}.` : ''}`
  if (!total) return `${head}\nNo text could be read from this page. It may need a login, or be made of pictures.`
  const part = page.markdown.slice(offset, offset + REPLY_CHARS)
  const end = offset + part.length
  const notes = [
    saved && `The whole page (${total} characters) is saved as ${saved} in the sandbox: search it with grep or read it with head and tail.`,
    end < total &&
      `Showing characters ${offset}–${end} of ${total}.${saved ? '' : ` For more, call scrape again with offset ${end}, or use save_as to keep it in the sandbox.`}`,
    offset >= total && `offset ${offset} is past the end of the page (${total} characters).`,
  ].filter(Boolean)
  return [head, part, ...notes].join('\n\n')
}

/**
 * The scrape tool: reads a web page or PDF from a link as markdown. Use it where a download from the browser fails
 * because of CORS, or when only the text of a page is needed.
 */
export function createScrapeTool(session?: string) {
  return tool({
    description:
      'Reads the text of a web page or PDF from its link, as markdown, using Firecrawl. It fetches from its own servers, so it works for links the browser cannot download because of CORS errors, and for pages that need rendering. Long pages come back in pieces: continue with offset. Use save_as to keep the whole page in the sandbox as a file, then search it with the terminal.',
    inputSchema: z.object({
      url: z.string().describe('The http or https link to read'),
      offset: z.number().int().min(0).optional().describe('Character to start from, to continue a long page. Default 0'),
      save_as: z.string().optional().describe('Also save the whole page in the sandbox under this name, such as "chapter1.md"'),
    }),
    execute: async ({ url, offset, save_as }, { abortSignal }) => {
      if (!/^https?:\/\//i.test(url.trim())) throw new Error('Only http:// and https:// links can be read')
      const page = await scrapePage(url.trim(), abortSignal)
      let saved: string | undefined
      if (save_as?.trim() && page.markdown) {
        await writeSandboxFile(save_as.trim(), page.markdown, false, abortSignal, { session, source: 'ai' })
        saved = save_as.trim()
      }
      return formatScrape(url.trim(), page, offset ?? 0, saved)
    },
  })
}
