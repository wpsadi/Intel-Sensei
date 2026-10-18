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
vi.mock('@/features/note/db/media', () => ({ putMedia: vi.fn(async (_file: Blob, name: string) => `media:${name}`), deleteMedia: vi.fn() }))
vi.mock('@/ai/sandbox/attachments', () => ({ warmForFiles: vi.fn() }))
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
  it('shows the call button in the send slot when empty and swaps to send once there is text', () => {
    mount({ liveScope: 'scope' })
    const call = screen.getByRole('button', { name: 'Start live call' })
    expect(call.className).not.toContain('invisible')
    expect(screen.getByRole('button', { name: 'Send message' }).className).toContain('invisible')
    fireEvent.change(input(), { target: { value: 'hello' } })
    expect(screen.getByRole('button', { name: 'Start live call' }).className).toContain('invisible')
    expect(screen.getByRole('button', { name: 'Send message' }).className).not.toContain('invisible')
  })

  it('has no attach button unless the widget allows files', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Add attachment' })).toBeNull()
    cleanup()
    mount({ attachable: true })
    expect(screen.getByRole('button', { name: 'Add attachment' })).toBeTruthy()
  })

  it('attaches a pasted file, shows it by name, and sends it with the message', async () => {
    const send = vi.fn()
    mount({ onSend: send, attachable: true })
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' })
    fireEvent.paste(input(), { clipboardData: { items: [{ kind: 'file', getAsFile: () => file }], getData: () => '' } })
    expect(await screen.findByText('notes.txt')).toBeTruthy()
    // Files alone are enough to send, and the list empties once they are sent.
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(send).toHaveBeenCalledWith('', [expect.objectContaining({ name: 'notes.txt', src: 'media:notes.txt' })])
    expect(screen.queryByText('notes.txt')).toBeNull()
  })

  it('puts attach at the bottom left, in front of the page controls, and the actions at the right', () => {
    mount({ attachable: true, toolbarStart: <span data-testid="ring">ring</span> })
    const attach = screen.getByRole('button', { name: 'Add attachment' })
    const ring = screen.getByTestId('ring')
    const send = screen.getByRole('button', { name: 'Send message' })
    expect(attach.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ring.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Attach and the ring share the left group; the send button is not in it.
    expect(attach.parentElement).toBe(ring.parentElement)
    expect(attach.parentElement!.contains(send)).toBe(false)
  })

  it('keeps files that were waiting when the widget was closed, and brings them back when it opens again', async () => {
    localStorage.clear()
    const first = mount({ attachable: true, attachKey: 'note' })
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' })
    fireEvent.paste(input(), { clipboardData: { items: [{ kind: 'file', getAsFile: () => file }], getData: () => '' } })
    await screen.findByText('notes.txt')
    first.unmount()
    mount({ attachable: true, attachKey: 'note' })
    expect(await screen.findByText('notes.txt')).toBeTruthy()
    // Another widget does not see them, and sending clears them.
    cleanup()
    mount({ attachable: true, attachKey: 'draw-file' })
    expect(screen.queryByText('notes.txt')).toBeNull()
    cleanup()
    const reopened = mount({ attachable: true, attachKey: 'note', onSend: vi.fn() })
    await screen.findByText('notes.txt')
    fireEvent.keyDown(input(), { key: 'Enter' })
    reopened.unmount()
    mount({ attachable: true, attachKey: 'note' })
    expect(screen.queryByText('notes.txt')).toBeNull()
  })

  it('keeps files in the box while a reply is running, because a message sent then would drop them', async () => {
    const send = vi.fn()
    mount({ onSend: send, attachable: true, streaming: true })
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' })
    fireEvent.paste(input(), { clipboardData: { items: [{ kind: 'file', getAsFile: () => file }], getData: () => '' } })
    await screen.findByText('notes.txt')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('notes.txt')).toBeTruthy()
  })

  it('has no call button when the widget has no live scope', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Start live call' })).toBeNull()
  })

  it('offers installed skills on slash without custom suggestions, and Enter picks before sending', () => {
    const send = vi.fn()
    mount({ onSend: send })
    fireEvent.change(input(), { target: { value: '/', selectionStart: 1 } })
    expect(screen.getByRole('option', { name: /\/diagram.*Draw a diagram/ })).toBeTruthy()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(input().value).toBe('/diagram ')
    expect(send).not.toHaveBeenCalled()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(send).toHaveBeenCalledWith('/diagram', [])
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
