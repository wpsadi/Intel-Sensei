import type { LiveServerMessage, Session } from '@google/genai'
import { type Tool, jsonSchema, tool } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { LiveCall, toolDeclarations } from './call'

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

function mockAudio(call: LiveCall) {
  const sources: { onended: (() => void) | null; stop: ReturnType<typeof vi.fn> }[] = []
  const stopMic = vi.fn()
  const closeInput = vi.fn(async () => {})
  const closeOutput = vi.fn(async () => {})
  Object.assign(call, {
    mic: { getTracks: () => [{ stop: stopMic }] },
    inputContext: { close: closeInput },
    outputContext: {
      close: closeOutput,
      currentTime: 0,
      destination: {},
      createBuffer: () => ({ duration: 0.2, copyToChannel: vi.fn() }),
      createBufferSource: () => {
        const source = { onended: null, stop: vi.fn(), connect: vi.fn(), start: vi.fn() }
        sources.push(source)
        return source
      },
    },
  })
  return { sources, stopMic, closeInput, closeOutput }
}

const endRequest = { toolCall: { functionCalls: [{ id: 'end', name: 'endCall', args: {} }] } }
const goodbyeAudio = {
  serverContent: {
    outputTranscription: { text: 'Achha bhai, bye!' },
    modelTurn: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] },
  },
}

describe('ending a call from the model', () => {
  it('asks for a goodbye and waits for every audio chunk to finish playing before hanging up', async () => {
    const { call, session, receive, finish, signal, onChange, onTranscript, execute } = setup()
    const { sources, stopMic, closeInput, closeOutput } = mockAudio(call)
    receive({ ...endRequest, serverContent: { turnComplete: true } })
    expect(signal()?.aborted).toBe(true)
    expect(session.close).not.toHaveBeenCalled()
    expect(session.sendToolResponse.mock.lastCall?.[0].functionResponses[0]).toMatchObject({
      name: 'endCall',
      response: { output: { instruction: expect.stringContaining('goodbye') } },
    })
    expect(session.sendToolResponse.mock.lastCall?.[0].functionResponses[1]).toMatchObject({
      id: 'task',
      name: 'deepAnswer',
      willContinue: false,
      scheduling: 'SILENT',
      response: { error: expect.stringContaining('ending') },
    })
    // Completing the tool-calling turn must not hang up before the farewell response arrives.
    receive({ serverContent: { turnComplete: true } })
    expect(session.close).not.toHaveBeenCalled()
    receive(goodbyeAudio)
    receive({ serverContent: { modelTurn: goodbyeAudio.serverContent.modelTurn, turnComplete: true } })
    expect(onTranscript).toHaveBeenCalledWith('assistant', 'Achha bhai, bye!')
    expect(session.close).not.toHaveBeenCalled()
    sources[0].onended!()
    expect(session.close).not.toHaveBeenCalled()
    sources[1].onended!()
    await settle()
    expect(session.close).toHaveBeenCalledOnce()
    expect(stopMic).toHaveBeenCalledOnce()
    expect(closeInput).toHaveBeenCalledOnce()
    expect(closeOutput).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('idle', undefined)
    expect(execute).toHaveBeenCalledOnce()

    finish('Late result')
    await settle()
    call.reportToolProgress('task', progress)
    receive(endRequest)
    expect(session.sendToolResponse).toHaveBeenCalledOnce()
    expect(session.close).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('waits for turn completion if audio finishes between streamed chunks', async () => {
    const { call, session, receive } = setup()
    const { sources } = mockAudio(call)
    receive(endRequest)
    receive(goodbyeAudio)
    sources[0].onended!()
    expect(session.close).not.toHaveBeenCalled()
    receive({ serverContent: { turnComplete: true } })
    await settle()
    expect(session.close).toHaveBeenCalledOnce()
  })

  it('lets the End button disconnect immediately during the goodbye', async () => {
    vi.useFakeTimers()
    const { call, session, receive, onChange } = setup()
    const { sources } = mockAudio(call)
    receive(endRequest)
    receive(goodbyeAudio)
    await call.stop()
    expect(sources[0].stop).toHaveBeenCalledOnce()
    expect(session.close).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(20000)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('closes safely if the farewell audio never arrives', async () => {
    vi.useFakeTimers()
    const { session, receive, onChange } = setup()
    receive(endRequest)
    await vi.advanceTimersByTimeAsync(19999)
    expect(session.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(session.close).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('idle', undefined)
  })

  it('does not hang up just because a transcript contains cut or bye', async () => {
    const { call, session, receive } = setup()
    receive({ serverContent: { inputTranscription: { text: 'Do not cut the call, I am not saying bye yet.' }, turnComplete: true } })
    expect(session.close).not.toHaveBeenCalled()
    await call.stop()
  })

  it('answers every tool in a hangup batch without starting more work', async () => {
    const { call, session, receive, execute } = setup()
    receive({ toolCall: { functionCalls: [...endRequest.toolCall.functionCalls, { id: 'extra', name: 'deepAnswer', args: {} }] } })
    expect(execute).toHaveBeenCalledOnce()
    expect(session.sendToolResponse.mock.lastCall?.[0].functionResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'end', name: 'endCall' }),
        expect.objectContaining({ id: 'extra', response: { error: expect.stringContaining('ending') } }),
        expect.objectContaining({ id: 'task', willContinue: false }),
      ]),
    )
    await call.stop()
  })
})

describe('live tool declarations', () => {
  it('accepts zod and plain JSON Schema tools, and marks background tools', async () => {
    const declared = await toolDeclarations(
      {
        zodTool: tool({ description: 'zod', inputSchema: z.object({ sceneId: z.string() }), execute: async () => 'ok' }) as Tool,
        jsonTool: tool({
          description: 'json',
          inputSchema: jsonSchema({ type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }),
          execute: async () => 'ok',
        }) as Tool,
      },
      ['jsonTool'],
    )
    const byName = Object.fromEntries(declared.map((item) => [item.name, item]))
    expect(byName.zodTool.parametersJsonSchema).toMatchObject({ type: 'object', properties: { sceneId: { type: 'string' } } })
    expect(byName.jsonTool.parametersJsonSchema).toMatchObject({ type: 'object', properties: { query: { type: 'string' } }, required: ['query'] })
    expect(byName.jsonTool.parametersJsonSchema).not.toHaveProperty('$schema')
    expect(byName.jsonTool).toHaveProperty('behavior', 'NON_BLOCKING')
    expect(byName.zodTool).not.toHaveProperty('behavior')
  })
})
