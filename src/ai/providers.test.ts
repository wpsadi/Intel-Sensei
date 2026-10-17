import { createOpenAI } from '@ai-sdk/openai'
import { describe, expect, it } from 'vitest'

import { thinkingSummary } from '@/ai/providers'

describe('OpenAI chat continuation', () => {
  it('persists reasoning responses so tool-loop continuations can reference them', async () => {
    let request: Record<string, unknown> = {}
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_url, init) => {
        request = JSON.parse(init?.body as string)
        return Response.json({
          id: 'resp_test',
          created_at: 0,
          model: 'gpt-5',
          output: [],
          status: 'completed',
          usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
        })
      },
    })
    const model = provider('gpt-5')
    await model.doGenerate({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Continue' }] },
      ],
      providerOptions: thinkingSummary('openai') as Parameters<typeof model.doGenerate>[0]['providerOptions'],
    })
    expect(request.reasoning).toBeUndefined()
    expect(request.store).toBe(true)
    expect(request.include).toBeUndefined()
    expect(request.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'Continue' }] },
    ])
  })
})
