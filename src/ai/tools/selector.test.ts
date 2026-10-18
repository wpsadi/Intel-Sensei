import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), generateText: mocks.generate }))

import { REQUEST_TOOLS, createToolSelector } from './selector'

const catalog = Array.from({ length: 20 }, (_, i) => ({ name: `tool${i}`, description: `Does thing ${i}.` }))
const model = {} as LanguageModel
const picks = (...names: string[]) => mocks.generate.mockResolvedValue({ text: JSON.stringify(names), usage: {} })
const make = (extra: Partial<Parameters<typeof createToolSelector>[0]> = {}) =>
  createToolSelector({ model, catalog, alwaysInclude: ['tool0'], max: 5, ...extra })

beforeEach(() => {
  mocks.generate.mockReset()
})

describe('tool selector', () => {
  it('asks the model once when the selection is started early and the first step then needs it', async () => {
    picks('tool3', 'tool4')
    const selector = make()
    selector.prefetch('draw a chart')
    // The first step arrives while the choice is still being made, and shares that call.
    const tools = await selector.activeTools('draw a chart')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(tools).toEqual(['tool0', 'tool3', 'tool4', REQUEST_TOOLS])
  })

  it('starts the model call at prefetch, before any step asks for it', async () => {
    picks('tool1')
    make().prefetch('hello')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it('still picks on the first step when nothing was started early, and reuses the set after', async () => {
    picks('tool2')
    const selector = make()
    expect(await selector.activeTools('hi')).toEqual(['tool0', 'tool2', REQUEST_TOOLS])
    await selector.activeTools('hi again')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it('asks again for a steering message and keeps what was chosen before', async () => {
    picks('tool2')
    const selector = make()
    await selector.activeTools('first')
    picks('tool7')
    expect(await selector.activeTools('now something else', true)).toEqual(['tool0', 'tool2', 'tool7', REQUEST_TOOLS])
    expect(mocks.generate).toHaveBeenCalledTimes(2)
  })

  it('does nothing for a small toolbox', async () => {
    const selector = make({ catalog: catalog.slice(0, 5) })
    selector.prefetch('hi')
    expect(selector.enabled).toBe(false)
    expect(await selector.activeTools('hi')).toBeUndefined()
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('offers every tool when the choice fails, and never blocks the agent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.generate.mockImplementation(async () => {
      throw new Error('rate limited')
    })
    const selector = make()
    selector.prefetch('hi')
    expect(await selector.activeTools('hi')).toBeUndefined()
  })

  it('passes the fast-model options and the request to the model call', async () => {
    picks('tool1')
    const providerOptions = { google: { thinkingConfig: { thinkingLevel: 'minimal' } } }
    await make({ providerOptions }).activeTools('plot sales')
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ providerOptions, prompt: expect.stringContaining('plot sales') }))
  })
})
