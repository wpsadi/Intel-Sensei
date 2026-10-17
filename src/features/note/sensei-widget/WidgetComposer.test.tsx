// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSendQueue } from '@/ai/send-queue'

const mocks = vi.hoisted(() => ({ skills: [{ name: 'diagram', description: 'Draw a diagram' }] }))
vi.mock('@/ai/skills/skills', () => ({ useInstalledSkills: () => mocks.skills }))
vi.mock('@/features/ask-sensei/components/use-voice-note', () => ({
  useVoiceNote: () => ({ mode: 'text' }),
  formatElapsed: () => '',
}))
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import { WidgetComposer } from './WidgetComposer'

beforeEach(() => {
  mocks.skills = [{ name: 'diagram', description: 'Draw a diagram' }]
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
const mount = (props: Partial<Parameters<typeof WidgetComposer>[0]> = {}) =>
  render(
    <MemoryRouter>
      <WidgetComposer onSend={vi.fn()} onStop={vi.fn()} streaming={false} {...props} />
    </MemoryRouter>,
  )

describe('shared widget composer', () => {
  it('offers installed skills on slash without custom suggestions, and Enter picks before sending', () => {
    const send = vi.fn()
    mount({ onSend: send })
    fireEvent.change(input(), { target: { value: '/', selectionStart: 1 } })
    expect(screen.getByRole('option', { name: /\/diagram.*Draw a diagram/ })).toBeTruthy()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(input().value).toBe('/diagram ')
    expect(send).not.toHaveBeenCalled()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(send).toHaveBeenCalledWith('/diagram')
  })

  it('uses slash without adding a skills button', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Choose skill' })).toBeNull()
    fireEvent.change(input(), { target: { value: '/di', selectionStart: 3 } })
    expect(screen.getByRole('option', { name: /diagram/ })).toBeTruthy()
  })

  it('combines app commands and installed skills and preserves mention suggestions', () => {
    mount({
      suggest: (trigger) => ({
        title: 'Commands',
        items: trigger === '/' ? [{ id: 'goal', label: '/goal', insert: '/goal' }] : [{ id: 'box', label: 'Box', insert: '@Box' }],
      }),
    })
    fireEvent.change(input(), { target: { value: '/', selectionStart: 1 } })
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.change(input(), { target: { value: '@', selectionStart: 1 } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'Box' })).toBeTruthy()
  })

  it('shows app defaults without a misleading empty-skills row when nothing is installed', () => {
    mocks.skills = []
    mount({
      suggest: () => ({
        title: 'SDraw skills',
        items: [{ id: 'skill-sdraw-cli', label: '/sdraw-cli', insert: '/sdraw-cli' }],
      }),
    })
    fireEvent.change(input(), { target: { value: '/', selectionStart: 1 } })
    expect(screen.getByRole('option', { name: '/sdraw-cli' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /No skills yet/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Choose skill' })).toBeNull()
  })

  it.each([false, true])('recalls pending inputs in order (steer=%s) and restores the draft', (steer) => {
    useSendQueue.setState({ items: { chat: [{ id: 'pending', text: 'latest pending input', steer }] } })
    mount({ history: ['older input'], chatId: 'chat', streaming: true })
    fireEvent.change(input(), { target: { value: 'unfinished draft' } })
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('latest pending input')
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('older input')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input().value).toBe('latest pending input')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input().value).toBe('unfinished draft')
  })

  it('does not let a recalled slash command take over history navigation', () => {
    mount({ history: ['older input', '/diagram'], chatId: 'chat' })
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('/diagram')
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('older input')
  })

  it('keeps normal multiline, selection, modifier, and IME editing', () => {
    mount({ history: ['older input'] })
    fireEvent.change(input(), { target: { value: 'first\nsecond' } })
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('first\nsecond')
    input().setSelectionRange(0, 4)
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('first\nsecond')
    input().setSelectionRange(0, 0)
    fireEvent.keyDown(input(), { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(input(), { key: 'ArrowUp', isComposing: true })
    expect(input().value).toBe('first\nsecond')
  })

  it('does not recall another chat’s pending input', () => {
    useSendQueue.setState({ items: { other: [{ id: 'pending', text: 'private input', steer: true }] } })
    mount({ history: ['this chat'], chatId: 'chat' })
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('this chat')
  })

  it('recalls accepted steering messages only once after they leave the queue', () => {
    useSendQueue.setState({ items: { chat: [{ id: 'pending', text: 'steering', steer: true }] } })
    const view = mount({ history: ['first'], chatId: 'chat' })
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('steering')
    act(() => useSendQueue.setState({ items: {} }))
    view.rerender(
      <MemoryRouter>
        <WidgetComposer onSend={vi.fn()} onStop={vi.fn()} streaming history={['first', 'steering']} chatId="chat" />
      </MemoryRouter>,
    )
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('first')
  })
})
