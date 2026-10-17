// @vitest-environment jsdom
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), key: 'gemini-key', model: vi.fn(), usage: vi.fn(), flush: vi.fn() }))
vi.mock('ai', () => ({ generateText: mocks.generate }))
vi.mock('@/ai/providers', () => ({
  AI_MODELS: { title: { provider: 'google', model: 'gemini-title' } },
  defaultModel: () => 'gemini-default',
  languageModel: mocks.model,
  minimalThinking: () => ({ google: { thinkingConfig: { thinkingLevel: 'minimal' } } }),
  providerKey: () => mocks.key,
}))
vi.mock('@/ai/usage', () => ({ recordSdkUsage: mocks.usage }))
vi.mock('@excalidraw/excalidraw', () => ({ serializeAsJSON: vi.fn() }))
vi.mock('./s-draw.db', () => ({ readDrawWorkspace: vi.fn(), writeDrawWorkspace: vi.fn() }))

import { useDrawStore } from './s-draw.store'
import { titleDrawSheet } from './sheet-title'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.key = 'gemini-key'
  mocks.generate.mockResolvedValue({ text: '“Release Pipeline”', usage: { inputTokens: 20, outputTokens: 4 } })
  mocks.flush.mockResolvedValue(undefined)
  useDrawStore.setState({
    fileId: 'file-a',
    ready: true,
    error: null,
    activeId: 'sheet-a',
    sheets: [
      {
        id: 'sheet-a',
        name: 'Sheet 1',
        createdAt: 1,
        updatedAt: 1,
        scene: {
          appState: {},
          files: {},
          elements: [{ id: 'label', type: 'text', text: 'Build → Test → Deploy', isDeleted: false } as ExcalidrawElement],
        },
      },
    ],
    flushPersistence: mocks.flush,
  })
})

describe('Gemini drawing sheet titles', () => {
  it('names a sheet from its contents using Gemini and persists the result', async () => {
    await titleDrawSheet('file-a', 'sheet-a')
    expect(mocks.model).toHaveBeenCalledWith('google', 'gemini-title', 'gemini-key')
    expect(mocks.generate.mock.calls[0][0].prompt).toContain('Build → Test → Deploy')
    expect(useDrawStore.getState().sheets[0].name).toBe('Release Pipeline')
    expect(mocks.flush).toHaveBeenCalledOnce()
    expect(mocks.usage).toHaveBeenCalledWith({ provider: 'google', model: 'gemini-title' }, { inputTokens: 20, outputTokens: 4 })
  })

  it('automatically names only a sheet that still has its default name', async () => {
    await titleDrawSheet('file-a', 'sheet-a', 'Draw a release process', true)
    await titleDrawSheet('file-a', 'sheet-a', 'Make the boxes blue', true)
    expect(mocks.generate).toHaveBeenCalledOnce()
    expect(useDrawStore.getState().sheets[0].name).toBe('Release Pipeline')
  })

  it('preserves a human rename that happens while Gemini is responding', async () => {
    mocks.generate.mockImplementationOnce(async () => {
      useDrawStore.getState().renameSheet('sheet-a', 'My diagram')
      return { text: 'AI name' }
    })
    await expect(titleDrawSheet('file-a', 'sheet-a')).rejects.toThrow('renamed')
    expect(useDrawStore.getState().sheets[0].name).toBe('My diagram')
  })

  it('preserves a manually chosen default-looking name', async () => {
    useDrawStore.getState().renameSheet('sheet-a', 'Sheet 1')
    await titleDrawSheet('file-a', 'sheet-a', 'Draw a process', true)
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('does not apply a late title to a different file', async () => {
    mocks.generate.mockImplementationOnce(async () => {
      useDrawStore.setState({ fileId: 'file-b' })
      return { text: 'AI name' }
    })
    await expect(titleDrawSheet('file-a', 'sheet-a')).rejects.toThrow('file changed')
    expect(useDrawStore.getState().sheets[0].name).toBe('Sheet 1')
  })

  it('leaves existing names intact when the key is absent or Gemini fails', async () => {
    mocks.key = ''
    await expect(titleDrawSheet('file-a', 'sheet-a')).rejects.toThrow('Gemini key')
    await titleDrawSheet('file-a', 'sheet-a', 'Draw a process', true)
    expect(mocks.generate).not.toHaveBeenCalled()
    mocks.key = 'gemini-key'
    mocks.generate.mockRejectedValueOnce(new Error('Provider unavailable'))
    await expect(titleDrawSheet('file-a', 'sheet-a')).rejects.toThrow('Provider unavailable')
    expect(useDrawStore.getState().sheets[0].name).toBe('Sheet 1')
  })
})
