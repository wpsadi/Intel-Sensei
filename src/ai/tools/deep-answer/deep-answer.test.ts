import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chatWithSensei } from '@/ai/inference/chat'
import { writeNarration } from '@/ai/narration'
import { createProgressTool } from '@/ai/tools/progress'
import type { ChatSearch } from '@/features/note/db/types'

import { createDeepAnswerTool } from './index'

vi.mock('@/ai/inference/chat', () => ({ chatWithSensei: vi.fn() }))
vi.mock('@/ai/narration', () => ({ writeNarration: vi.fn(async () => 'Spoken recommendations') }))

beforeEach(() => vi.clearAllMocks())

function setup() {
  const onProgress = vi.fn()
  const onAnswer = vi.fn()
  const onSearches = vi.fn()
  const abort = new AbortController()
  const deepAnswer = createDeepAnswerTool({ chatId: 'chat', history: () => [], onAnswer, onProgress, onSearches })
  const run = () =>
    deepAnswer.execute!(
      { question: 'Find burger places' },
      {
        toolCallId: 'task',
        messages: [],
        context: {},
        abortSignal: abort.signal,
      },
    )
  return { onProgress, onAnswer, onSearches, abort, run }
}

describe('deep answer progress', () => {
  it('forwards search milestones and agent findings before completion while retaining the written answer', async () => {
    const { onProgress, onAnswer, onSearches, run } = setup()
    vi.mocked(chatWithSensei).mockImplementation(async (_history, onText, _reasoning, _signal, _plan, _todos, searches, scope) => {
      const search: ChatSearch = { id: 'search', query: 'burgers nearby', status: 'running' }
      searches?.([search])
      searches?.([search])
      searches?.([{ ...search, status: 'done', sources: [{ url: 'https://example.com' }] }])
      const report = createProgressTool(scope!.onProgress!)
      const finding = { stage: 'finding' as const, summary: 'Two places offer vegetarian burgers.' }
      await report.execute!(finding, { toolCallId: 'progress', messages: [], context: {} })
      await report.execute!(finding, { toolCallId: 'progress', messages: [], context: {} })
      onText('Here are')
      expect(onProgress.mock.calls).toEqual([
        ['task', { stage: 'working', summary: 'Searching the web for burgers nearby.' }],
        ['task', { stage: 'working', summary: 'The search for burgers nearby returned 1 source; the results still need to be evaluated.' }],
        ['task', finding],
      ])
      expect(writeNarration).not.toHaveBeenCalled()
      return 'Here are the recommendations'
    })
    expect(await run()).toMatchObject({ script: 'Spoken recommendations' })
    expect(onSearches).toHaveBeenCalledTimes(3)
    expect(onAnswer).toHaveBeenLastCalledWith('task', 'Here are the recommendations')
    expect(writeNarration).toHaveBeenCalledWith('Here are the recommendations')
  })

  it('reports failed searches without claiming findings', async () => {
    const { onProgress, run } = setup()
    vi.mocked(chatWithSensei).mockImplementation(async (_history, _text, _reasoning, _signal, _plan, _todos, searches) => {
      searches?.([{ query: 'burgers nearby', status: 'failed', error: 'Offline' }])
      return 'The search failed'
    })
    await run()
    expect(onProgress).toHaveBeenCalledWith('task', {
      stage: 'working',
      summary: 'The search for burgers nearby failed; no findings are available from it.',
    })
  })

  it('suppresses late callbacks and narration once the live task is aborted', async () => {
    const { onProgress, onAnswer, onSearches, abort, run } = setup()
    vi.mocked(chatWithSensei).mockImplementation(async (_history, onText, _reasoning, _signal, _plan, _todos, searches, scope) => {
      abort.abort()
      onText('Late answer')
      scope?.onProgress?.({ stage: 'finding', summary: 'Late finding' })
      searches?.([{ query: 'late', status: 'done' }])
      return 'Late answer'
    })
    await expect(run()).rejects.toThrow()
    expect(onProgress).not.toHaveBeenCalled()
    expect(onAnswer).not.toHaveBeenCalled()
    expect(onSearches).not.toHaveBeenCalled()
    expect(writeNarration).not.toHaveBeenCalled()
  })
})
