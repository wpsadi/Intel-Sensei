// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '../db/types'
import { BLOCKS } from '../editor/blocks/registry'
import { buildExtensions } from '../editor/extensions'
import { registerLiveEditor } from '../editor/live-editors'
import { useNoteStore } from '../note.store'
import { deleteBlocks, insertBlocks, listBlocks, moveBlock, readBlock, updateBlock } from './blocks'
import { BLOCK_TYPES, insertBlocks as insertSchema, parseArgs } from './schemas'
import { forgetRead } from './read-guard'

const DOC = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }] }
const page: Page = {
  id: 'p1', parentId: null, parentType: 'workspace', kind: 'page', title: 'Launch', icon: '', cover: '', content: JSON.stringify(DOC), properties: {},
  favorite: false, trashed: false, font: 'default', smallText: false, fullWidth: false, locked: false, order: 0, createdAt: 0, updatedAt: 0,
}

let editor: Editor
let unregister: () => void
const ctx = { currentPageId: 'p1', go: vi.fn() }

describe('S-Note block tools', () => {
  beforeEach(() => {
    useNoteStore.setState({ ready: true, pages: { p1: page }, databases: {}, people: [] })
    editor = new Editor({ extensions: buildExtensions({ pageId: 'p1', nested: false }), content: DOC })
    unregister = registerLiveEditor('p1', editor)
  })
  afterEach(() => {
    unregister()
    editor.destroy()
  })

  it('turns Markdown written into a text block into real blocks', async () => {
    await readBlock({ block: '1' }, ctx)
    const result = await updateBlock({ block: '1', text: '# The Proposal\n*By Anton Chekhov*\n\n---\n\n## Summary\n\n1. One\n2. Two\n' }, ctx)
    expect(result).toMatchObject({ status: 'updated' })
    const types = editor.getJSON().content!.map((node) => node.type)
    expect(types).toEqual(expect.arrayContaining(['heading', 'horizontalRule', 'orderedList']))
    expect(types.filter((type) => type === 'heading')).toHaveLength(3)
    expect(editor.getText()).not.toContain('# The Proposal')
  })

  it('keeps plain text inline, with its heading level', async () => {
    await readBlock({ block: '0' }, ctx)
    await updateBlock({ block: '0', text: 'Launch *plan*' }, ctx)
    expect(editor.getJSON().content![0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(editor.getJSON().content!).toHaveLength(2)
  })

  it('offers every block the "/" menu has', () => {
    expect(BLOCK_TYPES.filter((t) => t !== 'markdown').sort()).toEqual(BLOCKS.map((b) => b.key).sort())
  })

  it('lists and counts blocks of the open note', () => {
    const result = listBlocks({ page: 1 }, ctx)
    expect(result).toMatchObject({ note: 'Launch', total_count: 2, counts_by_type: { h1: 1, text: 1 } })
    expect(result.blocks[0]).toMatchObject({ block: '0', type: 'h1', text: 'Plan' })
  })

  it('refuses edits until the note is read, and again after it changes', async () => {
    forgetRead('p1')
    await expect(updateBlock({ block: '1', text: 'x' }, ctx)).rejects.toThrow(/Read "Launch" first/)
    listBlocks({ page: 1 }, ctx)
    // Typing does not move block addresses, so it does not force another read.
    editor.commands.insertContentAt(1, 'New ')
    await expect(updateBlock({ block: '1', text: 'x' }, ctx)).resolves.toMatchObject({ status: 'updated' })
    // The user adds a block after the agent looked at it.
    editor.commands.insertContentAt(0, { type: 'paragraph', content: [{ type: 'text', text: 'Top' }] })
    await expect(updateBlock({ block: '1', text: 'x' }, ctx)).rejects.toThrow(/has changed since you last read it/)
    listBlocks({ page: 1 }, ctx)
    await expect(updateBlock({ block: '1', text: 'x' }, ctx)).resolves.toMatchObject({ status: 'updated' })
  })

  it('inserts filled blocks through the slash-menu commands', async () => {
    listBlocks({ page: 1 }, ctx)
    const args = parseArgs(insertSchema, {
      position: { where: 'after', block: '0' },
      blocks: [
        { type: 'todo', items: ['Book venue', '[x] Pick date'] },
        { type: 'callout', text: 'Budget is tight', attrs: { icon: '💸' } },
        { type: 'code', text: 'npm run build', attrs: { language: 'bash' } },
        { type: 'table', rows: [['Item', 'Cost'], ['Venue', '500']] },
        { type: 'markdown', text: '## Notes\n\nSome **bold** prose' },
      ],
    })
    const result = await insertBlocks(args, ctx)
    expect(result.blocks).toEqual(['1 todo', '2 callout', '3 code', '4 table', '5 markdown'])
    const kinds = listBlocks({ page: 1 }, ctx).blocks.map((b) => b.type)
    expect(kinds.slice(0, 6)).toEqual(['h1', 'todo', 'callout', 'code', 'table', 'h2'])
    expect(readBlock({ block: '1.1' }, ctx)).toMatchObject({ type: 'todo_item', checked: true, text: 'Pick date' })
    expect(readBlock({ block: '2' }, ctx)).toMatchObject({ attrs: { icon: '💸' } })
    expect(readBlock({ block: '3' }, ctx)).toMatchObject({ text: 'npm run build', attrs: { language: 'bash' } })
    expect(readBlock({ blocks: ['1.1', '3', '99'] }, ctx)).toMatchObject({
      blocks: [{ block: '1.1', text: 'Pick date' }, { block: '3', text: 'npm run build' }, { block: '99', error: expect.any(String) }],
    })
  })

  it('edits, converts, ticks and comments on blocks', async () => {
    listBlocks({ page: 1 }, ctx)
    await updateBlock({ block: '1', text: 'Agenda', convert_to: 'h2' }, ctx)
    expect(readBlock({ block: '1' }, ctx)).toMatchObject({ type: 'h2', text: 'Agenda' })

    await insertBlocks(parseArgs(insertSchema, { blocks: [{ type: 'todo', items: ['Ship'] }] }), ctx)
    listBlocks({ page: 1 }, ctx)
    await updateBlock({ block: '2.0', checked: true, comment: 'Done Friday' }, ctx)
    expect(readBlock({ block: '2.0' }, ctx)).toMatchObject({ checked: true, comments: ['Done Friday'] })
  })

  it('explains bad settings and addresses instead of failing silently', async () => {
    listBlocks({ page: 1 }, ctx)
    await expect(updateBlock({ block: '0', attrs: { color: 'red' } }, ctx)).rejects.toThrow(/no setting color. Its settings: level/)
    await expect(updateBlock({ block: '9', text: 'x' }, ctx)).rejects.toThrow(/There is no block 9/)
    await expect(updateBlock({ block: '1', checked: true }, ctx)).rejects.toThrow(/not a to-do item/)
  })

  it('converts a block in the middle of a note into any other kind', async () => {
    listBlocks({ page: 1 }, ctx)
    await insertBlocks(parseArgs(insertSchema, { position: { where: 'after', block: '1' }, blocks: [{ type: 'bullet', items: ['Venue', 'Food'] }, { type: 'text', text: 'Outro' }] }), ctx)
    listBlocks({ page: 1 }, ctx)

    // The paragraph between the heading and the list becomes a callout with the same text.
    const callout = await updateBlock({ block: '1', convert_to: 'callout' }, ctx)
    expect(callout).toMatchObject({ status: 'converted', block: { block: '1', type: 'callout', text: 'Intro' } })

    // A multi-line list becomes to-dos, one per line, and the blocks around it stay put.
    listBlocks({ page: 1 }, ctx)
    await updateBlock({ block: '2', convert_to: 'todo' }, ctx)
    const kinds = listBlocks({ page: 1 }, ctx).blocks.map((b) => [b.type, b.text])
    expect(kinds.slice(0, 4)).toEqual([['h1', 'Plan'], ['callout', 'Intro'], ['todo', 'Venue Food'], ['text', 'Outro']])
    expect(readBlock({ block: '2.1' }, ctx)).toMatchObject({ type: 'todo_item', text: 'Food' })
  })

  it('editing one block leaves every other block exactly as it was', async () => {
    listBlocks({ page: 1 }, ctx)
    await insertBlocks(parseArgs(insertSchema, { blocks: [{ type: 'todo', items: ['A', 'B'] }, { type: 'callout', text: 'Keep me' }] }), ctx)
    const before = editor.getJSON().content!
    listBlocks({ page: 1 }, ctx)
    await updateBlock({ block: '1', text: 'Changed' }, ctx)
    const after = editor.getJSON().content!
    expect(after).toHaveLength(before.length)
    after.forEach((node, i) => (i === 1 ? expect((node.content?.[0] as { text?: string } | undefined)?.text).toBe('Changed') : expect(node).toEqual(before[i])))
  })

  it('never empties a note unless asked to', async () => {
    listBlocks({ page: 1 }, ctx)
    await expect(deleteBlocks({ blocks: ['0', '1'] }, ctx)).rejects.toThrow(/would remove every block/)
    expect(listBlocks({ page: 1 }, ctx).total_count).toBeGreaterThanOrEqual(2)
    await expect(deleteBlocks({ blocks: ['0', '1'], empty_note: true }, ctx)).resolves.toMatchObject({ status: 'deleted' })
  })

  it('tells the agent when a note has no title', () => {
    useNoteStore.setState({ pages: { p1: { ...page, title: '' } } })
    expect(listBlocks({ page: 1 }, ctx)).toMatchObject({ untitled: true })
  })

  it('moves and deletes blocks', async () => {
    listBlocks({ page: 1 }, ctx)
    const moved = await moveBlock({ block: '1', position: { where: 'start' } }, ctx)
    expect(moved.now_at).toBe('0')
    expect(listBlocks({ page: 1 }, ctx).blocks.map((b) => b.text).filter(Boolean)).toEqual(['Intro', 'Plan'])

    listBlocks({ page: 1 }, ctx)
    await deleteBlocks({ blocks: ['0'] }, ctx)
    expect(listBlocks({ page: 1 }, ctx).blocks.map((b) => b.text).filter(Boolean)).toEqual(['Plan'])
  })

  it('refuses to edit a locked note', async () => {
    useNoteStore.setState({ pages: { p1: { ...page, locked: true } } })
    await expect(deleteBlocks({ blocks: ['0'] }, ctx)).rejects.toThrow(/locked/)
  })
})
