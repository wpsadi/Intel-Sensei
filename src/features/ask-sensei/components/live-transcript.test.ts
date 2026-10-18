import { describe, expect, it, vi } from 'vitest'

import { type TranscriptTurn, createLiveTranscript } from './live-transcript'

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

  it('ignores thoughts and blank pieces that would cut the other side in two', async () => {
    const write = vi.fn()
    const transcript = createLiveTranscript(write)
    transcript.push('thought', 'thinking')
    transcript.push('user', '  ')
    await flush()
    expect(write).not.toHaveBeenCalled()
    transcript.push('assistant', 'Answer')
    transcript.push('user', ' ')
    transcript.push('assistant', ' goes on')
    await flush()
    expect(write.mock.calls.at(-1)![0]).toMatchObject({ role: 'assistant', text: 'Answer goes on' })
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
