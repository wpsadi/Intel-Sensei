import { describe, expect, it, vi } from 'vitest'

import { type TranscriptTurn, createLiveTranscript, turnExtras } from './live-transcript'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('live transcript', () => {
  it('grows one message per speaker and starts a new one when the speaker changes', async () => {
    const saved: TranscriptTurn[] = []
    const transcript = createLiveTranscript((turn) => void saved.push(turn))
    transcript.push('user', 'Hello')
    await flush()
    transcript.push('assistant', 'Hi ')
    await flush()
    transcript.push('assistant', 'there')
    await flush()
    const last = saved.at(-1)!
    expect(last).toMatchObject({ role: 'assistant', text: 'Hi there' })
    expect(saved.find((turn) => turn.role === 'user')).toMatchObject({ text: 'Hello' })
    expect(saved.find((turn) => turn.role === 'user')!.id).not.toBe(last.id)
  })

  it('keeps the same message id while a speaker continues', async () => {
    const saved: TranscriptTurn[] = []
    const transcript = createLiveTranscript((turn) => void saved.push(turn))
    transcript.push('assistant', 'a')
    await flush()
    transcript.push('assistant', 'b')
    await flush()
    expect(new Set(saved.map((turn) => turn.id)).size).toBe(1)
  })

  it('ignores blank pieces that would cut the other side in two', async () => {
    const write = vi.fn()
    const transcript = createLiveTranscript(write)
    transcript.push('user', '  ')
    transcript.push('thought', '   ')
    await flush()
    expect(write).not.toHaveBeenCalled()
    transcript.push('assistant', 'Answer')
    transcript.push('user', ' ')
    transcript.push('assistant', ' goes on')
    await flush()
    expect(write.mock.calls.at(-1)![0]).toMatchObject({ role: 'assistant', text: 'Answer goes on' })
  })

  it("keeps the thinking on Sensei's reply, trimmed, even when it comes before the first word", async () => {
    const saved: TranscriptTurn[] = []
    const transcript = createLiveTranscript((turn) => void saved.push(turn))
    transcript.push('user', 'draw a box')
    await flush()
    transcript.push('thought', '\nThe user wants ')
    transcript.push('thought', 'a box.\n')
    await flush()
    transcript.push('assistant', 'Drawing it.')
    await flush()
    const reply = saved.at(-1)!
    expect(reply).toMatchObject({ role: 'assistant', text: 'Drawing it.', reasoning: 'The user wants a box.' })
    // One reply: the thoughts and the words share a message, and the user's turn stays its own.
    expect(saved.filter((turn) => turn.role === 'assistant').every((turn) => turn.id === reply.id)).toBe(true)
    expect(saved.find((turn) => turn.role === 'user')!.id).not.toBe(reply.id)
  })

  it('shows a tool call inside the reply, where it fell in the thinking, and updates it when it ends', async () => {
    const saved: TranscriptTurn[] = []
    const transcript = createLiveTranscript((turn) => void saved.push(turn))
    transcript.push('thought', 'I will run the check. ')
    await flush()
    transcript.tool({ id: 'call-1', name: 'terminal', label: 'Ran a command', status: 'running', detail: 'sdraw check' })
    await flush()
    transcript.push('thought', 'Then fix it.')
    transcript.tool({ id: 'call-1', name: 'terminal', label: 'Ran a command', status: 'done', detail: 'no issues' })
    await flush()
    const reply = saved.at(-1)!
    expect(reply.steps).toEqual([
      expect.objectContaining({ id: 'call-1', status: 'done', detail: 'no issues', at: 'I will run the check. '.length }),
    ])
    expect(new Set(saved.map((turn) => turn.id)).size).toBe(1)
  })

  it('starts a reply for a tool call that comes while the user was the last to speak', async () => {
    const saved: TranscriptTurn[] = []
    const transcript = createLiveTranscript((turn) => void saved.push(turn))
    transcript.push('user', 'check the sheet')
    await flush()
    transcript.tool({ id: 'c', name: 'terminal', label: 'Ran a command', status: 'running' })
    await flush()
    const reply = saved.at(-1)!
    expect(reply.role).toBe('assistant')
    expect(reply.steps).toHaveLength(1)
    expect(saved.find((turn) => turn.role === 'user')!.id).not.toBe(reply.id)
  })

  it('exposes only the extras that are present, for saving into a message', () => {
    expect(turnExtras({ id: 'a', role: 'assistant', text: 'x' })).toEqual({})
    expect(turnExtras({ id: 'a', role: 'assistant', text: 'x', reasoning: 'why' })).toEqual({ reasoning: 'why' })
  })

  it('saves one at a time and skips to the latest text while a save is busy', async () => {
    let release!: () => void
    const texts: string[] = []
    let running = 0
    let overlap = false
    const transcript = createLiveTranscript(async (turn) => {
      running++
      overlap ||= running > 1
      texts.push(turn.text)
      await new Promise<void>((resolve) => (release = resolve))
      running--
    })
    transcript.push('assistant', 'a')
    await flush()
    transcript.push('assistant', 'b')
    transcript.push('assistant', 'c')
    release()
    await flush()
    release()
    await flush()
    expect(overlap).toBe(false)
    expect(texts).toEqual(['a', 'abc'])
  })

  it('keeps typed text as its own whole message', async () => {
    const saved: TranscriptTurn[] = []
    const transcript = createLiveTranscript((turn) => void saved.push(turn))
    transcript.push('user', 'spoken')
    await flush()
    transcript.push('user', 'typed one', true)
    await flush()
    transcript.push('user', 'typed two', true)
    await flush()
    expect(saved.map((turn) => turn.text)).toEqual(['spoken', 'typed one', 'typed two'])
    expect(new Set(saved.map((turn) => turn.id)).size).toBe(3)
  })

  it('survives a failing save and keeps going', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const write = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const transcript = createLiveTranscript(write)
    transcript.push('user', 'a')
    await flush()
    transcript.push('user', 'b')
    await flush()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('starts a new message after reset', async () => {
    const saved: TranscriptTurn[] = []
    const transcript = createLiveTranscript((turn) => void saved.push(turn))
    transcript.push('assistant', 'one')
    await flush()
    transcript.reset()
    transcript.push('assistant', 'two')
    await flush()
    expect(saved.map((turn) => turn.text)).toEqual(['one', 'two'])
  })
})
