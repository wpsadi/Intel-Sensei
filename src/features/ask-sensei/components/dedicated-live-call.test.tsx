// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LiveCallOptions } from '@/ai/inference/call'

const mock = vi.hoisted(() => ({ options: null as LiveCallOptions | null, progress: vi.fn(), dead: false }))
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
    sendText() {
      return !mock.dead
    }
    reportToolProgress(id: string, progress: unknown) {
      mock.progress(id, progress)
    }
  },
}))
vi.mock('@/ai/tools/general', () => ({ createGeneralTools: () => ({}) }))

import { reportLiveProgress, useDedicatedLiveCall } from './dedicated-live-call'

beforeEach(() => {
  vi.clearAllMocks()
  mock.options = null
  mock.dead = false
})

describe('dedicated live call', () => {
  it('runs the deep answer in the background and thinks hard for tasks', async () => {
    const { result, unmount } = renderHook(() => useDedicatedLiveCall('scope'))
    await act(() => result.current.start())
    expect(mock.options!.nonBlocking).toEqual(['deepAnswer'])
    expect(mock.options!.thinkingLevel).toBe('high')
    unmount()
  })

  it('shows each tool call as a step, with the command it ran and then its result', async () => {
    const onTool = vi.fn()
    const { result, unmount } = renderHook(() => useDedicatedLiveCall('scope', { onTool }))
    await act(() => result.current.start())
    mock.options!.onTool!({ id: 'c1', name: 'terminal', args: { command: 'sdraw check' }, status: 'running' })
    mock.options!.onTool!({ id: 'c1', name: 'terminal', args: { command: 'sdraw check' }, status: 'done', result: 'no issues' })
    mock.options!.onTool!({ id: 'c2', name: 'terminal', args: { command: 'sdraw view' }, status: 'failed', error: 'canvas not ready' })
    expect(onTool).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'c1', name: 'terminal', status: 'running' }))
    expect(onTool).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'c1', status: 'done', detail: 'no issues' }))
    expect(onTool).toHaveBeenNthCalledWith(3, expect.objectContaining({ id: 'c2', status: 'failed', detail: 'canvas not ready' }))
    unmount()
  })

  it('reports a dead call instead of swallowing typed text, and ends it', async () => {
    const transcript = vi.fn()
    const { result, unmount } = renderHook(() => useDedicatedLiveCall('scope', { onTranscript: transcript }))
    await act(() => result.current.start())
    expect(result.current.sendText('hi')).toBe(true)
    mock.dead = true
    let sent = true
    await act(async () => {
      sent = result.current.sendText('hello?')
    })
    expect(sent).toBe(false)
    expect(transcript).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('idle')
    unmount()
  })

  it('passes the progress of a background tool to the call of the same session, and only while it runs', async () => {
    const { result, unmount } = renderHook(() => useDedicatedLiveCall('scope', { session: 'browser-chat' }))
    await act(() => result.current.start())
    reportLiveProgress('browser-chat', 'task', { stage: 'working', summary: 'Searching.' })
    expect(mock.progress).toHaveBeenCalledWith('task', { stage: 'working', summary: 'Searching.' })
    reportLiveProgress('another-widget', 'task', { stage: 'working', summary: 'Not mine.' })
    expect(mock.progress).toHaveBeenCalledTimes(1)
    unmount()
    reportLiveProgress('browser-chat', 'task', { stage: 'working', summary: 'After.' })
    expect(mock.progress).toHaveBeenCalledTimes(1)
  })
})
