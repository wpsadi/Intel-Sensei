import type { NodeViewProps } from '@tiptap/react'
import { BookmarkIcon, CodeIcon, GlobeIcon, HardDriveIcon } from 'lucide-react'
import { type ComponentType, useState } from 'react'
import { FaGithub, FaXTwitter } from 'react-icons/fa6'

import { BlockFrame, BlockPlaceholder, Resizable, UrlForm } from '../helpers'

export type EmbedKind = 'bookmark' | 'embed' | 'html' | 'drive' | 'tweet' | 'gist'

const META: Record<
  EmbedKind,
  {
    label: string
    placeholder: string
    icon: ComponentType<{ className?: string }>
  }
> = {
  bookmark: {
    label: 'Add a web bookmark',
    placeholder: 'Paste any link…',
    icon: BookmarkIcon,
  },
  embed: {
    label: 'Embed anything',
    placeholder: 'Paste a link to embed…',
    icon: GlobeIcon,
  },
  html: { label: 'HTML', placeholder: '', icon: CodeIcon },
  drive: {
    label: 'Embed a Google Drive file',
    placeholder: 'Paste a Google Drive link…',
    icon: HardDriveIcon,
  },
  tweet: {
    label: 'Embed a post from X / Twitter',
    placeholder: 'Paste a post link…',
    icon: FaXTwitter,
  },
  gist: {
    label: 'Embed a GitHub Gist',
    placeholder: 'Paste a gist link…',
    icon: FaGithub,
  },
}

/** Google Drive / Docs share links → their embeddable /preview variant. */
function driveUrl(url: string) {
  const file = url.match(/\/d\/([\w-]+)/)?.[1] ?? new URL(url).searchParams.get('id')
  if (!file) return url
  const doc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)/)?.[1]
  return doc ? `https://docs.google.com/${doc}/d/${file}/preview` : `https://drive.google.com/file/d/${file}/preview`
}

const tweetId = (url: string) => url.match(/status\/(\d+)/)?.[1]

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Bookmark({ url, title, description }: { url: string; title: string; description: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 overflow-hidden rounded-md border px-4 py-3 hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{title || host(url)}</div>
        {description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</div>}
        <div className="mt-2 flex items-center gap-2 truncate text-xs">
          <img src={`https://www.google.com/s2/favicons?domain=${host(url)}&sz=32`} alt="" className="size-4" />
          {url}
        </div>
      </div>
    </a>
  )
}

function Frame({ src, srcDoc, height = 420 }: { src?: string; srcDoc?: string; height?: number }) {
  return (
    <iframe
      src={src}
      srcDoc={srcDoc}
      style={{ height }}
      className="w-full rounded-md border bg-white"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
      allowFullScreen
      title="embed"
    />
  )
}

function HtmlBlock({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const [editing, setEditing] = useState(!html)
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-2 py-1 text-xs text-muted-foreground">
        <span>HTML</span>
        <button type="button" onClick={() => setEditing(!editing)} className="rounded px-2 py-0.5 hover:bg-muted">
          {editing ? 'Preview' : 'Edit'}
        </button>
      </div>
      {editing ? (
        <textarea
          value={html}
          onChange={(event) => onChange(event.target.value)}
          placeholder="<h1>Hello</h1>"
          spellCheck={false}
          className="block min-h-40 w-full resize-y bg-muted/30 p-3 font-mono text-xs outline-none"
        />
      ) : (
        <iframe srcDoc={html} sandbox="allow-scripts" className="min-h-40 w-full bg-white" title="html" />
      )}
    </div>
  )
}

export function EmbedView({ node, updateAttributes, selected }: NodeViewProps) {
  const { kind, url, html, title, description, width } = node.attrs as {
    kind: EmbedKind
    width: number
    url: string
    html: string
    title: string
    description: string
  }
  const meta = META[kind]

  if (kind === 'html') {
    return (
      <BlockFrame selected={selected}>
        <HtmlBlock html={html} onChange={(value) => updateAttributes({ html: value })} />
      </BlockFrame>
    )
  }

  if (!url) {
    const Icon = meta.icon
    return (
      <BlockFrame selected={selected}>
        <BlockPlaceholder icon={<Icon className="size-4" />} label={meta.label}>
          <UrlForm
            placeholder={meta.placeholder}
            button={kind === 'bookmark' ? 'Create bookmark' : 'Embed'}
            onSubmit={(value) =>
              updateAttributes({
                url: /^https?:\/\//.test(value) ? value : `https://${value}`,
              })
            }
          />
        </BlockPlaceholder>
      </BlockFrame>
    )
  }

  return (
    <BlockFrame selected={selected}>
      {kind === 'bookmark' ? (
        <Bookmark url={url} title={title} description={description} />
      ) : (
        <Resizable width={width} onResize={(value) => updateAttributes({ width: value })}>
          {kind === 'embed' && <Frame src={url} />}
          {kind === 'drive' && <Frame src={driveUrl(url)} height={480} />}
          {kind === 'tweet' &&
            (tweetId(url) ? (
              <Frame src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId(url)}`} height={560} />
            ) : (
              <Bookmark url={url} title="" description="" />
            ))}
          {kind === 'gist' && (
            <Frame
              height={360}
              srcDoc={`<base target="_blank"><style>body{margin:0}</style><script src="${url.replace(/\.js$/, '')}.js"></script>`}
            />
          )}
        </Resizable>
      )}
    </BlockFrame>
  )
}
