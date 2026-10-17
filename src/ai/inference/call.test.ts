import type { LiveServerMessage, Session } from '@google/genai'
import { type Tool, tool } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { LiveCall } from './call'

vi.mock('@/ai/utils/gemini-key', () => ({ GEMINI_KEY: { value: '' } }))

function setup(fail = false, nonBlocking = true) {
  let finish!: (result: string) => void
  let signal: AbortSignal | undefined
  const pending = new Promise<string>((resolve) => {
    finish = resolve
  })
  const execute = vi.fn(async (_input, options) => {
    signal = options.abortSignal
    const result = await pending
    if (fail) throw new Error('Search unavailable')
    return result
  })
  const onTool = vi.fn()
  const onChange = vi.fn()
  const onTranscript = vi.fn()
  const call = new LiveCall({
    onChange,
    onTranscript,
    onTool,
    tools: { deepAnswer: tool({ inputSchema: z.object({}), execute }) as Tool },
    nonBlocking: nonBlocking ? ['deepAnswer'] : [],
  })
  const session = { sendToolResponse: vi.fn(), close: vi.fn() }
  // Deliver messages at the same boundary as the SDK's WebSocket callback, without microphone access.
  const connection = call as unknown as { session: Session; handleMessage: (message: LiveServerMessage) => void }
  connection.session = session as unknown as Session
  const receive = (message: object) => connection.handleMessage(message as LiveServerMessage)
  receive({ toolCall: { functionCalls: [{ id: 'task', name: 'deepAnswer', args: {} }] } })
  return { call, session, receive, finish, onTool, onChange, onTranscript, execute, signal: () => signal }
}

const progress = { stage: 'working' as const, summary: 'Comparing burger places.' }
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => vi.useRealTimers())

describe('live background tool progress', () => {
  it('streams progress on the same pending call, spaces speech, and closes with the final result', async () => {
    vi.useFakeTimers()
    const { call, session, finish, onTool } = setup()
    call.reportToolProgress('task', progress)
    expect(session.sendToolResponse).toHaveBeenLastCalledWith({
      functionResponses: [
        {
          id: 'task',
          name: 'deepAnswer',
          response: { output: { status: 'in_progress', ...progress } },
          willContinue: true,
          scheduling: 'WHEN_IDLE',
        },
      ],
    })
    expect(onTool).toHaveBeenCalledTimes(1)
    call.reportToolProgress('task', { stage: 'finding', summary: 'Two places have vegetarian burgers.' })
    expect(session.sendToolResponse.mock.lastCall?.[0].functionResponses[0].scheduling).toBe('SILENT')
    vi.advanceTimersByTime(6000)
    call.reportToolProgress('task', { stage: 'working', summary: 'Checking prices.' })
    expect(session.sendToolResponse.mock.lastCall?.[0].functionResponses[0].scheduling).toBe('WHEN_IDLE')

    finish('Final recommendations')
    await settle()
    expect(session.sendToolResponse).toHaveBeenLastCalledWith({
      functionResponses: [
        {
          id: 'task',
          name: 'deepAnswer',
          response: { output: 'Final recommendations' },
          willContinue: false,
          scheduling: 'WHEN_IDLE',
        },
      ],
    })
    call.reportToolProgress('task', progress)
    expect(session.sendToolResponse).toHaveBeenCalledTimes(4)
    expect(onTool.mock.lastCall?.[0].status).toBe('done')
  })

  it('finishes a failed background call after progress', async () => {
    const { call, session, finish, onTool } = setup(true)
    call.reportToolProgress('task', progress)
    finish('')
    await settle()
    expect(session.sendToolResponse.mock.lastCall?.[0].functionResponses[0]).toMatchObject({
      response: { error: 'Search unavailable' },
      willContinue: false,
    })
    expect(onTool.mock.lastCall?.[0].status).toBe('failed')
  })

  it.each(['cancel', 'stop'])('aborts work and ignores late updates after %s', async (action) => {
    const { call, session, receive, finish, signal } = setup()
    if (action === 'stop') await call.stop()
    else receive({ toolCallCancellation: { ids: ['task'] } })
    expect(signal()?.aborted).toBe(true)
    call.reportToolProgress('task', progress)
    finish('Late result')
    await settle()
    expect(session.sendToolResponse).not.toHaveBeenCalled()
  })

  it('does not send streaming responses for blocking or unknown tools', async () => {
    const { call, session, finish } = setup(false, false)
    call.reportToolProgress('task', progress)
    call.reportToolProgress('unknown', progress)
    expect(session.sendToolResponse).not.toHaveBeenCalled()
    finish('Done')
    await settle()
    expect(session.sendToolResponse.mock.lastCall?.[0].functionResponses[0]).not.toHaveProperty('willContinue')
  })
})

describe('ending a call from the model', () => {
  it('hangs up, aborts background work, and retains the final transcript', async () => {
    const { call, session, receive, finish, signal, onChange, onTranscript, execute } = setup()
    const stopMic = vi.fn()
    const stopAudio = vi.fn()
    const closeInput = vi.fn(async () => {})
    const closeOutput = vi.fn(async () => {})
    Object.assign(call, {
      mic: { getTracks: () => [{ stop: stopMic }] },
      inputContext: { close: closeInput },
      outputContext: { close: closeOutput },
      playing: new Set([{ stop: stopAudio }]),
    })
    const order: string[] = []
    onTranscript.mockImplementation(() => order.push('transcript'))
    onChange.mockImplementation(() => order.push('idle'))
    receive({
      serverContent: { outputTranscription: { text: 'Goodbye.' } },
      toolCall: {
        functionCalls: [
          { id: 'end', name: 'endCall', args: {} },
          { id: 'another-task', name: 'deepAnswer', args: {} },
        ],
      },
    })
    await settle()
    expect(session.close).toHaveBeenCalledOnce()
    expect(stopMic).toHaveBeenCalledOnce()
    expect(stopAudio).toHaveBeenCalledOnce()
    expect(closeInput).toHaveBeenCalledOnce()
    expect(closeOutput).toHaveBeenCalledOnce()
    expect(signal()?.aborted).toBe(true)
    expect(onTranscript).toHaveBeenCalledWith('assistant', 'Goodbye.')
    expect(onChange).toHaveBeenCalledWith('idle', undefined)
    expect(order).toEqual(['transcript', 'idle'])
    expect(execute).toHaveBeenCalledOnce()

    finish('Late result')
    await settle()
    call.reportToolProgress('task', progress)
    receive({ toolCall: { functionCalls: [{ id: 'end-again', name: 'endCall', args: {} }] } })
    expect(session.sendToolResponse).not.toHaveBeenCalled()
    expect(session.close).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
  })
})
