// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { type HTMLAttributes, type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ dispose: vi.fn(), all: vi.fn().mockResolvedValue([]) }))
vi.mock('../agent/agent', () => ({
  DRAW_CONTEXT_LIMIT: 200_000,
  drawSandboxSession: (fileId: string) => `sdraw-${fileId}`,
  disposeDrawSensei: mocks.dispose,
  sendDrawSensei: vi.fn(),
  stopDrawSensei: vi.fn(),
  useDrawRuns: (select: (state: unknown) => unknown) => select({ live: {}, recent: {}, saved: 0 }),
}))
vi.mock('../sheet-title', () => ({ titleDrawSheet: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../s-draw.store', () => ({ useDrawStore: { getState: () => ({ activeId: 'sheet-a' }) } }))
vi.mock('../agent/chats', () => ({ drawChats: { all: mocks.all } }))
vi.mock('../agent/webmcp', () => ({ hasDrawWebMCP: () => true, DRAW_WEBMCP_HELP: '' }))
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/context-ring', () => ({ ContextRing: () => <span>Context</span> }))
vi.mock('@/features/note/sensei-widget/WidgetComposer', () => ({ WidgetComposer: () => <textarea aria-label="Drawing message" /> }))
vi.mock('@/features/ask-sensei/terminal/terminal-panel', () => ({
  TerminalPanel: ({
    chatId,
    onClose,
    dragHandleProps,
  }: {
    chatId: string
    onClose: () => void
    dragHandleProps?: HTMLAttributes<HTMLDivElement>
  }) => (
    <section aria-label="Terminal">
      <div {...dragHandleProps}>
        <span>{chatId}</span>
        <button onClick={onClose}>Close terminal window</button>
      </div>
    </section>
  ),
}))
vi.mock('@/features/ask-sensei/components/markdown', () => ({ Markdown: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/features/ask-sensei/components/chat-reasoning', () => ({ ChatReasoning: () => null }))

import { SenseiWidget } from './sensei-widget'

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SDraw floating windows', () => {
  it('toggles the terminal independently and retains it when chat closes', async () => {
    render(<SenseiWidget fileId="file-a" chatId={null} onChatChange={vi.fn()} context={() => 'drawing'} />)
    expect(screen.queryByRole('region', { name: 'Terminal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open SDraw terminal' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ask Sensei about drawing' }))
    const terminalButton = screen.getByRole('button', { name: 'Open SDraw terminal' })
    expect(terminalButton.nextElementSibling).toBe(screen.getByRole('button', { name: 'New drawing chat' }))
    fireEvent.click(terminalButton)
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'SDraw Sensei' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Close Sensei$/ }))
    expect(screen.queryByRole('region', { name: 'SDraw Sensei' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Terminal' })).toBeTruthy()
    expect(mocks.dispose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal window' }))
    expect(screen.queryByRole('region', { name: 'Terminal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open SDraw terminal' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ask Sensei about drawing' }))
    expect(screen.getByRole('button', { name: 'Open SDraw terminal' }).getAttribute('aria-expanded')).toBe('false')
    await act(async () => {})
  })

  it('moves the terminal by its header and keeps it within the screen', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    render(<SenseiWidget fileId="file-a" chatId={null} onChatChange={vi.fn()} context={() => 'drawing'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Sensei about drawing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open SDraw terminal' }))
    const panel = screen.getByLabelText('SDraw floating terminal')
    const handle = screen.getByLabelText('Move terminal')
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() })
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 16, top: 100, width: 400, height: 200 } as DOMRect)
    fireEvent.pointerDown(handle, { button: 0, clientX: 30, clientY: 110 })
    fireEvent.pointerMove(handle, { clientX: 130, clientY: 160 })
    expect(panel.style.left).toBe('116px')
    expect(panel.style.top).toBe('150px')
    fireEvent.pointerMove(handle, { clientX: -1000, clientY: 10000 })
    expect(panel.style.left).toBe('8px')
    expect(panel.style.top).toBe(`${window.innerHeight - 208}px`)
    fireEvent.pointerUp(handle)
    fireEvent.pointerMove(handle, { clientX: 50, clientY: 50 })
    expect(panel.style.left).toBe('8px')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(panel.style.left).toBe('32px')
    await act(async () => {})
  })

  it('restores the URL-selected chat and limits history to its file', async () => {
    mocks.all.mockResolvedValueOnce([
      {
        id: 'chat-a',
        fileId: 'file-a',
        title: 'Saved drawing chat',
        updatedAt: 1,
        messages: [{ id: 'm', role: 'user', content: 'Saved file question' }],
      },
    ])
    const change = vi.fn()
    render(<SenseiWidget fileId="file-a" chatId="chat-a" onChatChange={change} context={() => 'drawing'} />)
    expect(await screen.findByText('Saved file question')).toBeTruthy()
    expect(mocks.all).toHaveBeenCalledWith('file-a')
    fireEvent.click(screen.getByRole('button', { name: 'New drawing chat' }))
    expect(change).toHaveBeenCalledWith(null)
  })

  it('does not display a conversation belonging to a different file', async () => {
    mocks.all.mockResolvedValueOnce([
      {
        id: 'chat-b',
        fileId: 'file-b',
        title: 'Another file',
        updatedAt: 1,
        messages: [{ id: 'm', role: 'user', content: 'Private other drawing' }],
      },
    ])
    render(<SenseiWidget fileId="file-a" chatId="chat-b" onChatChange={vi.fn()} context={() => 'drawing'} />)
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'This chat was not found in this drawing file. Start a new chat or choose one from history.',
    )
    expect(screen.queryByText('Private other drawing')).toBeNull()
  })

  it('stops runs on app unmount while surviving StrictMode effect replay', async () => {
    const view = render(
      <StrictMode>
        <SenseiWidget fileId="file-a" chatId={null} onChatChange={vi.fn()} context={() => 'drawing'} />
      </StrictMode>,
    )
    await act(async () => {})
    expect(mocks.dispose).not.toHaveBeenCalled()
    view.unmount()
    await act(async () => {})
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})
