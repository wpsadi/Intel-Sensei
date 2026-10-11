import { z } from 'zod'

/* Zod is the single source of each tool's input: `inputSchema` is generated from it and `execute` parses with it. */

const note = z.string().min(1).describe('Note title as the user said it, or its id from search_notes')
const notes = z.array(note).min(1).max(25).describe('Notes by title or id')
const page = z.number().int().min(1).default(1).describe('Result page, starting at 1')
const cellValue = z
  .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
  .describe('Option name(s), text, number, true/false, a date like "2026-10-20" or "tomorrow", or null to clear')

export const searchNotes = z.object({
  query: z.string().optional().describe('Words to find in titles and text. Omit to list notes'),
  inside: note.optional().describe('Only notes under this note (title or id)'),
  favorites_only: z.boolean().optional().describe('Only starred notes'),
  in_trash: z.boolean().optional().describe('Search the trash instead of live notes'),
  page,
})

export const readNote = z.object({
  note,
  offset: z.number().int().min(0).default(0).describe('Character offset to continue a long note from next_offset'),
})

export const openNote = z.object({
  note: z.string().min(1).describe('Note title or id, or "trash" to show the trash'),
})

export const createNote = z.object({
  title: z.string().describe('Title for the new note'),
  content: z.string().optional().describe('Body as Markdown (headings, lists, - [ ] tasks, tables, code)'),
  inside: note.optional().describe('Parent note (title or id). Omit for the workspace top level'),
  icon: z.string().max(8).optional().describe('One emoji'),
  as_database: z.boolean().optional().describe('Make it a table database instead of a text note'),
  open: z.boolean().default(true).describe('Show the new note to the user'),
})

export const editNote = z.object({
  note,
  content: z.string().optional().describe('Markdown to write into the body'),
  mode: z.enum(['append', 'prepend']).default('append').describe('Add content at the end or the start of the body'),
  rewrite_whole_note: z.boolean().optional().describe('Erase the whole body and write content instead. Only when the user explicitly asks to rewrite the entire note'),
  title: z.string().optional(),
  icon: z.string().max(8).optional().describe('One emoji, or "" to remove'),
  favorite: z.boolean().optional().describe('Star or unstar'),
  locked: z.boolean().optional().describe('Lock against edits, or unlock'),
  full_width: z.boolean().optional(),
  small_text: z.boolean().optional(),
  font: z.enum(['default', 'serif', 'mono']).optional(),
})

export const duplicateNote = z.object({ note })

export const moveNotes = z.object({
  notes,
  inside: note.nullable().describe('New parent note (title or id), or null for the workspace top level'),
})

export const trashNotes = z.object({
  notes,
  restore: z.boolean().optional().describe('true takes the notes back out of the trash'),
})

export const deleteNotesForever = z.object({
  notes: notes.describe('Notes already in the trash, by title or id'),
})

export const queryDatabase = z.object({
  database: note.describe('Database title or id'),
  where: z.record(z.string(), z.string()).optional().describe('Column name → text the cell must contain, e.g. {"Status":"Done"}'),
  page,
})

export const updateDatabaseRows = z.object({
  database: note.describe('Database title or id'),
  rows: z
    .array(
      z.object({
        row: z.string().optional().describe('Existing row by name or id. Omit to add a new row'),
        values: z.record(z.string(), cellValue).describe('Column name → value. Use "Name" for the row title'),
      }),
    )
    .min(1)
    .max(25),
})

/* --------------------------------- blocks --------------------------------- */

/**
 * Every block the "/" menu can insert (the keys of BLOCKS in editor/blocks/registry), plus "markdown" for several
 * blocks at once. Listed here rather than imported so the editor code stays out of the main bundle; a test keeps them equal.
 */
export const BLOCK_TYPES = ['text', 'h1', 'h2', 'h3', 'h4', 'bullet', 'numbered', 'todo', 'toggle', 'divider', 'link-page', 'callout', 'quote', 'code', 'page', 'table', 'image', 'video', 'audio', 'file', 'bookmark', 'embed', 'html', 'drive', 'tweet', 'gist', 'db-table', 'db-board', 'db-gallery', 'db-list', 'db-feed', 'db-dashboard', 'db-calendar', 'db-timeline', 'db-map', 'db-vbar', 'db-hbar', 'db-line', 'db-donut', 'db-number', 'db-form', 'db-inline', 'db-full', 'db-linked', 'toc', 'equation', 'inline-equation', 'button', 'breadcrumb', 'tabs', 'synced', 'th1', 'th2', 'th3', 'col2', 'col3', 'col4', 'col5', 'mermaid', 'ai', 'mention-person', 'mention-page', 'date', 'emoji', 'markdown'] as const

const openNote_ = note.optional().describe('Note title or id. Omit for the note on screen')
const blockPath = z.string().regex(/^\d+(\.\d+)*$/).describe('Block address from list_blocks, e.g. "3" or "3.1" for the 2nd child of block 3')
const position = z
  .object({
    where: z.enum(['end', 'start', 'after', 'before', 'inside']).describe('inside = at the end of a container block such as a callout, toggle or column'),
    block: blockPath.optional().describe('Needed for after, before and inside'),
  })
  .describe('Where in the note. Defaults to the end')

const blockContent = {
  text: z.string().optional().describe('Text of the block; note title for page/link-page; name for mentions; LaTeX for equations; Markdown for markdown'),
  items: z.array(z.string()).optional().describe('List items ("[x] " prefix = checked), toggle lines, column texts or tab titles'),
  rows: z.array(z.array(z.string())).optional().describe('Table cells row by row; the first row is the header'),
  attrs: z.record(z.string(), z.unknown()).optional().describe('Block settings, e.g. {"language":"ts"}, {"src":url}, {"url":url}, {"icon":"🔥"}'),
}

export const listBlocks = z.object({
  note: openNote_,
  inside: blockPath.optional().describe('List the children of this block instead of the top level'),
  page,
})

export const readBlock = z
  .object({
    note: openNote_,
    block: blockPath.optional().describe('One block to read'),
    blocks: z.array(blockPath).min(1).max(50).optional().describe('Several blocks to read in one call, e.g. ["0", "2", "3.1"]'),
  })
  .refine((a) => a.block || a.blocks, 'Pass block, or blocks to read several at once')

export const insertBlocks = z.object({
  note: openNote_,
  position: position.optional(),
  blocks: z
    .array(z.object({ type: z.enum(BLOCK_TYPES).describe('Block kind as in the "/" menu'), ...blockContent }))
    .min(1)
    .max(20),
})

export const updateBlock = z.object({
  note: openNote_,
  block: blockPath,
  ...blockContent,
  convert_to: z.enum(BLOCK_TYPES).optional().describe('Change the block into another kind in place, keeping its content, e.g. "callout", "todo", "h2", "toggle"'),
  checked: z.boolean().optional().describe('Tick or untick a to-do item'),
  comment: z.string().optional().describe('Add a comment to the block'),
})

export const moveBlock = z.object({ note: openNote_, block: blockPath, position })

export const deleteBlocks = z.object({
  note: openNote_,
  blocks: z.array(blockPath).min(1).max(50),
  empty_note: z.boolean().optional().describe('Needed to remove every block of the note. Only when the user asked to clear the whole note'),
})

/** JSON Schema for `useWebMCP`. Built once at module scope so registration never churns. */
export const jsonSchema = (schema: z.ZodType) => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>
  return rest
}

/** Parses tool args, turning zod issues into one sentence the agent can act on. */
export function parseArgs<T extends z.ZodType>(schema: T, args: unknown): z.output<T> {
  const result = schema.safeParse(args ?? {})
  if (result.success) return result.data
  throw new Error(`Invalid input: ${result.error.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}.`)
}
