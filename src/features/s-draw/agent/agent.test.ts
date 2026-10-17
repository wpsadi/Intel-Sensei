import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  put: vi.fn().mockResolvedValue(undefined),
  stream: vi.fn(),
  browserCall: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"updated":1}' }] }),
  sandbox: vi.fn().mockReturnValue({}),
  release: vi.fn(),
  fileId: 'file-a',
}))

vi.mock('../s-draw.store', () => ({ useDrawStore: { getState: () => ({ fileId: mocks.fileId }) } }))
vi.mock('./chats', () => ({ drawChats: { put: mocks.put } }))
vi.mock('@/ai/providers', () => ({ AI_MODELS: { chat: { provider: 'google', key: 'test', model: 'test' } }, thinkingSummary: () => ({}) }))
vi.mock('@/ai/sandbox/client', () => ({ holdSandbox: () => mocks.release }))
vi.mock('@/ai/tools/general', () => ({ GENERAL_INSTRUCTIONS: 'general tools', createGeneralTools: mocks.sandbox }))
vi.mock('@/ai/send-mode', () => ({ SEND_MODE: { value: 'queue' } }))
vi.mock('@/ai/skills/invoke', () => ({
  applySkillCommand: async (text: string) => (text.startsWith('/diagram') ? `Diagram skill: ${text}` : text),
}))
vi.mock('@/ai/skills/tools', () => ({
  SKILLS_INSTRUCTIONS: 'Skills instructions',
  createSkillTools: () => ({}),
  skillsPrompt: async () => 'Installed skills: diagram',
}))
vi.mock('./skills', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./skills')>()),
  createDrawSkillTools: () => ({}),
}))
vi.mock('@/ai/worker/client', () => ({ streamInWorker: mocks.stream }))
vi.mock('./webmcp', () => ({
  loadDrawTools: async () => [
    { name: 'sdraw_update', description: 'Edit', schema: {}, call: mocks.browserCall },
    { name: 'sdraw_capture_view', description: 'Preview', schema: {}, call: mocks.browserCall },
  ],
}))

import { SEND_MODE } from '@/ai/send-mode'
import { useSendQueue } from '@/ai/send-queue'

import { drawSandboxSession, disposeDrawSensei, sendDrawSensei, useDrawRuns } from './agent'

beforeEach(() => {
  vi.clearAllMocks()
  SEND_MODE.value = 'queue'
  useSendQueue.setState({ items: {} })
  mocks.fileId = 'file-a'
  useDrawRuns.setState({ live: {}, recent: {}, saved: 0 })
})

describe('drawing agent', () => {
  it('rejects late drawing mutations after leaving the app', async () => {
    mocks.stream.mockImplementation(async (_start, handlers) => {
      disposeDrawSensei()
      expect(() => handlers.execTool('sdraw_update', { id: 'shape-1' })).toThrow()
      return { messages: [], aborted: true }
    })
    await sendDrawSensei('Edit selected shape', null, () => 'selection shape-1', 'file-a')
    expect(mocks.browserCall).not.toHaveBeenCalled()
    expect(useDrawRuns.getState().live).toEqual({})
  })
  it('streams the configured provider with whole-file context and uses browser tools', async () => {
    mocks.stream.mockImplementation(async (start, handlers) => {
      expect(start.instructions).toContain('selected IDs: shape-1; sheet B: 400 elements')
      expect(start.instructions).toContain('Only browser WebMCP may read or mutate drawings')
      expect(start.instructions).toContain('Use sdraw_capture_view to inspect image content')
      expect(start.instructions).toContain('you MUST call it and inspect the latest result before reporting completion')
      expect(start.instructions).toContain('capture again after the final layout change')
      expect(start.tools.sdraw_capture_view.imageOutput).toBe(true)
      expect(start.tools.sdraw_update.imageOutput).toBeUndefined()
      await handlers.execTool('sdraw_update', { id: 'shape-1' })
      handlers.onPart({ type: 'text-delta', text: 'Updated selected shape.' })
      return { messages: [], aborted: false }
    })
    const select = vi.fn()
    await sendDrawSensei('Make this blue', null, () => 'selected IDs: shape-1; sheet B: 400 elements', 'file-a', select)
    expect(select).toHaveBeenCalledWith(mocks.put.mock.calls[0][0].id)
    expect(mocks.put.mock.calls[0][0].fileId).toBe('file-a')
    expect(mocks.browserCall).toHaveBeenCalledWith({ id: 'shape-1' })
    expect(mocks.sandbox).toHaveBeenCalledWith({ session: drawSandboxSession('file-a') })
    const state = useDrawRuns.getState()
    expect(state.live).toEqual({})
    expect(Object.values(state.recent)[0].messages.at(-1)?.content).toBe('Updated selected shape.')
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.put).toHaveBeenCalledTimes(2)
  })

  it('rejects drawing calls after the active file changes', async () => {
    mocks.stream.mockImplementation(async (_start, handlers) => {
      mocks.fileId = 'file-b'
      expect(() => handlers.execTool('sdraw_update', {})).toThrow('drawing file changed')
      return { messages: [], aborted: false }
    })
    await sendDrawSensei('Draw', null, () => 'file-a', 'file-a')
    expect(mocks.browserCall).not.toHaveBeenCalled()
  })

  it('preserves provider failures as visible persisted chat errors', async () => {
    mocks.stream.mockResolvedValue({ messages: [], aborted: false, error: 'Provider unavailable' })
    await sendDrawSensei('Draw a box', null, () => 'empty sheet', 'file-a')
    const state = useDrawRuns.getState()
    expect(Object.values(state.recent)[0].messages.at(-1)?.error).toBe('Provider unavailable')
    expect(state.live).toEqual({})
    expect(mocks.release).toHaveBeenCalledOnce()
  })
})

describe('drawing skills and pending input', () => {
  it('expands installed skill commands while keeping the user message unchanged', async () => {
    mocks.stream.mockImplementation(async (start) => {
      expect(start.messages[0].content).toBe('Diagram skill: /diagram draw a flow')
      expect(start.instructions).toContain('Installed skills: diagram')
      return { messages: [], aborted: false }
    })
    await sendDrawSensei('/diagram draw a flow', null, () => 'sheet', 'file-a')
    expect(Object.values(useDrawRuns.getState().recent)[0].messages[0].content).toBe('/diagram draw a flow')
  })

  it('loads the bundled diagram skill without installing it and applies its defaults', async () => {
    mocks.stream.mockImplementation(async (start) => {
      expect(start.instructions).toContain('Default SDraw skill /excalidraw-diagram')
      expect(start.instructions).toContain('Default SDraw skill /sdraw-large-drawing')
      expect(start.messages[0].content).toContain('The user ran /excalidraw-diagram')
      expect(start.messages[0].content).toContain('User request: map the checkout flow')
      return { messages: [], aborted: false }
    })
    await sendDrawSensei('/excalidraw-diagram map the checkout flow', null, () => 'sheet', 'file-a')
    expect(Object.values(useDrawRuns.getState().recent)[0].messages[0].content).toBe('/excalidraw-diagram map the checkout flow')
  })

  it('runs queued messages in order after the active reply', async () => {
    mocks.stream
      .mockImplementationOnce(async () => {
        const chat = Object.values(useDrawRuns.getState().live)[0]
        await sendDrawSensei('Second input', chat, () => 'sheet', 'file-a')
        expect(useSendQueue.getState().items[chat.id]?.[0].text).toBe('Second input')
        return { messages: [], aborted: false }
      })
      .mockResolvedValue({ messages: [], aborted: false })
    await sendDrawSensei('First input', null, () => 'sheet', 'file-a')
    expect(mocks.stream).toHaveBeenCalledTimes(2)
    const chat = Object.values(useDrawRuns.getState().recent)[0]
    expect(chat.messages.filter((message) => message.role === 'user').map((message) => message.content)).toEqual([
      'First input',
      'Second input',
    ])
    expect(useSendQueue.getState().items).toEqual({})
  })

  it('expands a steering skill and saves it when the worker accepts it', async () => {
    SEND_MODE.value = 'steer'
    mocks.stream.mockImplementation(async (_start, handlers) => {
      let accept!: () => void
      const accepted = new Promise<void>((resolve) => {
        accept = resolve
      })
      handlers.onRun({
        steer: (id: string, text: string) => {
          expect(text).toBe('Diagram skill: /diagram update')
          handlers.onPart({ type: 'steered', id })
          accept()
        },
      })
      const chat = Object.values(useDrawRuns.getState().live)[0]
      await sendDrawSensei('/diagram update', chat, () => 'sheet', 'file-a')
      await accepted
      return { messages: [], aborted: false }
    })
    await sendDrawSensei('First input', null, () => 'sheet', 'file-a')
    expect(mocks.stream).toHaveBeenCalledOnce()
    expect(
      Object.values(useDrawRuns.getState().recent)[0]
        .messages.filter((message) => message.role === 'user')
        .map((message) => message.content),
    ).toEqual(['First input', '/diagram update'])
    expect(useSendQueue.getState().items).toEqual({})
  })

  it('clears pending input when the drawing file is disposed', async () => {
    mocks.stream.mockImplementation(async () => {
      const chat = Object.values(useDrawRuns.getState().live)[0]
      await sendDrawSensei('Do not run', chat, () => 'sheet', 'file-a')
      disposeDrawSensei('file-a')
      return { messages: [], aborted: true }
    })
    await sendDrawSensei('First input', null, () => 'sheet', 'file-a')
    expect(mocks.stream).toHaveBeenCalledOnce()
    expect(useSendQueue.getState().items).toEqual({})
  })
})
