import '@/features/note/snote.css'
import { useMemo } from 'react'

import { docToMarkdown } from '../lib/markdown'
import { documentHtml } from '../lib/markdown-import'
import { NoteEditor } from './NoteEditor'

/**
 * S-Note's editor on a Markdown document that is not a note page: the document Sensei writes in Ask Sensei opens in
 * it, fully editable. `markdown` is only read on mount (remount with a `key` to load another document); every edit
 * calls `onChange` with the whole document as Markdown.
 */
export function DocumentEditor({
  markdown,
  editable = true,
  onChange,
}: {
  markdown: string
  editable?: boolean
  onChange: (markdown: string) => void
}) {
  const html = useMemo(() => documentHtml(markdown), [markdown])
  return (
    <div className="snote-font-default px-4 pt-6 pb-24 sm:pr-8 sm:pl-16">
      <NoteEditor content={html} editable={editable} pages={false} onChange={(json) => onChange(docToMarkdown(json))} />
    </div>
  )
}
