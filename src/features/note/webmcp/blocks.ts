import type { Editor, JSONContent } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { z } from 'zod'
import { BLOCKS } from '../editor/blocks/registry'
import { getLiveEditor, waitForLiveEditor } from '../editor/live-editors'
import { useNoteStore } from '../note.store'
import { pageTitle } from '../editor/nodes/pages'
import { markdownToDoc } from './markdown'
import { inlineMarkdown } from '../lib/markdown-import'
import { findDatabase, findPage, isoDay, parseDate } from './tools'
import { assertRead, forgetRead, markRead } from './read-guard'
import type * as S from './schemas'

/*
 * Block-level tools. Reads work from the live editor when the note is open, otherwise from the saved document.
 * Writes always go through the live editor (opening the note first) and insert blocks with the same `run` the
 * "/" menu uses, so every block behaves exactly as if the user had added it: databases, sub-pages and synced
 * blocks are created for real, and the change is undoable with Ctrl+Z.
 */

export interface BlockContext {
  /** The note on screen, used when a tool call names no note. */
  currentPageId?: string
  go: (path: string) => void
}

const PAGE_SIZE = 15
const INLINE = new Set(['text', 'hardBreak', 'mention', 'emoji', 'inlineMath'])
const TEXTBLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'detailsSummary'])
const EMBED_KEYS: Record<string, string> = { embed: 'embed', bookmark: 'bookmark', html: 'html', tweet: 'tweet', drive: 'drive', gist: 'gist' }

const state = () => useNoteStore.getState()
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const para = (text: string): JSONContent => ({ type: 'paragraph', content: text ? inlineMarkdown(text) : [] })

/* ------------------------------ describing ------------------------------ */

/** The block's kind, named like the "/" menu keys so list output feeds straight into insert_blocks. */
function kindOf(node: JSONContent): string {
  const attrs = node.attrs ?? {}
  switch (node.type) {
    case 'paragraph': return 'text'
    case 'heading': return `h${attrs.level}`
    case 'bulletList': return 'bullet'
    case 'orderedList': return 'numbered'
    case 'taskList': return 'todo'
    case 'listItem': return 'item'
    case 'taskItem': return 'todo_item'
    case 'details': return attrs.level ? `th${attrs.level}` : 'toggle'
    case 'detailsSummary': return 'toggle_title'
    case 'detailsContent': return 'toggle_body'
    case 'blockquote': return 'quote'
    case 'codeBlock': return attrs.language === 'mermaid' ? 'mermaid' : 'code'
    case 'horizontalRule': return 'divider'
    case 'media': return String(attrs.kind)
    case 'embed': return EMBED_KEYS[String(attrs.kind)] ?? 'embed'
    case 'pageBlock': return attrs.link ? 'link-page' : 'page'
    case 'databaseBlock': return 'database'
    case 'tableOfContents': return 'toc'
    case 'buttonBlock': return 'button'
    case 'aiBlock': return 'ai'
    case 'blockMath': return 'equation'
    case 'columns': return `col${node.content?.length ?? 0}`
    case 'tabPanel': return 'tab'
    case 'tableRow': return 'row'
    case 'tableCell':
    case 'tableHeader': return 'cell'
    case 'syncedBlock': return 'synced'
    default: return node.type ?? 'unknown'
  }
}

const inlineText = (node: JSONContent): string => {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'mention') return `@${node.attrs?.label ?? ''}`
  if (node.type === 'inlineMath') return `$${node.attrs?.latex ?? ''}$`
  if (node.type === 'emoji') return node.attrs?.name ? `:${node.attrs.name}:` : ''
  return (node.content ?? []).map(inlineText).join(TEXTBLOCKS.has(node.type ?? '') ? '' : ' ')
}

const childBlocks = (node: JSONContent) => (node.content ?? []).filter((child) => !INLINE.has(child.type ?? ''))

/** What an atom block points at, in words: the linked note, database, URL, label or formula. */
function atomText(node: JSONContent): string {
  const attrs = node.attrs ?? {}
  const { pages, databases } = state()
  switch (node.type) {
    case 'pageBlock': {
      const page = pages[String(attrs.pageId)]
      if (!page) return attrs.pageId ? '(missing note)' : '(no note chosen)'
      return pageTitle(page.kind === 'database' ? databases[page.databaseId ?? '']?.title : page.title)
    }
    case 'databaseBlock': return attrs.databaseId ? (databases[String(attrs.databaseId)]?.title || 'Untitled database') : '(no database chosen)'
    case 'media': return String(attrs.caption || attrs.name || attrs.src || '(empty)')
    case 'embed': return String(attrs.title || attrs.url || (attrs.html ? 'custom HTML' : '(empty)'))
    case 'buttonBlock': return String(attrs.label)
    case 'aiBlock': return String(attrs.prompt || '(no prompt)')
    case 'blockMath': return String(attrs.latex || '(empty)')
    default: return ''
  }
}

function summarize(node: JSONContent, path: string) {
  const children = childBlocks(node)
  const text = atomText(node) || inlineText(node)
  const comments = (node.attrs?.comments as unknown[] | undefined)?.length
  return {
    block: path,
    type: kindOf(node),
    text: text ? clip(text, 70) : undefined,
    children: children.length && !TEXTBLOCKS.has(node.type ?? '') ? children.length : undefined,
    checked: node.type === 'taskItem' ? Boolean(node.attrs?.checked) : undefined,
    comments: comments || undefined,
  }
}

/* ------------------------------- locating ------------------------------- */

function pageFor(note: string | undefined, ctx: BlockContext) {
  if (note) return findPage(note)
  const page = ctx.currentPageId ? state().pages[ctx.currentPageId] : undefined
  if (!page) throw new Error('No note is open. Pass note (title or id), or call open_note first.')
  return page
}

/** The note's document as JSON: live when open (it may be ahead of the last save), saved otherwise. */
function documentOf(note: string | undefined, ctx: BlockContext) {
  const page = pageFor(note, ctx)
  if (page.kind === 'database') throw new Error(`"${pageTitle(page.title)}" is a database, not a text note. Use query_database for it.`)
  const live = getLiveEditor(page.id)
  return { page, doc: live ? live.getJSON() : (JSON.parse(page.content || '{"type":"doc","content":[]}') as JSONContent) }
}

const splitPath = (path: string) => path.split('.').map(Number)

function jsonAt(doc: JSONContent, path: string) {
  let node = doc
  for (const index of splitPath(path)) {
    const next = node.content?.[index]
    if (!next) throw new Error(`There is no block ${path}. Call list_blocks to see the current addresses.`)
    node = next
  }
  return node
}

function nodeAt(doc: PMNode, path: string) {
  let node = doc
  let pos = -1
  for (const index of splitPath(path)) {
    if (index >= node.childCount) throw new Error(`There is no block ${path}. Call list_blocks to see the current addresses.`)
    let childPos = pos + 1
    for (let i = 0; i < index; i++) childPos += node.child(i).nodeSize
    node = node.child(index)
    pos = childPos
  }
  return { node, pos }
}

/** The address of the node that starts at `pos`. */
function pathAt(doc: PMNode, pos: number) {
  const $pos = doc.resolve(pos)
  return Array.from({ length: $pos.depth + 1 }, (_, depth) => $pos.index(depth)).join('.')
}

/** The open, editable editor for a note, opening the note first when it is not on screen. */
async function editorFor(note: string | undefined, ctx: BlockContext): Promise<{ editor: Editor; title: string; pageId: string }> {
  const page = pageFor(note, ctx)
  const title = pageTitle(page.title)
  if (page.kind === 'database') throw new Error(`"${title}" is a database, not a text note. Use update_database_rows for it.`)
  if (page.locked) throw new Error(`"${title}" is locked. Ask the user before unlocking it with edit_note (locked: false).`)
  let editor = getLiveEditor(page.id)
  if (!editor) {
    ctx.go(`/s-note/${page.id}`)
    editor = await waitForLiveEditor(page.id)
  }
  if (!editor) throw new Error(`Could not open "${title}" for editing. Try open_note, then retry.`)
  assertRead(page.id, title, editor.getJSON())
  return { editor, title, pageId: page.id }
}

function targetPos(doc: PMNode, position: z.output<typeof S.insertBlocks>['position']) {
  const where = position?.where ?? 'end'
  if (where === 'end') {
    // The editor always keeps an empty paragraph last for typing into; new blocks go above it.
    const last = doc.lastChild
    return last?.type.name === 'paragraph' && last.content.size === 0 ? doc.content.size - last.nodeSize : doc.content.size
  }
  if (where === 'start') return 0
  if (!position?.block) throw new Error(`position.block is required when where is "${where}".`)
  const { node, pos } = nodeAt(doc, position.block)
  if (where === 'before') return pos
  if (where === 'after') return pos + node.nodeSize
  if (node.isTextblock || node.isAtom) throw new Error(`Block ${position.block} (${kindOf(node.toJSON())}) cannot hold other blocks. Use after instead.`)
  return pos + 1 + node.content.size
}

/** Applies a transaction, turning schema violations into advice instead of a crash. */
function apply(editor: Editor, build: (tr: Editor['state']['tr']) => void, where: string) {
  const tr = editor.state.tr
  try {
    build(tr)
  } catch {
    throw new Error(`That block cannot go ${where}. List items only live inside lists, and table cells inside tables; place it after the whole list or table instead.`)
  }
  editor.view.dispatch(tr)
}

/* ------------------------------- filling -------------------------------- */

type Content = { text?: string; items?: string[]; rows?: string[][]; attrs?: Record<string, unknown> }

/** Writes text, items, rows and settings into a block's JSON, resolving note and database names. */
async function fill(json: JSONContent, { text, items, rows, attrs }: Content) {
  const store = state()
  if (rows) {
    if (json.type !== 'table') throw new Error('rows only apply to table blocks.')
    json.content = rows.map((cells, r) => ({ type: 'tableRow', content: cells.map((cell) => ({ type: r === 0 ? 'tableHeader' : 'tableCell', content: [para(cell)] })) }))
  }
  if (items) {
    const lines = items.map(para)
    switch (json.type) {
      case 'bulletList':
      case 'orderedList':
        json.content = items.map((item) => ({ type: 'listItem', content: [para(item)] }))
        break
      case 'taskList':
        json.content = items.map((item) => ({ type: 'taskItem', attrs: { checked: /^\[x\]\s*/i.test(item) }, content: [para(item.replace(/^\[[ x]\]\s*/i, ''))] }))
        break
      case 'columns':
        json.content = items.map((item) => ({ type: 'column', content: [para(item)] }))
        break
      case 'tabs':
        json.content = items.map((title, i) => ({ type: 'tabPanel', attrs: { title }, content: json.content?.[i]?.content ?? [para('')] }))
        break
      case 'details':
        json.content = [json.content?.[0] ?? { type: 'detailsSummary' }, { type: 'detailsContent', content: lines }]
        break
      case 'callout':
      case 'blockquote':
      case 'column':
      case 'tabPanel':
      case 'detailsContent':
        json.content = lines
        break
      default:
        throw new Error(`items do not apply to a ${kindOf(json)} block. Use them for lists, toggles, columns, tabs, callouts and quotes.`)
    }
  }
  if (text !== undefined) {
    const a = (json.attrs ??= {})
    switch (json.type) {
      case 'pageBlock': {
        if (a.link) a.pageId = findPage(text).id
        else {
          const page = store.pages[String(a.pageId)]
          if (page?.kind === 'database' && page.databaseId) await store.updateDatabase(page.databaseId, { title: text })
          else if (page) await store.updatePage(page.id, { title: text })
        }
        break
      }
      case 'databaseBlock': {
        if (a.databaseId && a.ownerId === a.databaseId) {
          await store.updateDatabase(String(a.databaseId), { title: text })
        } else {
          const database = findDatabase(text)
          const owner = crypto.randomUUID()
          await store.createView(database.id, owner, 'table')
          Object.assign(a, { databaseId: database.id, ownerId: owner })
        }
        break
      }
      case 'media': a.src = text; a.name = text.split('/').pop(); break
      case 'embed': if (a.kind === 'html') a.html = text; else a.url = /^https?:\/\//.test(text) ? text : `https://${text}`; break
      case 'buttonBlock': a.label = text; break
      case 'aiBlock': a.prompt = text; break
      case 'blockMath': a.latex = text; break
      default: {
        const target = firstTextblock(json)
        if (!target) throw new Error(`A ${kindOf(json)} block has no text of its own. Use items, rows or attrs instead.`)
        // Code keeps its characters as written; other text turns its inline Markdown into formatting.
        target.content = !text ? [] : target.type === 'codeBlock' ? [{ type: 'text', text }] : inlineMarkdown(text)
      }
    }
  }
  if (attrs) json.attrs = { ...json.attrs, ...attrs }
}

function firstTextblock(json: JSONContent): JSONContent | undefined {
  if (TEXTBLOCKS.has(json.type ?? '')) return json
  for (const child of json.content ?? []) {
    const found = firstTextblock(child)
    if (found) return found
  }
}

/** Replaces the block at `pos` with its filled version, rejecting settings the block does not have. */
async function fillAt(editor: Editor, pos: number, content: Content) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const unknown = Object.keys(content.attrs ?? {}).filter((key) => !(key in node.attrs))
  if (unknown.length) {
    const known = Object.keys(node.attrs).filter((key) => key !== 'comments')
    throw new Error(`A ${kindOf(node.toJSON())} block has no setting ${unknown.join(', ')}. ${known.length ? `Its settings: ${known.join(', ')}.` : 'It has no settings.'}`)
  }
  const json = node.toJSON() as JSONContent
  await fill(json, content)
  const next = editor.schema.nodeFromJSON(json)
  next.check()
  // Re-read the position: filling may have awaited store writes while the document changed.
  const current = editor.state.doc.nodeAt(pos)
  apply(editor, (tr) => tr.replaceWith(pos, pos + (current ?? node).nodeSize, next), 'here')
}

/* -------------------------------- inserting ------------------------------- */

const INLINE_KEYS = new Set(['mention-person', 'mention-page', 'date', 'emoji', 'inline-equation'])

/** Inline items, which the "/" menu inserts through a pop-up, built directly as a paragraph holding them. */
async function inlineParagraph(type: string, text = ''): Promise<JSONContent> {
  if (!text) throw new Error(`${type} needs text: ${type === 'mention-person' ? 'the person\'s name' : type === 'mention-page' ? 'the note title' : type === 'date' ? 'a date like "tomorrow"' : type === 'emoji' ? 'the emoji' : 'the LaTeX'}.`)
  switch (type) {
    case 'mention-person': {
      const person = state().people.find((p) => p.name.toLowerCase() === text.toLowerCase()) ?? (await state().createPerson(text))
      return { type: 'paragraph', content: [{ type: 'mention', attrs: { kind: 'person', id: person.id, label: person.name } }, { type: 'text', text: ' ' }] }
    }
    case 'mention-page': {
      const page = findPage(text)
      return { type: 'paragraph', content: [{ type: 'mention', attrs: { kind: 'page', id: page.id, label: pageTitle(page.title) } }, { type: 'text', text: ' ' }] }
    }
    case 'date': {
      const date = parseDate(text)
      if (!date) throw new Error(`Could not read "${text}" as a date. Use 2026-10-20, "today", "tomorrow" or "in 3 days".`)
      const value = isoDay(date)
      return { type: 'paragraph', content: [{ type: 'mention', attrs: { kind: 'date', id: value, label: value, date: value, reminder: false } }, { type: 'text', text: ' ' }] }
    }
    case 'emoji':
      return para(text)
    default:
      return { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: text } }] }
  }
}

/** Inserts one block at `at` and returns the position just after it. */
async function insertOne(editor: Editor, at: number, spec: z.output<typeof S.insertBlocks>['blocks'][number]) {
  const { type, ...content } = spec
  const direct = async (nodes: JSONContent[]) => {
    // Built through the editor's schema rather than importing ProseMirror here, so this lazy chunk adds no new dependency.
    const built = nodes.map((json) => editor.schema.nodeFromJSON(json))
    apply(editor, (tr) => tr.insert(at, built), 'here')
    return at + built.reduce((size, node) => size + node.nodeSize, 0)
  }
  if (type === 'markdown') return direct(markdownToDoc(content.text ?? '', '').content ?? [])
  if (INLINE_KEYS.has(type)) return direct([await inlineParagraph(type, content.text)])
  // The "/" menu's equation opens a LaTeX pop-up; build it directly with the formula instead.
  if (type === 'equation') return direct([{ type: 'blockMath', attrs: { latex: content.text ?? '' } }])

  const definition = BLOCKS.find((b) => b.key === type)!
  // Same as the "/" menu: an empty paragraph is the slash line, and `run` turns it into the block.
  apply(editor, (tr) => tr.insert(at, editor.schema.nodes.paragraph.create()), 'here')
  editor.commands.setTextSelection(at + 1)
  await definition.run(editor, { from: at + 1, to: at + 1 })
  if (content.text !== undefined || content.items || content.rows || content.attrs) await fillAt(editor, at, content)
  return at + (editor.state.doc.nodeAt(at)?.nodeSize ?? 0)
}

/* ---------------------------------- tools --------------------------------- */

export function listBlocks({ note, inside, page }: z.output<typeof S.listBlocks>, ctx: BlockContext) {
  const { page: owner, doc } = documentOf(note, ctx)
  markRead(owner.id, doc)
  const parent = inside ? jsonAt(doc, inside) : doc
  const children = childBlocks(parent)
  const counts: Record<string, number> = {}
  children.forEach((child) => (counts[kindOf(child)] = (counts[kindOf(child)] ?? 0) + 1))
  return {
    note: pageTitle(owner.title),
    untitled: owner.title ? undefined : true,
    inside,
    total_count: children.length,
    counts_by_type: counts,
    page,
    page_size: PAGE_SIZE,
    has_more: page * PAGE_SIZE < children.length,
    blocks: children
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((child, i) => summarize(child, inside ? `${inside}.${(page - 1) * PAGE_SIZE + i}` : String((page - 1) * PAGE_SIZE + i))),
  }
}

/** One block in full, or several at once as `{ blocks }` with an `error` in place of any address that does not exist. */
export function readBlock({ note, block, blocks }: z.output<typeof S.readBlock>, ctx: BlockContext) {
  const { page, doc } = documentOf(note, ctx)
  markRead(page.id, doc)
  if (!blocks) return readOne(doc, block!)
  const all = block ? [block, ...blocks.filter((b) => b !== block)] : blocks
  return {
    blocks: all.map((b) => {
      try {
        return readOne(doc, b)
      } catch (error) {
        return { block: b, error: error instanceof Error ? error.message : String(error) }
      }
    }),
  }
}

function readOne(doc: JSONContent, block: string) {
  const node = jsonAt(doc, block)
  const { comments, ...attrs } = node.attrs ?? {}
  const children = childBlocks(node)
  return {
    ...summarize(node, block),
    text: clip(atomText(node) || inlineText(node), 1000) || undefined,
    attrs: Object.keys(attrs).length ? attrs : undefined,
    comments: (comments as { text: string }[] | undefined)?.map((c) => c.text),
    children: TEXTBLOCKS.has(node.type ?? '') ? undefined : children.slice(0, 10).map((child, i) => summarize(child, `${block}.${i}`)),
  }
}

export async function insertBlocks({ note, position, blocks }: z.output<typeof S.insertBlocks>, ctx: BlockContext) {
  const { editor, title, pageId } = await editorFor(note, ctx)
  let at = targetPos(editor.state.doc, position)
  const added: string[] = []
  for (const spec of blocks) {
    const start = at
    at = await insertOne(editor, at, spec)
    added.push(`${pathAt(editor.state.doc, start)} ${spec.type}`)
  }
  // Later blocks moved down, so the next edit needs a fresh read.
  forgetRead(pageId)
  return { status: 'inserted', note: title, blocks: added, total_count: editor.state.doc.childCount, next: 'Call list_blocks before editing again.' }
}

/** Blocks whose text kind the "/" menu commands can switch in place. */
const IN_PLACE = new Set(['paragraph', 'heading', 'codeBlock', 'listItem', 'taskItem'])
/** Kinds that take a list of lines as `items` when a multi-line block is converted into them. */
const ITEM_KINDS = new Set(['bullet', 'numbered', 'todo', 'toggle', 'th1', 'th2', 'th3', 'callout', 'quote', 'col2', 'col3', 'col4', 'col5', 'tabs'])
const CONVERT_KEYS: Record<string, string> = { text: 'text', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', bullet: 'bullet', numbered: 'numbered', todo: 'todo', quote: 'quote', code: 'code' }

/** True when text uses Markdown that makes whole blocks: headings, lists, quotes, rules, code fences, tables, or several paragraphs. */
export const hasBlockMarkdown = (text: string) => /\n\s*\n|^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|-{3,}\s*$|\|.+\|)/m.test(text)

export async function updateBlock(args: z.output<typeof S.updateBlock>, ctx: BlockContext) {
  const { note, block, convert_to, checked, comment, ...content } = args
  const { editor, title, pageId } = await editorFor(note, ctx)
  let { node, pos } = nodeAt(editor.state.doc, block)

  if (convert_to) {
    const json = node.toJSON() as JSONContent
    if (CONVERT_KEYS[convert_to] && IN_PLACE.has(node.type.name)) {
      // Text kinds convert in place with the "/" menu command, keeping inline formatting.
      const inner = node.isTextblock ? pos + 1 : pos + 2
      editor.commands.setTextSelection(inner)
      await BLOCKS.find((b) => b.key === CONVERT_KEYS[convert_to])!.run(editor, { from: inner, to: inner })
      ;({ node, pos } = nodeAt(editor.state.doc, block))
    } else {
      // Any other change of kind replaces the block where it stands, carrying its content over.
      const lines = childBlocks(json).map(inlineText).filter(Boolean)
      const takesItems = ITEM_KINDS.has(convert_to) && lines.length > 1
      const carried = {
        text: content.text ?? (takesItems ? undefined : atomText(json) || inlineText(json) || undefined),
        items: content.items ?? (takesItems ? lines : undefined),
        rows: content.rows,
        attrs: content.attrs,
      }
      apply(editor, (tr) => tr.delete(pos, pos + node.nodeSize), 'removed')
      await insertOne(editor, pos, { type: convert_to, ...carried })
      forgetRead(pageId)
      return { status: 'converted', note: title, block: summarize(editor.state.doc.nodeAt(pos)!.toJSON(), pathAt(editor.state.doc, pos)), next: 'Call list_blocks before editing again.' }
    }
  }
  const attrs: Record<string, unknown> = { ...content.attrs }
  if (checked !== undefined) {
    if (node.type.name !== 'taskItem') throw new Error(`Block ${block} is a ${kindOf(node.toJSON())}, not a to-do item. Use list_blocks with inside: "${block}" to find its items.`)
    attrs.checked = checked
  }
  if (comment) {
    if (!('comments' in node.attrs)) throw new Error(`A ${kindOf(node.toJSON())} block cannot hold comments.`)
    attrs.comments = [...((node.attrs.comments as unknown[]) ?? []), { id: crypto.randomUUID(), text: comment, createdAt: Date.now() }]
  }
  // Markdown with headings, lists and the like in a plain text block becomes real blocks, as when it is pasted or inserted.
  if (!convert_to && content.text !== undefined && !content.items && !content.rows && !content.attrs && checked === undefined && !comment && (node.type.name === 'paragraph' || node.type.name === 'heading') && hasBlockMarkdown(content.text)) {
    const parsed = markdownToDoc(content.text, pageId).content ?? []
    if (parsed.length && !(parsed.length === 1 && parsed[0].type === 'paragraph')) {
      try {
        const nodes = parsed.map((json) => editor.schema.nodeFromJSON(json))
        nodes.forEach((next) => next.check())
        apply(editor, (tr) => tr.replaceWith(pos, pos + node.nodeSize, nodes), 'here')
        forgetRead(pageId)
        return { status: 'updated', note: title, block: summarize(editor.state.doc.nodeAt(pos)!.toJSON(), block), replaced_with: `${nodes.length} block${nodes.length === 1 ? '' : 's'} from the Markdown`, next: 'Call list_blocks before editing again.' }
      } catch {
        // Blocks of those kinds cannot go here (for example inside a list), so the text is written as inline Markdown below.
      }
    }
  }
  const hasAttrs = Object.keys(attrs).length > 0
  if (!convert_to && !hasAttrs && content.text === undefined && !content.items && !content.rows) {
    throw new Error('Nothing to change. Pass text, items, rows, attrs, checked, comment or convert_to.')
  }
  await fillAt(editor, pos, { ...content, attrs: hasAttrs ? attrs : undefined })
  // Addresses are unchanged by an in-place edit, so the agent may keep editing without reading again.
  markRead(pageId, editor.getJSON())
  return { status: 'updated', note: title, block: summarize(editor.state.doc.nodeAt(pos)!.toJSON(), block) }
}

export async function moveBlock({ note, block, position }: z.output<typeof S.moveBlock>, ctx: BlockContext) {
  const { editor, title, pageId } = await editorFor(note, ctx)
  const { node, pos } = nodeAt(editor.state.doc, block)
  const target = targetPos(editor.state.doc, position)
  if (target > pos && target < pos + node.nodeSize) throw new Error(`Block ${block} cannot move inside itself.`)
  let landed = 0
  apply(
    editor,
    (tr) => {
      tr.delete(pos, pos + node.nodeSize)
      landed = tr.mapping.map(target)
      tr.insert(landed, node)
    },
    `${position.where} block ${position.block ?? ''}`.trim(),
  )
  forgetRead(pageId)
  return { status: 'moved', note: title, type: kindOf(node.toJSON()), now_at: pathAt(editor.state.doc, landed) }
}

export async function deleteBlocks({ note, blocks, empty_note }: z.output<typeof S.deleteBlocks>, ctx: BlockContext) {
  const { editor, title, pageId } = await editorFor(note, ctx)
  const doc = editor.state.doc
  // Resolve every address first so earlier deletions do not shift later ones; drop blocks inside deleted ones.
  const ranges = [...new Set(blocks)]
    .map((path) => {
      const { node, pos } = nodeAt(doc, path)
      return { path, from: pos, to: pos + node.nodeSize, type: kindOf(node.toJSON()) }
    })
    .sort((a, b) => b.from - a.from)
  const kept = ranges.filter((r) => !ranges.some((o) => o !== r && o.from <= r.from && o.to >= r.to && (o.from !== r.from || o.to !== r.to)))
  // Emptying a note is never a side effect of a smaller request.
  const filled: number[] = []
  doc.forEach((child, offset) => {
    if (child.content.size || child.isAtom) filled.push(offset)
  })
  if (!empty_note && filled.length > 1 && filled.every((offset) => kept.some((r) => r.from <= offset && offset < r.to))) {
    throw new Error(`This would remove every block of "${title}". Only do that if the user asked to clear the whole note, then pass empty_note: true. Nothing was deleted.`)
  }
  apply(editor, (tr) => kept.forEach((r) => tr.delete(r.from, r.to)), 'removed')
  forgetRead(pageId)
  return { status: 'deleted', note: title, deleted: kept.map((r) => `${r.path} ${r.type}`).reverse(), total_count: editor.state.doc.childCount, undo: 'The user can press Ctrl+Z to undo.' }
}
