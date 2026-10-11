import { marked } from 'marked'

/**
 * The kinds of block an answer is made of. Text is spoken as it is. The others are visual, so a voice
 * cannot read them: they get a description instead.
 */
export type BlockType = 'text' | 'table' | 'code' | 'diagram' | 'math'

export interface Block {
  type: BlockType
  /** The block as Markdown. */
  raw: string
  /** The language of a code block. */
  lang?: string
}

/** Splits a Markdown answer into blocks, in order. Neighbouring text blocks (paragraphs, headings, lists, quotes) are joined into one. */
export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const add = (block: Block) => {
    const last = blocks.at(-1)
    if (block.type === 'text' && last?.type === 'text') last.raw += `\n\n${block.raw}`
    else blocks.push(block)
  }
  for (const token of marked.lexer(markdown)) {
    const raw = token.raw.trim()
    if (token.type === 'space' || !raw) continue
    if (token.type === 'table') add({ type: 'table', raw })
    else if (token.type === 'code') add({ type: token.lang === 'mermaid' ? 'diagram' : 'code', raw, lang: token.lang })
    else if (raw.startsWith('$$')) add({ type: 'math', raw })
    else add({ type: 'text', raw })
  }
  return blocks
}

/** Markdown text as plain words, so a voice does not read out asterisks, hashes or link addresses. */
export function toSpeech(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
