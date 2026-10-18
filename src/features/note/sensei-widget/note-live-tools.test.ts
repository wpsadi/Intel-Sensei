// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { toolDeclarations } from '@/ai/inference/call'

import { createNoteLiveTools, noteScreenMap } from './agent'

describe('S-Note live tools', () => {
  it('gives the call the note tools, each as a valid function declaration', async () => {
    const tools = createNoteLiveTools()
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(['read_note', 'list_blocks', 'update_block', 'search_notes']))
    const declared = await toolDeclarations(tools)
    expect(declared).toHaveLength(Object.keys(tools).length)
    for (const item of declared) {
      expect(item.description, item.name).toBeTruthy()
      expect(item.parametersJsonSchema, item.name).toMatchObject({ type: 'object' })
    }
  })

  it('describes what is open and how to read it, without carrying any note content', () => {
    const map = noteScreenMap('Trip plan')
    expect(map).toContain('"Trip plan"')
    expect(map).toContain('list_blocks or read_note')
    expect(noteScreenMap()).toContain('No note is open')
  })
})
