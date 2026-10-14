import type { z } from 'zod'

import * as S from './schemas'
import * as T from './tools'

/* Tool definitions: name, What + When description, JSON Schema generated from zod, and annotations. */

const READ = { readOnlyHint: true, untrustedContentHint: true } as const
const UNTRUSTED = { untrustedContentHint: true } as const

const SEARCH_NOTES = {
  name: 'search_notes',
  description:
    'Finds notes in S-Note by words in their title or text, or lists notes under a parent, starred notes or the trash. Use first whenever the user refers to a note you have no id for, or asks what notes they have.',
  inputSchema: S.jsonSchema(S.searchNotes),
  annotations: READ,
}
const READ_NOTE = {
  name: 'read_note',
  description:
    "Returns a note's text, sub-notes and settings, or a database's columns. Use to answer questions about a note's contents or before editing it, so you know what is already there.",
  inputSchema: S.jsonSchema(S.readNote),
  annotations: READ,
}
const OPEN_NOTE = {
  name: 'open_note',
  description: 'Shows a note or the trash on screen. Use when the user asks to open, go to or see a note.',
  inputSchema: S.jsonSchema(S.openNote),
}
const CREATE_NOTE = {
  name: 'create_note',
  description:
    'Creates a new text note, optionally with Markdown content, or a new table database, at the top level or under another note, and opens it. Use when the user asks to write, start or make a new note, page, list or database.',
  inputSchema: S.jsonSchema(S.createNote),
}
const EDIT_NOTE = {
  name: 'edit_note',
  description:
    'Changes a note as a whole: adds Markdown at the start or end of its body, renames it, sets its emoji, stars it, locks it or changes how it displays. Use it to title an untitled note instead of adding a heading. To change one part of a note, use update_block on that block instead; this tool never edits individual blocks.',
  inputSchema: S.jsonSchema(S.editNote),
  annotations: UNTRUSTED,
}
const DUPLICATE_NOTE = {
  name: 'duplicate_note',
  description:
    'Copies a text note (its body and settings, not its sub-notes) next to the original. Use when the user asks to copy or duplicate a note.',
  inputSchema: S.jsonSchema(S.duplicateNote),
  annotations: UNTRUSTED,
}
const MOVE_NOTES = {
  name: 'move_notes',
  description:
    'Moves one or more notes, with their sub-notes, under another note or to the top level. Use when the user asks to move, file or reorganize notes.',
  inputSchema: S.jsonSchema(S.moveNotes),
  annotations: UNTRUSTED,
}
const TRASH_NOTES = {
  name: 'trash_notes',
  description:
    'Moves notes and their sub-notes to the trash, where they can be restored, or restores them. Use when the user asks to delete, remove or restore notes.',
  inputSchema: S.jsonSchema(S.trashNotes),
  annotations: UNTRUSTED,
}
const DELETE_NOTES_FOREVER = {
  name: 'delete_notes_forever',
  description:
    'Permanently erases notes that are already in the trash, with their sub-notes and databases. This cannot be undone. Use only when the user explicitly asks to delete forever or empty the trash, after confirming which notes.',
  inputSchema: S.jsonSchema(S.deleteNotesForever),
  annotations: { consequentialHint: true, untrustedContentHint: true },
}
const QUERY_DATABASE = {
  name: 'query_database',
  description:
    "Lists a database's rows with their column values, optionally only rows whose columns contain given text. Use to answer questions about a table, tracker or list database, or to find a row before updating it.",
  inputSchema: S.jsonSchema(S.queryDatabase),
  annotations: READ,
}
const UPDATE_DATABASE_ROWS = {
  name: 'update_database_rows',
  description:
    'Adds new rows to a database or changes values in existing rows, several at once. Use when the user asks to add entries or tasks to a table, or to change a status, date, tag or other column.',
  inputSchema: S.jsonSchema(S.updateDatabaseRows),
  annotations: UNTRUSTED,
}

const LIST_BLOCKS = {
  name: 'list_blocks',
  description:
    "Lists a note's blocks in order with their address, kind, a text preview and child count, plus counts by kind. Use to see a note's structure, count its blocks, or find the address of a block before reading, editing, moving or deleting it.",
  inputSchema: S.jsonSchema(S.listBlocks),
  annotations: READ,
}
const READ_BLOCK = {
  name: 'read_block',
  description:
    "Returns blocks' full text, settings, comments and children. Use when you need more than the list_blocks preview, such as a long paragraph, a table's cells or a block's URL. To read several blocks, pass them all in `blocks` in one call instead of calling once per block; to read a whole note, use read_note.",
  inputSchema: S.jsonSchema(S.readBlock),
  annotations: READ,
}
const INSERT_BLOCKS = {
  name: 'insert_blocks',
  description:
    'Adds one or more blocks of any kind the "/" menu offers (text, headings, lists, to-dos, toggles, callouts, code, tables, columns, tabs, images, embeds, databases, charts, sub-pages, equations, mentions…) at a position in a note. Use when the user asks to add content of a specific kind. For plain prose, type "markdown" is simplest.',
  inputSchema: S.jsonSchema(S.insertBlocks),
}
const UPDATE_BLOCK = {
  name: 'update_block',
  description:
    'Changes one block anywhere in a note: its text, list items, table cells or settings, ticks a to-do, changes it into another kind of block (e.g. a paragraph into a callout or a list into to-dos), or adds a comment. Use when the user asks to edit, fix, convert, check off or comment on a specific part of a note.',
  inputSchema: S.jsonSchema(S.updateBlock),
  annotations: UNTRUSTED,
}
const MOVE_BLOCK = {
  name: 'move_block',
  description:
    'Moves a block, with everything inside it, to another place in the same note, including into or out of callouts, toggles and columns. Use when the user asks to reorder or move part of a note.',
  inputSchema: S.jsonSchema(S.moveBlock),
}
const DELETE_BLOCKS = {
  name: 'delete_blocks',
  description:
    'Removes one or more blocks from a note. Use when the user asks to delete or clear specific parts of a note; to remove a whole note use trash_notes.',
  inputSchema: S.jsonSchema(S.deleteBlocks),
  annotations: UNTRUSTED,
}

/** Block tools pull in the editor, so they load on first use rather than with the app shell. */
const blocks = () => import('./blocks')

/** Where the agent is: the note on screen and a way to navigate. Read at call time, so tools never re-register on navigation. */
export interface NoteToolContext {
  currentPageId?: string
  go: (path: string) => void
}

type Execute = (args: unknown) => unknown

/** Every S-Note tool with its handler. Arguments are validated with the tool's zod schema before running. */
export function buildNoteTools(ctx: () => NoteToolContext): ((typeof NOTE_TOOLS)[number] & { execute: Execute })[] {
  const go = (path: string) => ctx().go(path)
  const run =
    <T extends z.ZodType>(schema: T, fn: (args: z.output<T>) => unknown): Execute =>
    (args) =>
      fn(S.parseArgs(schema, args))
  return [
    { ...SEARCH_NOTES, execute: run(S.searchNotes, T.searchNotes) },
    { ...READ_NOTE, execute: run(S.readNote, T.readNote) },
    { ...OPEN_NOTE, execute: run(S.openNote, (args) => T.openNote(args, go)) },
    { ...CREATE_NOTE, execute: run(S.createNote, (args) => T.createNote(args, go)) },
    { ...EDIT_NOTE, execute: run(S.editNote, T.editNote) },
    { ...DUPLICATE_NOTE, execute: run(S.duplicateNote, T.duplicateNote) },
    { ...MOVE_NOTES, execute: run(S.moveNotes, T.moveNotes) },
    { ...TRASH_NOTES, execute: run(S.trashNotes, T.trashNotes) },
    { ...DELETE_NOTES_FOREVER, execute: run(S.deleteNotesForever, T.deleteNotesForever) },
    { ...QUERY_DATABASE, execute: run(S.queryDatabase, T.queryDatabase) },
    { ...UPDATE_DATABASE_ROWS, execute: run(S.updateDatabaseRows, T.updateDatabaseRows) },
    { ...LIST_BLOCKS, execute: run(S.listBlocks, async (args) => (await blocks()).listBlocks(args, ctx())) },
    { ...READ_BLOCK, execute: run(S.readBlock, async (args) => (await blocks()).readBlock(args, ctx())) },
    { ...INSERT_BLOCKS, execute: run(S.insertBlocks, async (args) => (await blocks()).insertBlocks(args, ctx())) },
    { ...UPDATE_BLOCK, execute: run(S.updateBlock, async (args) => (await blocks()).updateBlock(args, ctx())) },
    { ...MOVE_BLOCK, execute: run(S.moveBlock, async (args) => (await blocks()).moveBlock(args, ctx())) },
    { ...DELETE_BLOCKS, execute: run(S.deleteBlocks, async (args) => (await blocks()).deleteBlocks(args, ctx())) },
  ]
}

/** Every tool definition, for schema export and tests. */
export const NOTE_TOOLS = [
  SEARCH_NOTES,
  READ_NOTE,
  OPEN_NOTE,
  CREATE_NOTE,
  EDIT_NOTE,
  DUPLICATE_NOTE,
  MOVE_NOTES,
  TRASH_NOTES,
  DELETE_NOTES_FOREVER,
  QUERY_DATABASE,
  UPDATE_DATABASE_ROWS,
  LIST_BLOCKS,
  READ_BLOCK,
  INSERT_BLOCKS,
  UPDATE_BLOCK,
  MOVE_BLOCK,
  DELETE_BLOCKS,
]
