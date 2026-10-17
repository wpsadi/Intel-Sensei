// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/s-draw/s-draw.db', () => ({ resolveDrawFileId: async () => 'file-a' }))
vi.mock('@/features/s-draw/bridge', () => ({ getDrawContext: () => '{}' }))
vi.mock('@/features/s-draw/webmcp/draw-tools', () => ({ DrawTools: () => null }))
vi.mock('@/features/s-draw/components/draw-workspace', () => ({
  DrawWorkspace: ({ children, fileId }: { children: ReactNode; fileId: string }) => <section aria-label={fileId}>{children}</section>,
}))
vi.mock('@/features/s-draw/components/sensei-widget', () => ({
  SenseiWidget: ({
    fileId,
    chatId,
    onChatChange,
  }: {
    fileId: string
    chatId: string | null
    onChatChange: (id: string | null) => void
  }) => (
    <div>
      <span>
        {fileId}:{chatId ?? 'new'}
      </span>
      <button onClick={() => onChatChange('chat-a')}>Select conversation</button>
      <button onClick={() => onChatChange(null)}>New conversation</button>
    </div>
  ),
}))

import SDrawPage from './s-draw.page'

function Location() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="URL query">{location.search}</output>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  )
}

afterEach(cleanup)

describe('SDraw file and chat URLs', () => {
  it('adds a stable file reference and preserves other query parameters when changing chats', async () => {
    render(
      <MemoryRouter initialEntries={['/s-draw?settings=open']}>
        <SDrawPage />
        <Location />
      </MemoryRouter>,
    )
    await screen.findByRole('region', { name: 'file-a' })
    fireEvent.click(screen.getByRole('button', { name: 'Select conversation' }))
    let query = new URLSearchParams(screen.getByLabelText('URL query').textContent!)
    expect(query.get('fileId')).toBe('file-a')
    expect(query.get('chatId')).toBe('chat-a')
    expect(query.get('settings')).toBe('open')
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    query = new URLSearchParams(screen.getByLabelText('URL query').textContent!)
    expect(query.get('chatId')).toBeNull()
    expect(query.get('fileId')).toBe('file-a')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByText('file-a:chat-a')).toBeTruthy())
  })

  it('restores a file and conversation directly from a saved URL', () => {
    render(
      <MemoryRouter initialEntries={['/s-draw?fileId=file-b&chatId=chat-b']}>
        <SDrawPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('file-b:chat-b')).toBeTruthy()
  })
})
