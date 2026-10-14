import type { JSONContent } from '@tiptap/react'

import { EMPTY_DOC } from '../db/repo'

const parseDoc = (content: string): JSONContent => {
  try {
    return JSON.parse(content || EMPTY_DOC)
  } catch {
    return JSON.parse(EMPTY_DOC)
  }
}

const inline = (node: JSONContent): string => {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'mention') return `@${node.attrs?.label ?? node.attrs?.id ?? ''}`
  return (node.content ?? []).map(inline).join('')
}

/** A page's document as plain Markdown-like text, so an agent can read it without editor JSON. */
export function docToText(content: string): string {
  const lines: string[] = []
  const walk = (node: JSONContent, depth: number) => {
    const pad = '  '.repeat(depth)
    switch (node.type) {
      case 'heading':
        lines.push(`${'#'.repeat(node.attrs?.level ?? 1)} ${inline(node)}`)
        return
      case 'paragraph':
        if (inline(node).trim()) lines.push(pad + inline(node))
        return
      case 'codeBlock':
        lines.push('```', inline(node), '```')
        return
      case 'horizontalRule':
        lines.push('---')
        return
      case 'listItem':
      case 'taskItem': {
        const [first, ...rest] = node.content ?? []
        const box = node.type === 'taskItem' ? (node.attrs?.checked ? '[x] ' : '[ ] ') : ''
        lines.push(`${pad}- ${box}${first ? inline(first) : ''}`)
        rest.forEach((child) => walk(child, depth + 1))
        return
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        node.content?.forEach((child) => walk(child, depth))
        return
      case 'blockquote':
        node.content?.forEach((child) => lines.push(`> ${inline(child)}`))
        return
      default:
        node.content?.forEach((child) => walk(child, depth))
    }
  }
  walk(parseDoc(content), 0)
  return lines.join('\n')
}
