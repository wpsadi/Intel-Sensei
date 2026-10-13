// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '../db/types'
import { useNoteStore } from '../note.store'
import { NoteTools } from './NoteTools'
import { NOTE_TOOLS } from './note-tools'

// The editor extensions pull in Mermaid and KaTeX; these tests only touch plain text.
vi.mock('./content', () => ({ docToText: (content: string) => (content.startsWith('{') ? 'Discussed the launch plan' : content) }))
vi.mock('./markdown', () => ({ writeContent: () => JSON.stringify({ type: 'doc' }) }))

const page = (id: string, title: string, extra: Partial<Page> = {}): Page => ({
  id, parentId: null, parentType: 'workspace', kind: 'page', title, icon: '', cover: '', content: '', properties: {},
  favorite: false, trashed: false, font: 'default', smallText: false, fullWidth: false, locked: false, order: 0, createdAt: 0, updatedAt: 0, ...extra,
})

type Tool = { name: string; execute: (args: unknown, options: { signal: AbortSignal }) => Promise<{ content: { text: string }[]; isError?: boolean }> }
const registerTool = () => (document as unknown as { modelContext: { registerTool: ReturnType<typeof vi.fn> } }).modelContext.registerTool
const tools = () => new Map(registerTool().mock.calls.map(([tool]) => [(tool as Tool).name, tool as Tool]))
const call = (name: string, args: unknown) => tools().get(name)!.execute(args, { signal: new AbortController().signal })

const Harness = NoteTools

describe('S-Note WebMCP tools', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'modelContext', { value: { registerTool: vi.fn().mockResolvedValue(undefined) }, configurable: true })
    useNoteStore.setState({
      ready: true,
      pages: {
        a: page('a', 'Meeting notes', { content: '{"type":"doc","content":[]}' }),
        b: page('b', 'Ideas', { parentId: 'a', parentType: 'page' }),
        c: page('c', 'Ideas', { trashed: true }),
        d: page('d', 'Locked plan', { locked: true }),
      },
      databases: {},
      updatePage: vi.fn().mockResolvedValue(undefined),
      setPageTrashed: vi.fn().mockResolvedValue(undefined),
      destroyPage: vi.fn().mockResolvedValue(undefined),
      reloadContent: vi.fn(),
    })
  })

  afterEach(() => {
    delete (document as { modelContext?: unknown }).modelContext
  })

  it('registers every tool within the WebMCP budgets', () => {
    render(<MemoryRouter><Harness /></MemoryRouter>)
    expect([...tools().keys()].sort()).toEqual(NOTE_TOOLS.map((t) => t.name).sort())
    for (const tool of NOTE_TOOLS) {
      expect(tool.name.length).toBeLessThanOrEqual(30)
      expect(tool.description.length).toBeLessThanOrEqual(500)
    }
  })

  it('finds notes by their text and returns pagination fields', async () => {
    render(<MemoryRouter><Harness /></MemoryRouter>)
    const result = await call('search_notes', { query: 'launch' })
    const body = JSON.parse(result.content[0].text)
    expect(body).toMatchObject({ total_count: 1, page: 1, page_size: 10 })
    expect(body.notes[0]).toMatchObject({ id: 'a', title: 'Meeting notes' })
  })

  it('requires a read before writing the body of a closed note', async () => {
    render(<MemoryRouter><Harness /></MemoryRouter>)
    const unread = await call('edit_note', { note: 'Meeting notes', content: '- follow up' })
    expect(unread.content[0].text).toMatch(/Read "Meeting notes" first/)

    await call('read_note', { note: 'Meeting notes' })
    const result = await call('edit_note', { note: 'Meeting notes', content: '- follow up' })
    expect(result.isError).toBeFalsy()
    expect(useNoteStore.getState().updatePage).toHaveBeenCalledWith('a', { content: JSON.stringify({ type: 'doc' }) })
  })

  it('refuses to edit a locked note', async () => {
    render(<MemoryRouter><Harness /></MemoryRouter>)
    const result = await call('edit_note', { note: 'Locked plan', content: 'x' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/locked/)
  })

  it('only erases notes that are already in the trash', async () => {
    render(<MemoryRouter><Harness /></MemoryRouter>)
    const live = await call('delete_notes_forever', { notes: ['Meeting notes'] })
    expect(live.isError).toBe(true)
    expect(live.content[0].text).toMatch(/search_notes with in_trash/)

    await call('delete_notes_forever', { notes: ['Ideas'] })
    expect(useNoteStore.getState().destroyPage).toHaveBeenCalledWith('c')
  })

  it('cannot rewrite a whole note without the explicit flag', async () => {
    render(<MemoryRouter><Harness /></MemoryRouter>)
    await call('read_note', { note: 'Meeting notes' })
    const result = await call('edit_note', { note: 'Meeting notes', content: 'x', mode: 'replace' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/Invalid input: mode/)
  })

  it('reports invalid input as an actionable error', async () => {
    render(<MemoryRouter><Harness /></MemoryRouter>)
    const result = await call('trash_notes', { notes: [] })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/^Invalid input: notes/)
  })

  describe('sub-notes', () => {
    const create = (inside: string) => {
      const createPage = vi.fn().mockResolvedValue(page('new', 'Agenda', { parentId: 'a', parentType: 'page' }))
      useNoteStore.setState({ createPage })
      return call('create_note', { title: 'Agenda', inside, open: false })
    }

    it('lists a new sub-note in its parent as a page block, like the editor does', async () => {
      render(<MemoryRouter><Harness /></MemoryRouter>)
      await create('Meeting notes')
      const update = useNoteStore.getState().updatePage as ReturnType<typeof vi.fn>
      expect(update).toHaveBeenCalledWith('a', { content: JSON.stringify({ type: 'doc', content: [{ type: 'pageBlock', attrs: { pageId: 'new' } }] }) })
    })

    it('keeps a trailing empty paragraph last', async () => {
      useNoteStore.setState({ pages: { ...useNoteStore.getState().pages, a: page('a', 'Meeting notes', { content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }, { type: 'paragraph' }] }) }) } })
      render(<MemoryRouter><Harness /></MemoryRouter>)
      await create('Meeting notes')
      const update = useNoteStore.getState().updatePage as ReturnType<typeof vi.fn>
      const doc = JSON.parse(update.mock.calls[0][1].content)
      expect(doc.content.map((node: { type: string }) => node.type)).toEqual(['paragraph', 'pageBlock', 'paragraph'])
    })

    it('leaves a locked parent alone and says so', async () => {
      render(<MemoryRouter><Harness /></MemoryRouter>)
      const result = await create('Locked plan')
      expect(useNoteStore.getState().updatePage).not.toHaveBeenCalled()
      expect(result.content[0].text).toContain('is locked')
    })

    it('adds nothing for a top-level note', async () => {
      render(<MemoryRouter><Harness /></MemoryRouter>)
      const createPage = vi.fn().mockResolvedValue(page('top', 'Top'))
      useNoteStore.setState({ createPage })
      await call('create_note', { title: 'Top', open: false })
      expect(useNoteStore.getState().updatePage).not.toHaveBeenCalled()
    })
  })
})
