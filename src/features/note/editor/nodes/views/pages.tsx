import type { NodeViewProps } from '@tiptap/react'
import { ArrowUpRightIcon, ChevronRightIcon } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAllPages, useAncestry, usePage } from '../../../db/hooks'
import { useEditorPage } from '../block-utils'
import { BlockFrame, BlockPlaceholder } from '../helpers'
import { pageTitle } from '../page-utils'
import { PageIcon } from '../PageIcon'

/** Picker listing every page; used by "Link to page". */
function PagePicker({ onPick }: { onPick: (id: string) => void }) {
  const pages = useAllPages()
  const { pageId } = useEditorPage()
  const [query, setQuery] = useState('')
  const results = (pages ?? [])
    .filter((p) => !p.trashed && p.id !== pageId && pageTitle(p.title).toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)
  return (
    <div className="w-full">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search for a page to link…"
        className="mb-1 h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground outline-none"
      />
      {results.map((page) => (
        <button
          key={page.id}
          type="button"
          onClick={() => onPick(page.id)}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-foreground hover:bg-muted"
        >
          <PageIcon icon={page.icon} content={page.content} /> {pageTitle(page.title)}
        </button>
      ))}
    </div>
  )
}

/** "Page" (owns a sub page) and "Link to page" (references any page). */
export function PageBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const { pageId, link } = node.attrs as { pageId: string; link: boolean }
  const page = usePage(pageId || undefined)

  if (!pageId) {
    return (
      <BlockFrame selected={selected}>
        <BlockPlaceholder icon={<ArrowUpRightIcon className="size-4" />} label="Link to page">
          <PagePicker onPick={(id) => updateAttributes({ pageId: id })} />
        </BlockPlaceholder>
      </BlockFrame>
    )
  }

  return (
    <BlockFrame selected={selected}>
      <Link
        to={`/s-note/${pageId}`}
        className="flex items-center gap-2 rounded-md px-1 py-1 text-[15px] hover:bg-muted"
        style={{ opacity: page?.trashed ? 0.5 : 1 }}
      >
        <PageIcon icon={page?.icon} content={page?.content} />
        <span className="border-b border-foreground/20 font-medium">{page ? pageTitle(page.title) : 'Page not found'}</span>
        {link && <ArrowUpRightIcon className="size-3 text-muted-foreground" />}
      </Link>
    </BlockFrame>
  )
}

/* -------------------------------- breadcrumb ------------------------------ */

export function BreadcrumbView({ selected }: NodeViewProps) {
  const { pageId } = useEditorPage()
  const chain = useAncestry(pageId) ?? []
  return (
    <BlockFrame selected={selected}>
      <nav className="flex flex-wrap items-center gap-1 py-1 text-sm text-muted-foreground">
        {chain.map((page, index) => (
          <Fragment key={page.id}>
            {index > 0 && <ChevronRightIcon className="size-3" />}
            <Link to={`/s-note/${page.id}`} className="flex items-center gap-1 rounded px-1 hover:bg-muted hover:text-foreground">
              {page.icon && <PageIcon icon={page.icon} />}
              {pageTitle(page.title)}
            </Link>
          </Fragment>
        ))}
      </nav>
    </BlockFrame>
  )
}

/* ----------------------------- table of contents --------------------------- */

interface Heading {
  level: number
  text: string
  pos: number
}

export function TocView({ editor, selected }: NodeViewProps) {
  const [headings, setHeadings] = useState<Heading[]>([])

  useEffect(() => {
    const collect = () => {
      const found: Heading[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.textContent) found.push({ level: node.attrs.level, text: node.textContent, pos })
      })
      setHeadings((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found))
    }
    collect()
    editor.on('update', collect)
    return () => {
      editor.off('update', collect)
    }
  }, [editor])

  const jump = (pos: number) => {
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <BlockFrame selected={selected}>
      <div className="py-1">
        {headings.length === 0 && <p className="text-sm text-muted-foreground">Add headings to create a table of contents.</p>}
        {headings.map((heading) => (
          <button
            key={heading.pos}
            type="button"
            onClick={() => jump(heading.pos)}
            style={{ paddingLeft: `${(heading.level - 1) * 1.25 + 0.25}rem` }}
            className="block w-full truncate rounded py-0.5 text-left text-sm text-muted-foreground underline decoration-foreground/20 underline-offset-4 hover:bg-muted"
          >
            {heading.text}
          </button>
        ))}
      </div>
    </BlockFrame>
  )
}
