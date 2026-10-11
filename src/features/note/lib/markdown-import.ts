import { marked } from 'marked'

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
