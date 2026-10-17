// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ key: 'fc-test', secrets: new Map<string, string>() }))
vi.mock('@/ai/utils/firecrawl-key', () => ({
  FIRECRAWL_KEY: {
    get value() {
      return state.key
    },
  },
}))
vi.mock('@/features/vault/secrets', () => ({
  secretGet: (key: string) => state.secrets.get(key) ?? '',
  secretSet: (key: string, value: string) => {
    state.secrets.set(key, value)
  },
}))

import { scrapePage } from '@/ai/tools/scrape'
import { searchWeb } from '@/ai/tools/search'

import { callFirecrawlMcp, closeFirecrawlMcp, createFirecrawlMcpTools, firecrawlMcpConfigured, listFirecrawlMcpTools } from './firecrawl'
import { FIRECRAWL_KEY_URL, FIRECRAWL_OAUTH_URL, createFirecrawlOAuthProvider } from './firecrawl-auth'

const tools = [
  {
    name: 'firecrawl_search',
    description: 'Search the public web',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  { name: 'firecrawl_scrape', description: 'Read a known page', inputSchema: { type: 'object', properties: { url: { type: 'string' } } } },
  { name: 'firecrawl_map', description: 'Discover URLs on a site', inputSchema: { type: 'object' } },
]
const calls: { method: string; params?: Record<string, unknown> }[] = []
let errorResult = false
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  if (init?.method === 'GET') return new Response(null, { status: 405 })
  const raw = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.text() : ''
  if (!raw) return new Response(null, { status: 202 })
  const request = JSON.parse(raw)
  calls.push(request)
  if (request.id === undefined) return new Response(null, { status: 202 })
  let result: unknown
  if (request.method === 'initialize')
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'test-firecrawl', version: '1' },
    }
  else if (request.method === 'tools/list') result = { tools }
  else if (request.method === 'tools/call') {
    const payload =
      request.params.name === 'firecrawl_search'
        ? { data: { web: [{ url: 'https://example.com', title: 'Example', description: 'Snippet' }] } }
        : { markdown: '# Example', metadata: { title: 'Example', statusCode: 200 } }
    result = errorResult
      ? { isError: true, content: [{ type: 'text', text: 'Rate limited' }] }
      : { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload }
  } else throw new Error(`Unexpected method ${request.method}`)
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'test-session' },
  })
})

beforeEach(async () => {
  await closeFirecrawlMcp()
  state.key = 'fc-test'
  state.secrets.clear()
  calls.length = 0
  errorResult = false
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  await closeFirecrawlMcp()
  vi.unstubAllGlobals()
})
const options = { toolCallId: 'test', messages: [], context: {} }

describe('shared Firecrawl MCP client', () => {
  it('uses the API-key MCP endpoint and Bearer header, sharing concurrent discovery', async () => {
    const [first, second] = await Promise.all([listFirecrawlMcpTools(), listFirecrawlMcpTools()])
    expect(first).toEqual(second)
    expect(first).toHaveLength(3)
    expect(calls.filter((call) => call.method === 'initialize')).toHaveLength(1)
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(String(request[0])).toBe(FIRECRAWL_KEY_URL)
    expect(new Headers(request[1]?.headers).get('Authorization')).toBe('Bearer fc-test')
  })

  it('uses the OAuth endpoint and saved tokens when no API key is present', async () => {
    state.key = ''
    await createFirecrawlOAuthProvider().saveTokens({ access_token: 'oauth-test', token_type: 'Bearer' })
    await listFirecrawlMcpTools()
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(String(request[0])).toBe(FIRECRAWL_OAUTH_URL)
    expect(new Headers(request[1]?.headers).get('Authorization')).toBe('Bearer oauth-test')
  })

  it('does not keep using credentials after they are removed', async () => {
    await listFirecrawlMcpTools()
    state.key = ''
    expect(firecrawlMcpConfigured()).toBe(false)
    await expect(callFirecrawlMcp('firecrawl_scrape', { url: 'https://example.com' })).rejects.toThrow('Connect Firecrawl')
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(0)
  })

  it('discovers tools by query and refuses invented tool names', async () => {
    const result = await createFirecrawlMcpTools().firecrawl_mcp_tools.execute!({ query: 'known page', offset: 0, limit: 1 }, options)
    expect(result).toMatchObject({ tools: [{ name: 'firecrawl_scrape' }], nextOffset: null })
    await expect(callFirecrawlMcp('made_up_tool', {})).rejects.toThrow('does not expose')
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(0)
  })

  it('routes existing web search and scrape tools through MCP when configured', async () => {
    expect(await searchWeb('example')).toEqual({
      text: 'Example\nhttps://example.com\nSnippet',
      sources: [{ url: 'https://example.com', title: 'Example' }],
    })
    expect(await scrapePage('https://example.com')).toEqual({ markdown: '# Example', title: 'Example', status: 200 })
    expect(calls.filter((call) => call.method === 'tools/call').map((call) => call.params)).toEqual([
      { name: 'firecrawl_search', arguments: { query: 'example', limit: 5 } },
      { name: 'firecrawl_scrape', arguments: { url: 'https://example.com', formats: ['markdown'], onlyMainContent: true } },
    ])
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith(FIRECRAWL_KEY_URL))).toBe(true)
  })

  it('propagates remote tool errors without replaying the request', async () => {
    errorResult = true
    await expect(callFirecrawlMcp('firecrawl_scrape', { url: 'https://example.com' })).rejects.toThrow('Rate limited')
    expect(calls.filter((call) => call.method === 'tools/call')).toHaveLength(1)
  })

  it('does not start a request after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(callFirecrawlMcp('firecrawl_scrape', {}, controller.signal)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
