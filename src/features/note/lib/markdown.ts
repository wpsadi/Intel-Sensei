import type { Page } from '../db/types'

/** Loose shape of a serialized Tiptap node. */
interface Json {
  type?: string
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  attrs?: Record<string, unknown>
  content?: Json[]
}

const LISTS = new Set(['bulletList', 'orderedList', 'taskList'])

function wrap(text: string, marks: Json['marks'] = []) {
  return marks.reduce((t, mark) => {
    switch (mark.type) {
      case 'bold':
        return `**${t}**`
      case 'italic':
        return `*${t}*`
      case 'strike':
        return `~~${t}~~`
      case 'code':
        return `\`${t}\``
      case 'link':
        return `[${t}](${mark.attrs?.href ?? ''})`
      default:
        return t
    }
  }, text)
}

function inline(node: Json): string {
  const children = () => (node.content ?? []).map(inline).join('')
  switch (node.type) {
    case 'text':
      return wrap(node.text ?? '', node.marks)
    case 'hardBreak':
      return '\n'
    case 'mention':
      return node.attrs?.kind === 'date' ? `@${node.attrs.date}` : `@${node.attrs?.label ?? ''}`
    case 'emoji':
      return String(node.attrs?.emoji ?? node.attrs?.name ?? '')
    case 'inlineMath':
      return `$${node.attrs?.latex ?? ''}$`
    default:
      return children()
  }
}

function listItem(item: Json, pad: string, marker: string, depth: number) {
  const kids = item.content ?? []
  const text = kids
    .filter((kid) => !LISTS.has(kid.type ?? ''))
    .map(inline)
    .join('\n')
  const nested = kids.filter((kid) => LISTS.has(kid.type ?? '')).map((kid) => block(kid, depth + 1))
  return [`${pad}${marker}${text}`, ...nested].join('\n')
}

function table(node: Json) {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => (cell.content ?? []).map(inline).join(' ').replace(/\|/g, '\\|')),
  )
  if (!rows.length) return ''
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n')
}

function block(node: Json, depth = 0): string {
  const pad = '  '.repeat(depth)
  const kids = node.content ?? []
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inline(node)}`
    case 'paragraph':
      return inline(node)
    case 'blockquote':
      return kids
        .map((kid) => block(kid))
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'codeBlock':
      return `\`\`\`${node.attrs?.language ?? ''}\n${inline(node)}\n\`\`\``
    case 'horizontalRule':
      return '---'
    case 'blockMath':
      return `$$\n${node.attrs?.latex ?? ''}\n$$`
    case 'bulletList':
      return kids.map((item) => listItem(item, pad, '- ', depth)).join('\n')
    case 'orderedList':
      return kids.map((item, i) => listItem(item, pad, `${i + 1}. `, depth)).join('\n')
    case 'taskList':
      return kids.map((item) => listItem(item, pad, `- [${item.attrs?.checked ? 'x' : ' '}] `, depth)).join('\n')
    case 'table':
      return table(node)
    case 'media': {
      // Kept as a link to the stored file, so an editor that reads this Markdown again shows the same picture or file.
      const kind = String(node.attrs?.kind || 'file')
      const name = String(node.attrs?.name || kind).replace(/[[\]]/g, '')
      const src = String(node.attrs?.src ?? '')
      if (!src) return `[${name}]`
      return kind === 'image' ? `![${name}](${src})` : `[${name}](${src} "${kind}")`
    }
    case 'embed':
      return String(node.attrs?.url ?? '')
    case 'pageBlock':
      return ''
    default:
      return kids
        .map((kid) => block(kid, depth))
        .filter(Boolean)
        .join('\n\n')
  }
}

/** Readable Markdown of a serialized Tiptap document: its blocks, with no title. */
export function docToMarkdown(content: string) {
  let doc: Json = {}
  try {
    doc = JSON.parse(content)
  } catch {
    // Unparseable content exports as an empty body.
  }
  const body = (doc.content ?? [])
    .map((node) => block(node))
    .filter(Boolean)
    .join('\n\n')
  return `${body}\n`
}

/** Readable Markdown of a page: title, then its blocks. Used for copy and export. */
export function pageToMarkdown(page: Pick<Page, 'title' | 'content'>) {
  return `# ${page.title || 'Untitled'}\n\n${docToMarkdown(page.content)}`
}
