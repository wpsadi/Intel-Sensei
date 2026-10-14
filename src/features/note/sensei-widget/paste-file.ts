import { tool } from 'ai'
import { z } from 'zod'

import { readSandboxFile } from '@/ai/sandbox/client'
import { PASTE_MAX_CHARS } from '@/ai/sandbox/engine'

import { editNote } from '../webmcp/tools'

/** Lines a PDF broke mid-sentence are joined; a new paragraph starts after a blank line or a line ending a sentence. */
function paragraphsOf(text: string) {
  const paragraphs: string[] = []
  let current = ''
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      if (current) paragraphs.push(current)
      current = ''
    } else if (current && /[.!?:;]$/.test(current) && /^[A-Z0-9"“(•]/.test(line)) {
      paragraphs.push(current)
      current = line
    } else {
      current = current ? `${current} ${line}` : line
    }
  }
  if (current) paragraphs.push(current)
  // A line that starts like a list or heading is shown as plain text, not turned into markdown.
  return paragraphs.map((paragraph) => paragraph.replace(/^(\s*)([#>*+-]|\d+[.)])(?=\s)/, '$1\\$2'))
}

/**
 * Text from a file as markdown for a note, joining lines that were broken mid-sentence. The "--- Page N ---" markers
 * pdftotext writes become headings, so the note keeps its place in the document.
 */
export function reflowMarkdown(text: string) {
  const parts = text.split(/^--- Page (\d+) ---$/m)
  if (parts.length === 1) return paragraphsOf(text).join('\n\n')
  const sections = [paragraphsOf(parts[0]).join('\n\n')]
  for (let i = 1; i < parts.length; i += 2)
    sections.push([`### Page ${parts[i]}`, paragraphsOf(parts[i + 1]).join('\n\n')].filter(Boolean).join('\n\n'))
  return sections.filter(Boolean).join('\n\n')
}

/**
 * Pastes a text file from the sandbox into a note, so the agent does not retype it. Works like edit_note: the note
 * must have been read first, and the text goes at the end or start of its body.
 */
export function createPasteFileTool() {
  return tool({
    description:
      "Pastes the text of a file from the sandbox into a note without retyping it. Use after preparing the text with the terminal, for example `pdftotext guide.pdf -f 2 -l 6 guide.txt`, when the user asks to put a PDF or other file's content into a note. Read the note first with read_note.",
    inputSchema: z.object({
      note: z.string().min(1).describe('The note to paste into: its title or id from search_notes'),
      path: z.string().min(1).describe('The text file in the sandbox, such as guide.txt'),
      reflow: z
        .boolean()
        .optional()
        .describe(
          'Join lines that were broken mid-sentence and turn "--- Page N ---" markers into headings. Use for text from a PDF. Default false',
        ),
      mode: z.enum(['append', 'prepend']).optional().describe('Add at the end of the note (default) or the start'),
    }),
    execute: async ({ note, path, reflow, mode }, { abortSignal }) => {
      let text = new TextDecoder().decode(await readSandboxFile(path, abortSignal)).trim()
      if (!text) throw new Error(`"${path}" is empty`)
      const cut = text.length > PASTE_MAX_CHARS
      if (cut) text = text.slice(0, PASTE_MAX_CHARS)
      const body = reflow ? reflowMarkdown(text) : text
      const done = await editNote({
        note,
        content: cut ? `${body}\n\n*The text was cut short at this point because it was too long to paste in one go.*` : body,
        mode: mode ?? 'append',
      })
      return `Pasted ${text.length} characters of "${path}" into "${done.title}"${cut ? ', cut short because it was too long' : ''}.`
    },
  })
}
