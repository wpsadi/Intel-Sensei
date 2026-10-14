import { cjk } from '@streamdown/cjk'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import type { ComponentProps } from 'react'
import type { BundledLanguage } from 'shiki'
import { type Components, Streamdown } from 'streamdown'

import { CodeBlock, CodeBlockActions, CodeBlockCopyButton, CodeBlockHeader, CodeBlockTitle } from '@/components/ai-elements/code-block'
import { Snippet, SnippetAddon, SnippetCopyButton, SnippetInput } from '@/components/ai-elements/snippet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MarkdownImage, MarkdownLink, MediaGallery, paragraphMedia } from '@/features/ask-sensei/components/chat-media'

const plugins = { cjk, math, mermaid }

/** Languages whose one-line blocks are commands to copy, shown as a snippet. */
const SHELL_LANGUAGES = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'cmd'])

/**
 * Fenced code. A single short shell line becomes a copyable snippet; anything else is a highlighted code
 * block with a copy button. Mermaid and math keep their own renderers.
 */
const components: Components = {
  // Several images or media in a row of their own share one self-adjusting gallery instead of stacking full width.
  p: ({ children }) => {
    const media = paragraphMedia(children)
    return media ? <MediaGallery items={media} /> : <p>{children}</p>
  },
  img: MarkdownImage,
  a: MarkdownLink,
  // Streamdown puts list markers inside the text box with no indent, so lists sit flush left; indent them like prose.
  ul: ({ children }) => (
    <ul className="my-2 list-outside list-disc space-y-1 pl-5 marker:text-muted-foreground [&_ul]:list-[circle]">{children}</ul>
  ),
  ol: ({ children }) => <ol className="my-2 list-outside list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>p]:inline">{children}</li>,
  // Tables look like S-Note's database table view: no outer box, row lines, thin column dividers, muted headers.
  table: ({ children }) => (
    <ScrollArea className="my-2">
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </ScrollArea>
  ),
  th: ({ children }) => (
    <th className="min-w-32 border-y border-r px-2 py-1.5 text-left font-normal text-muted-foreground last:border-r-0">{children}</th>
  ),
  td: ({ children }) => <td className="border-r border-b px-2 py-1.5 align-top last:border-r-0">{children}</td>,
  // Without this, Streamdown sends inline `code` through the block renderer below.
  inlineCode: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
  code({ className, children }) {
    const language = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? ''
    const code = String(children ?? '').replace(/\n$/, '')
    if (language === 'mermaid') return <code className={className}>{children}</code>
    if (SHELL_LANGUAGES.has(language) && !code.includes('\n') && code.length <= 120) {
      return (
        <Snippet code={code.replace(/^\$\s*/, '')} className="my-2">
          <SnippetAddon>
            <span className="pl-2 text-muted-foreground">$</span>
          </SnippetAddon>
          <SnippetInput />
          <SnippetAddon align="inline-end">
            <SnippetCopyButton />
          </SnippetAddon>
        </Snippet>
      )
    }
    return (
      <CodeBlock code={code} language={(language || 'text') as BundledLanguage} className="my-2">
        <CodeBlockHeader>
          <CodeBlockTitle>{language || 'code'}</CodeBlockTitle>
          <CodeBlockActions>
            <CodeBlockCopyButton />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    )
  },
}

/** Renders chat text as markdown: headings, lists, to-dos, quotes, tables, images, video and audio, code blocks, snippets, math and mermaid diagrams. */
export function Markdown({ children }: { children: string }) {
  return (
    <Streamdown plugins={plugins} components={components}>
      {children}
    </Streamdown>
  )
}
