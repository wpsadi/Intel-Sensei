// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LiveCallOptions } from '@/ai/inference/call'
import { holdSandbox, mountFiles, runShellCommand, warmSandbox, writeSandboxFile } from '@/ai/sandbox/client'
import { createSandboxTools } from '@/ai/sandbox/tools'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'

import { useLiveCall } from './live-call'

const mock = vi.hoisted(() => ({ options: null as LiveCallOptions | null, release: vi.fn() }))
vi.mock('@/ai/inference/call', () => ({
  LiveCall: class {
    constructor(options: LiveCallOptions) {
      mock.options = options
    }
    async start() {
      mock.options!.onChange('live')
    }
    async stop() {
      mock.options!.onChange('idle')
    }
  },
}))
vi.mock('@/ai/sandbox/client', () => ({
  holdSandbox: vi.fn(() => mock.release),
  warmSandbox: vi.fn(),
  sandboxUnavailable: vi.fn(() => null),
  sandboxStatus: vi.fn(() => 'ready'),
  mountFiles: vi.fn(async () => []),
  runShellCommand: vi.fn(async () => ({ output: 'burger.txt\n', code: 0 })),
  writeSandboxFile: vi.fn(async (path: string) => `/home/user/${path}`),
  readSandboxFile: vi.fn(),
  importMedia: vi.fn(),
}))
vi.mock('@/ai/memory', () => ({
  MEMORY_INSTRUCTIONS: '',
  SCRATCHPAD_INSTRUCTIONS: '',
  createMemoryTool: vi.fn(() => ({})),
  createScratchpad: vi.fn(() => ({})),
  createScratchpadTool: vi.fn(() => ({})),
  disposeScratchpad: vi.fn(),
  episodicMemory: { append: vi.fn() },
  memoryPrompt: vi.fn(async () => ''),
}))
vi.mock('@/ai/skills/tools', () => ({ SKILLS_INSTRUCTIONS: '', createSkillTools: () => ({}), skillsPrompt: async () => '' }))
vi.mock('@/ai/tools/deep-answer', () => ({ DEEP_ANSWER_INSTRUCTIONS: '', createDeepAnswerTool: () => ({}) }))
vi.mock('@/ai/tools/plan', () => ({ PLAN_INSTRUCTIONS: '', createPlanTools: () => ({}) }))
vi.mock('@/ai/tools/todo', () => ({ TODO_INSTRUCTIONS: '', createTodoTools: () => ({}) }))
vi.mock('@/ai/utils/messages', () => ({ currentTodos: () => undefined, messageText: (message: { content: string }) => message.content }))
vi.mock('@/ai/utils/firecrawl-key', () => ({ FIRECRAWL_KEY: { value: '' } }))
vi.mock('@/features/note/db/changes', () => ({ uid: () => 'turn' }))
vi.mock('@/features/note/db/media', () => ({
  mediaInfo: vi.fn(),
  mediaRevision: () => 0,
  putMedia: vi.fn(),
  readMedia: vi.fn(async () => new Blob(['menu'])),
}))
vi.mock('@/features/ask-sensei/ask-sensei.store', () => ({ useAskSenseiStore: { getState: vi.fn() } }))

const run = async (name: string, input: unknown) =>
  mock.options!.tools![name].execute!(input as never, {
    toolCallId: name,
    messages: [],
    context: {},
  })

beforeEach(() => {
  vi.clearAllMocks()
  mock.options = null
})

describe('live call workspace parity', () => {
  it.each(['existing-chat', null])('shares the chat terminal and attachments when starting from %s', async (chatId) => {
    const chat = chatId ?? 'new-chat'
    const attachment = { name: 'menu.txt', src: 'snote-media:menu', type: 'text/plain' }
    const store = {
      messages: { [chat]: [{ id: 'message', role: 'user', content: 'Find burgers', attachments: [attachment] }] },
      createChat: vi.fn(async () => ({ id: chat })),
      saveCallMessage: vi.fn(async () => {}),
    }
    vi.mocked(useAskSenseiStore.getState).mockReturnValue(store as never)
    const onChatOpened = vi.fn()
    const { result, unmount } = renderHook(() => useLiveCall(chatId, onChatOpened))
    await act(() => result.current.start())

    expect(holdSandbox).toHaveBeenCalledWith(chat)
    expect(warmSandbox).toHaveBeenCalledWith(chat)
    if (!chatId) expect(onChatOpened).toHaveBeenCalledWith(chat)

    // Live's direct file write and the normal chat tools must target the same environment.
    await run('write_file', { path: 'burger.txt', content: 'Burger recommendations' })
    const normalTools = createSandboxTools({ session: chat })
    await normalTools.terminal.execute!({ command: 'ls' }, { toolCallId: 'normal', messages: [], context: {} })
    await run('terminal', { command: 'cat burger.txt' })
    expect(writeSandboxFile).toHaveBeenCalledWith('burger.txt', 'Burger recommendations', undefined, undefined, {
      session: chat,
      source: 'ai',
    })
    expect(runShellCommand).toHaveBeenCalledWith('ls', undefined, { session: chat, source: 'ai' })
    expect(runShellCommand).toHaveBeenCalledWith('cat burger.txt', undefined, { session: chat, source: 'ai' })
    expect(mountFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'menu.txt' })], undefined, chat)

    await act(() => result.current.end())
    expect(mock.release).toHaveBeenCalledOnce()
    unmount()
  })

  it('keeps the live search callback and saves scraped files in the visible chat workspace', async () => {
    const saveCallMessage = vi.fn(async () => {})
    vi.mocked(useAskSenseiStore.getState).mockReturnValue({ messages: {}, saveCallMessage } as never)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true, data: { web: [{ url: 'https://example.com', title: 'Burger menu' }] } }))
      .mockResolvedValueOnce(Response.json({ success: true, data: { markdown: 'Burger menu' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() => useLiveCall('chat', vi.fn()))
    try {
      await act(() => result.current.start())
      await run('webSearch', { query: 'burgers nearby' })
      expect(saveCallMessage).toHaveBeenLastCalledWith('chat', 'turn', 'assistant', '', undefined, {
        parts: [{ type: 'searches', searches: [expect.objectContaining({ query: 'burgers nearby', status: 'done' })] }],
        todos: undefined,
      })
      await run('scrape', { url: 'https://example.com', save_as: 'menu.md' })
      expect(writeSandboxFile).toHaveBeenCalledWith('menu.md', 'Burger menu', false, undefined, { session: 'chat', source: 'ai' })
    } finally {
      unmount()
      vi.unstubAllGlobals()
    }
  })
})
