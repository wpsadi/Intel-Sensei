import { fireEvent, render, screen } from '@testing-library/react'
// @vitest-environment jsdom
import { EditorContent, useEditor } from '@tiptap/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { EditorToolbar } from './EditorToolbar'
import { buildExtensions } from './extensions'

function Harness({ onEditor }: { onEditor: (editor: NonNullable<ReturnType<typeof useEditor>>) => void }) {
  const editor = useEditor({ extensions: buildExtensions({ pageId: 'p', nested: false }), content: '<p>hello world</p>' })
  if (!editor) return null
  onEditor(editor)
  return (
    <>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </>
  )
}

describe('EditorToolbar', () => {
  beforeAll(() => {
    // jsdom has no matchMedia, which Tiptap's responsive hooks read.
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia
  })

  it('attaches Tiptap UI components that act on the editor', async () => {
    let editor!: NonNullable<ReturnType<typeof useEditor>>
    render(<Harness onEditor={(e) => (editor = e)} />)
    const bold = await screen.findByRole('button', { name: /bold/i })
    editor.commands.selectAll()
    fireEvent.click(bold)
    expect(editor.isActive('bold')).toBe(true)
    expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /undo/i })).toBeTruthy()
  })
})
