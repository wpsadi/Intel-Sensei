import { describe, expect, it } from 'vitest'

import { createReadChatTool, historyTail, snapshotOf } from './read-chat'

const run = (tool: ReturnType<typeof createReadChatTool>, input: { last?: number } = {}) =>
  tool.execute!(input, { toolCallId: 't', messages: [], context: {} }) as Promise<{
    messages: { role: string; text: string; sources?: { url: string }[] }[]
    note?: string
  }>

describe('readChat', () => {
  it('returns the latest messages in full, with sources from live parts and text searches', async () => {
    const turns = snapshotOf([
      { role: 'user', content: 'compare phones', searches: undefined, parts: undefined },
      {
        role: 'assistant',
        content: 'Full comparison table',
        searches: [{ query: 'a', status: 'done', sources: [{ url: 'https://a.test' }] }],
        parts: [
          { type: 'searches', searches: [{ query: 'b', status: 'done', sources: [{ url: 'https://b.test' }, { url: 'https://a.test' }] }] },
        ],
      },
    ])
    const result = await run(createReadChatTool(() => turns))
    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(result.messages[1].text).toBe('Full comparison table')
    expect(result.messages[1].sources?.map((s) => s.url)).toEqual(['https://a.test', 'https://b.test'])
  })

  it('reads the chat at call time, so answers written after the call began are found', async () => {
    const turns: { role: 'user' | 'assistant'; text: string }[] = []
    const tool = createReadChatTool(() => turns)
    expect((await run(tool)).note).toMatch(/no messages/)
    turns.push({ role: 'assistant', text: 'Deep research result' })
    expect((await run(tool)).messages[0].text).toBe('Deep research result')
  })

  it('limits how many messages it returns and skips empty ones', async () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: i % 2 ? '' : `m${i}` }))
    const result = await run(
      createReadChatTool(() => turns),
      { last: 2 },
    )
    expect(result.messages.map((m) => m.text)).toEqual(['m6', 'm8'])
  })
})

describe('historyTail', () => {
  it('keeps only the last turns, each shortened', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 ? ('assistant' as const) : ('user' as const),
      text: `${i}${'x'.repeat(500)}`,
    }))
    const lines = historyTail(turns).split('\n')
    expect(lines).toHaveLength(6)
    expect(lines[0].startsWith('User: 4')).toBe(true)
    expect(lines[0].endsWith('…')).toBe(true)
  })
})

describe('readChat with a loader that waits for storage', () => {
  it('awaits an async loader, so widgets can read their chats from the database', async () => {
    const tool = createReadChatTool(async () => [{ role: 'assistant', text: 'Saved in IndexedDB' }])
    expect((await run(tool)).messages[0].text).toBe('Saved in IndexedDB')
  })
})
