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
vi.mock('@/ai/sandbox/tools', () => ({ SANDBOX_INSTRUCTIONS: 'sandbox', createSandboxTools: mocks.sandbox }))
vi.mock('@/ai/worker/client', () => ({ streamInWorker: mocks.stream }))
vi.mock('./webmcp', () => ({
  loadDrawTools: async () => [
    { name: 'sdraw_update', description: 'Edit', schema: {}, call: mocks.browserCall },
    { name: 'sdraw_capture_view', description: 'Preview', schema: {}, call: mocks.browserCall },
  ],
}))

import { drawSandboxSession, disposeDrawSensei, sendDrawSensei, useDrawRuns } from './agent'

beforeEach(() => {
  vi.clearAllMocks()
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
