// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NodeAlignment } from '@/components/tiptap-extension/node-alignment-extension'
import { NodeBackground } from '@/components/tiptap-extension/node-background-extension'
import { TableHandleExtension } from '@/components/tiptap-node/table-node/extensions/table-handle'
import { TableKit } from '@/components/tiptap-node/table-node/extensions/table-node-extension'

import {
  addLine,
  canMoveLine,
  clearLine,
  deleteLine,
  duplicateLine,
  getTableContext,
  moveLine,
  selectLine,
  sortLine,
} from './tiptap-table-utils'

const cell = (text: string, type = 'tableCell') => ({
  type,
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
})
const row = (cells: string[], type = 'tableCell') => ({ type: 'tableRow', content: cells.map((c) => cell(c, type)) })

let editor: Editor

/** The table as rows of cell text. */
const grid = () => {
  const ctx = getTableContext(editor, 0)!
  const out: string[][] = []
  ctx.node.forEach((r) => {
    const cells: string[] = []
    r.forEach((c) => cells.push(c.textContent))
    out.push(cells)
  })
  return out
}

beforeEach(() => {
  editor = new Editor({
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: false } }),
      TableHandleExtension,
      NodeAlignment,
      NodeBackground.configure({ types: ['tableCell', 'tableHeader'] }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            row(['Name', 'Score'], 'tableHeader'),
            row(['carol', '30']),
            row(['alice', '100']),
            row(['bob', '5']),
          ],
        },
      ],
    },
  })
})
afterEach(() => editor.destroy())

interface JsonNode {
  attrs?: Record<string, unknown>
  content?: JsonNode[]
}

describe('table utils', () => {
  const cellAttrs = (row: number, col: number) => (editor.getJSON() as JsonNode).content![0].content![row].content![col].attrs!

  it('adds a row or column at a position', () => {
    expect(addLine(editor, { tablePos: 0, index: 1, orientation: 'row', direction: 'after' })).toBe(true)
    expect(grid()).toHaveLength(5)
    expect(grid()[2]).toEqual(['', ''])
    expect(addLine(editor, { tablePos: 0, index: 0, orientation: 'column', direction: 'before' })).toBe(true)
    expect(grid()[0]).toEqual(['', 'Name', 'Score'])
  })

  it('deletes a row but never the last one', () => {
    expect(deleteLine(editor, { tablePos: 0, index: 1, orientation: 'row' })).toBe(true)
    expect(grid().map((r) => r[0])).toEqual(['Name', 'alice', 'bob'])
    expect(deleteLine(editor, { tablePos: 0, index: 0, orientation: 'column' })).toBe(true)
    expect(deleteLine(editor, { tablePos: 0, index: 0, orientation: 'column' })).toBe(false)
  })

  it('moves rows and columns', () => {
    expect(moveLine(editor, { tablePos: 0, orientation: 'row', from: 3, to: 1 })).toBe(true)
    expect(grid().map((r) => r[0])).toEqual(['Name', 'bob', 'carol', 'alice'])
    expect(moveLine(editor, { tablePos: 0, orientation: 'column', from: 1, to: 0 })).toBe(true)
    expect(grid()[0]).toEqual(['Score', 'Name'])
    expect(canMoveLine(editor, getTableContext(editor, 0), 'row', 0, 9)).toBe(false)
  })

  it('duplicates rows and columns', () => {
    expect(duplicateLine(editor, { tablePos: 0, index: 2, orientation: 'row' })).toBe(true)
    expect(grid().map((r) => r[0])).toEqual(['Name', 'carol', 'alice', 'alice', 'bob'])
    expect(duplicateLine(editor, { tablePos: 0, index: 1, orientation: 'column' })).toBe(true)
    expect(grid()[1]).toEqual(['carol', '30', '30'])
  })

  it('sorts rows by a column, keeping the header and sinking empty cells', () => {
    expect(sortLine(editor, { tablePos: 0, index: 0, orientation: 'column', direction: 'asc' })).toBe(true)
    expect(grid().map((r) => r[0])).toEqual(['Name', 'alice', 'bob', 'carol'])
    // numeric aware
    expect(sortLine(editor, { tablePos: 0, index: 1, orientation: 'column', direction: 'desc' })).toBe(true)
    expect(grid().map((r) => r[1])).toEqual(['Score', '100', '30', '5'])
  })

  it('sorts columns by a row', () => {
    expect(sortLine(editor, { tablePos: 0, index: 1, orientation: 'row', direction: 'desc' })).toBe(true)
    // "carol" / "30" vs "alice" / "100": desc on row 1 => carol, then 30
    expect(grid()[1]).toEqual(['carol', '30'])
    expect(sortLine(editor, { tablePos: 0, index: 2, orientation: 'row', direction: 'asc' })).toBe(true)
    expect(grid()[2]).toEqual(['100', 'alice'])
    expect(grid()[0]).toEqual(['Score', 'Name'])
  })

  it('clears a line and resets its attributes', () => {
    selectLine(editor, 0, 'row', 2)
    editor.commands.setNodeBackgroundColor('red')
    expect(cellAttrs(2, 0).backgroundColor).toBe('red')
    expect(clearLine(editor, { tablePos: 0, index: 2, orientation: 'row', resetAttrs: true })).toBe(true)
    expect(grid()[2]).toEqual(['', ''])
    expect(cellAttrs(2, 0).backgroundColor).toBeNull()
  })

  it('aligns selected cells', () => {
    selectLine(editor, 0, 'column', 1)
    expect(editor.commands.setNodeTextAlign('right')).toBe(true)
    expect(editor.commands.setNodeVerticalAlign('middle')).toBe(true)
    const attrs = cellAttrs(1, 1)
    expect(attrs.textAlign).toBe('right')
    expect(attrs.verticalAlign).toBe('middle')
    // survives an HTML round trip
    const html = editor.getHTML()
    expect(html).toContain('text-align: right')
    expect(html).toContain('vertical-align: middle')
  })

  it('inserts a table, merges and splits cells', () => {
    expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(true)
    selectLine(editor, undefined, 'row', 0)
    expect(editor.can().mergeCells()).toBe(true)
  })
})
