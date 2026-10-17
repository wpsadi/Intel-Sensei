// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSendQueue } from '@/ai/send-queue'

vi.mock('@/ai/skills/skills', () => ({ useInstalledSkills: () => [{ name: 'diagram', description: 'Draw a diagram' }] }))
vi.mock('@/ai/sandbox/attachments', () => ({ warmForFiles: vi.fn() }))
vi.mock('@/features/note/db/media', () => ({ putMedia: vi.fn(), deleteMedia: vi.fn() }))
vi.mock('./use-voice-note', () => ({ useVoiceNote: () => ({ mode: 'text' }), formatElapsed: () => '' }))
vi.mock('./live-call', () => ({ useLiveCall: () => ({ state: 'idle' }) }))
vi.mock('@/features/ask-sensei/ask-sensei.store', () => ({
  useAskSenseiStore: (select: (state: unknown) => unknown) => select({ messages: { chat: [{ role: 'user', content: 'previous input' }] } }),
}))

import { ChatComposer } from './chat-composer'

beforeEach(() => {
  useSendQueue.setState({ items: {} })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback()
    return 0
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const input = () => screen.getByRole('textbox', { name: 'Message Sensei' }) as HTMLTextAreaElement
const mount = () =>
  render(
    <MemoryRouter>
      <ChatComposer chatId="chat" onChatOpened={vi.fn()} onSend={vi.fn()} streaming />
    </MemoryRouter>,
  )

describe('main chat input', () => {
  it.each([false, true])('recalls the last pending input before sent input (steer=%s)', (steer) => {
    useSendQueue.setState({ items: { chat: [{ id: 'pending', text: 'new pending input', steer }] } })
    mount()
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('new pending input')
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('previous input')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input().value).toBe('')
  })

  it('offers skills from slash without a skills button', () => {
    mount()
    fireEvent.change(input(), { target: { value: '/', selectionStart: 1 } })
    expect(screen.getByRole('option', { name: /diagram/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Choose skill' })).toBeNull()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(input().value).toBe('/diagram ')
  })
})
