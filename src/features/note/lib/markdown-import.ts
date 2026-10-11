import { Lexer, type Token, marked } from 'marked'

/** Markup that only makes sense as a block: headings, fenced code, lists, quotes, tables, rules, images. */
const BLOCK = /<(h[1-6]|pre|ul|ol|blockquote|table|hr|img)\b/i
/** Inline markup that is worth converting on its own, such as **bold** or `code`. */
const INLINE = /<(strong|em|del|code|a|mark)\b/i

/**
 * HTML for pasted Markdown, or null when the text is plain prose. Plain text stays a plain paste,
 * so a sentence with no Markdown syntax is not turned into anything.
 */
export function markdownToHtml(text: string): string | null {
  const html = marked.parse(text, { gfm: true, async: false })
  return BLOCK.test(html) || INLINE.test(html) ? html : null
}

type Mark = { type: string; attrs?: Record<string, unknown> }
type InlineNode = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' }

/**
 * Inline Markdown (**bold**, *italic*, ~~strike~~, `code`, [links](url)) as editor text nodes, so text written by
 * Sensei shows its formatting instead of the raw asterisks. Text without Markdown comes back as one plain node.
 */
export function inlineMarkdown(text: string): InlineNode[] {
  const out: InlineNode[] = []
  const walk = (tokens: Token[], marks: Mark[]) => {
    for (const t of tokens) {
      const add = (mark: Mark) => walk('tokens' in t && t.tokens ? t.tokens : [], [...marks, mark])
      if (t.type === 'strong') add({ type: 'bold' })
      else if (t.type === 'em') add({ type: 'italic' })
      else if (t.type === 'del') add({ type: 'strike' })
      else if (t.type === 'link') add({ type: 'link', attrs: { href: t.href } })
      else if (t.type === 'codespan') push(t.text, [...marks, { type: 'code' }])
      else if (t.type === 'br') out.push({ type: 'hardBreak' })
      else if (t.type === 'text' && t.tokens?.length) walk(t.tokens, marks)
      // Escapes and plain text carry the raw characters in `text`, with entities still encoded in some cases.
      else if ('text' in t) push(decode(String(t.text)), marks)
      else push(t.raw, marks)
    }
  }
  const push = (value: string, marks: Mark[]) => {
    if (!value) return
    out.push(marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value })
  }
  walk(Lexer.lexInline(text, { gfm: true }), [])
  return out
}

const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!)
