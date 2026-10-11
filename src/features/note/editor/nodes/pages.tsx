import { ArrowUpRightIcon, ChevronRightIcon, FileIcon, FileTextIcon } from 'lucide-react'
import { BlockFrame, BlockPlaceholder, atomBlock, useEditorPage } from './helpers'
import { Fragment, useEffect, useState } from 'react'
import { useAllPages, useAncestry, useMediaUrl, usePage } from '../../db/hooks'
import { Link } from 'react-router-dom'
import type { NodeViewProps } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { isMediaRef } from '../../db/media'
import { lucideIcon } from '../../lib/page-icons'

/** An uploaded image used as a page icon. */
function MediaIcon({ src, className }: { src: string; className?: string }) {
  const url = useMediaUrl(src)
  return url ? <img src={url} alt="" className={cn('size-4 rounded-sm object-cover', className)} /> : <span className={className} />
}

export const pageTitle = (title: string | undefined) => title || 'New Page'

/** True when the page's document has any text in it. Empty pages show a blank-page icon. */
export function hasText(content: string | undefined) {
  if (!content) return false
  const walk = (node: { text?: string; content?: unknown[] }): boolean =>
    Boolean(node.text?.trim()) || Boolean(node.content?.some((child) => walk(child as typeof node)))
  try {
    return walk(JSON.parse(content))
  } catch {
    return false
  }
}

/** The page's emoji if set; otherwise a filled-page icon for pages with text and a blank-page icon for empty ones. */
export function PageIcon({ icon, content, className }: { icon?: string; content?: string; className?: string }) {
  if (icon && isMediaRef(icon)) return <MediaIcon src={icon} className={className} />
  const Lucide = lucideIcon(icon)
  if (Lucide) return <Lucide className={cn('size-4 text-muted-foreground', className)} />
  if (icon) return <span className={className}>{icon}</span>
  const Icon = content !== undefined && !hasText(content) ? FileIcon : FileTextIcon
  return <Icon className="size-4 text-muted-foreground" />
}

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
function PageBlockView({ node, updateAttributes, selected }: NodeViewProps) {
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

export const PageBlock = atomBlock('pageBlock', { pageId: '', link: false }, PageBlockView)

/* -------------------------------- breadcrumb ------------------------------ */

function BreadcrumbView({ selected }: NodeViewProps) {
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

export const Breadcrumb = atomBlock('breadcrumb', {}, BreadcrumbView)

/* ----------------------------- table of contents --------------------------- */

interface Heading {
  level: number
  text: string
  pos: number
}

function TocView({ editor, selected }: NodeViewProps) {
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

export const TableOfContents = atomBlock('tableOfContents', {}, TocView)
