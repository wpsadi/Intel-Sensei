import { CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, LoaderCircleIcon, XIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { type ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Markdown } from '@/features/ask-sensei/components/markdown'
import { useMediaUrl } from '@/features/note/db/hooks'
import { onMediaUpdated, readMedia, updateMedia } from '@/features/note/db/media'
import type { ChatAttachment } from '@/features/note/db/types'
import { useCopy } from '@/hooks/use-copy'
import { useIsMobile } from '@/hooks/use-mobile'
import { connectFrame, withFrameBridge } from '@/lib/sandbox-frame'
import { cn } from '@/lib/utils'

import { ARTIFACT_MIN_WIDTH, type ArtifactKind, artifactKind, useArtifacts } from './artifact.store'

// The viewers are large (PDF engine, spreadsheet grid, slide renderer), so each loads when its first file opens.
const PdfViewer = lazy(() => import('@/components/extend/pdf-viewer').then((module) => ({ default: module.PDFViewer })))
const DocxViewer = lazy(() => import('@/components/extend/docx-viewer').then((module) => ({ default: module.DocxViewerPreview })))
const XlsxViewer = lazy(() => import('@/components/extend/xlsx-viewer').then((module) => ({ default: module.XlsxViewerPreview })))
const PptxViewer = lazy(() => import('@/components/extend/pptx-viewer').then((module) => ({ default: module.PptxViewerPreview })))
const CsvViewer = lazy(() => import('@/components/extend/csv-viewer').then((module) => ({ default: module.CsvViewer })))

// S-Note's editor is large, so it loads when the first document opens.
const DocumentEditor = lazy(() => import('@/features/note/editor/DocumentEditor').then((module) => ({ default: module.DocumentEditor })))

/** The text of a stored file, '' while it loads and null when it is gone. */
function useFileText(src: string, enabled: boolean, reload = 0) {
  const [text, setText] = useState<string | null>('')
  useEffect(() => {
    if (!enabled) return
    let alive = true
    setText('')
    void readMedia(src).then(async (blob) => alive && setText(blob ? await blob.text() : null))
    return () => {
      alive = false
    }
  }, [src, enabled, reload])
  return text
}

const Note = ({ children }: { children: string }) => <p className="p-6 text-sm text-muted-foreground">{children}</p>

/** An HTML file in a sandboxed frame, connected to this app over Postmate. */
function HtmlFrame({ title, html }: { title: string; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const srcDoc = useMemo(() => withFrameBridge(html), [html])
  useEffect(() => {
    if (!frame.current) return
    const connection = connectFrame(frame.current)
    // A page that removed the bridge never answers, which is fine: it just stays unconnected.
    connection.catch(() => {})
    return () =>
      void connection.then(
        (child) => child.destroy(),
        () => {},
      )
  }, [srcDoc])
  // No same-origin: the page can run its own scripts but cannot reach this app or its data. Postmate is the only way in.
  return <iframe ref={frame} title={title} srcDoc={srcDoc} sandbox="allow-scripts allow-popups" className="size-full border-0 bg-white" />
}

/** The first link in a Google Drive shortcut file (`.gdoc` and the like hold JSON with a `url`), or null. */
function googleLink(text: string) {
  try {
    const url = (JSON.parse(text) as { url?: unknown }).url
    return typeof url === 'string' && /^https:\/\/(docs|drive|sites|script)\.google\.com\//.test(url) ? url : null
  } catch {
    return null
  }
}

/** A Google Docs, Sheets or Slides file: Drive only gives a link to it, so show the link and say how to get the real file. */
function GoogleFile({ text }: { text: string }) {
  const link = googleLink(text)
  return (
    <div className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
      <p>
        This is a Google Drive shortcut, not the document itself, so there is nothing to preview here. In Google, choose File → Download as
        Word (.docx), Excel (.xlsx), PowerPoint (.pptx) or PDF, then attach that file.
      </p>
      {link && (
        <Button variant="outline" size="sm" render={<a href={link} target="_blank" rel="noreferrer" />}>
          <ExternalLinkIcon /> Open in Google
        </Button>
      )}
    </div>
  )
}

function Body({
  file,
  kind,
  text,
  onEdit,
}: {
  file: ChatAttachment
  kind: ArtifactKind | null
  text: string | null
  onEdit: (markdown: string) => void
}) {
  const url = useMediaUrl(
    kind === 'pdf' || kind === 'image' || kind === 'docx' || kind === 'xlsx' || kind === 'pptx' ? file.src : undefined,
  )
  const { resolvedTheme } = useTheme()
  const [dark, setDark] = useState(resolvedTheme === 'dark')
  if (!kind) return <Note>This kind of file cannot be previewed here. Download it to open it.</Note>
  // The viewers have their own toolbars; upload and download are the panel's job (the file is already here).
  const viewer = { fileName: file.name, src: url, showUpload: false, showDownload: false, className: 'size-full' }
  if (kind === 'pdf' || kind === 'docx' || kind === 'xlsx' || kind === 'pptx') {
    if (!url) return null
    return (
      <Suspense fallback={null}>
        {kind === 'pdf' ? (
          <PdfViewer {...viewer} />
        ) : kind === 'docx' ? (
          <DocxViewer {...viewer} isDark={dark} onIsDarkChange={setDark} />
        ) : kind === 'xlsx' ? (
          <XlsxViewer {...viewer} isDark={dark} onIsDarkChange={setDark} />
        ) : (
          <PptxViewer {...viewer} />
        )}
      </Suspense>
    )
  }
  if (kind === 'google') return text === null ? <Note>This file is no longer saved in the browser.</Note> : <GoogleFile text={text} />
  if (kind === 'csv')
    return text === null ? (
      <Note>This file is no longer saved in the browser.</Note>
    ) : (
      <Suspense fallback={null}>
        <CsvViewer data={text} search className="size-full" />
      </Suspense>
    )
  if (kind === 'image')
    return url ? (
      <ScrollArea className="size-full">
        <img src={url} alt={file.name} className="mx-auto max-w-full p-4" />
      </ScrollArea>
    ) : null
  if (text === null) return <Note>This file is no longer saved in the browser.</Note>
  // Not loaded yet: the editor reads its content only on mount.
  if (!text && kind !== 'text') return null
  if (kind === 'html') return <HtmlFrame title={file.name} html={text} />
  if (kind === 'markdown')
    return (
      <ScrollArea className="size-full">
        <Suspense fallback={null}>
          <DocumentEditor markdown={text} onChange={onEdit} />
        </Suspense>
      </ScrollArea>
    )
  return (
    <ScrollArea className="size-full">
      <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{text}</pre>
    </ScrollArea>
  )
}

/** The panel's frame: on the right of the chat with a drag handle, or over the whole screen on a phone. */
function Frame({
  label,
  title,
  actions,
  children,
  onClose,
}: {
  label: string
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  onClose: () => void
}) {
  const width = useArtifacts((state) => state.width)
  const setWidth = useArtifacts((state) => state.setWidth)
  const mobile = useIsMobile()
  const closing = useArtifacts((state) => state.closing)
  const drag = useRef<{ x: number; width: number } | null>(null)
  // Slide out first, then let the panel go.
  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => useArtifacts.setState({ current: null, closing: false }), 200)
    return () => clearTimeout(timer)
  }, [closing])
  return (
    <aside
      aria-label={label}
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-background fill-mode-forwards md:relative md:inset-auto md:z-auto md:shrink-0 md:border-l',
        closing
          ? 'animate-out fade-out slide-out-to-right-8 duration-200'
          : 'animate-in fade-in slide-in-from-right-8 duration-300 ease-out',
      )}
      style={mobile ? undefined : { width }}
    >
      {!mobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize document"
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, width }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setWidth(Math.max(ARTIFACT_MIN_WIDTH, Math.min(window.innerWidth * 0.7, drag.current.width + drag.current.x - event.clientX)))
          }}
          onPointerUp={() => void (drag.current = null)}
        />
      )}
      <header className="flex h-(--header-height) shrink-0 items-center gap-1 border-b px-3">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-medium">{title}</h2>
        {actions}
        <Button variant="ghost" size="icon-sm" aria-label="Close document" onClick={onClose}>
          <XIcon />
        </Button>
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </aside>
  )
}

/** A document Sensei is writing: its text so far, filling in as it streams. It becomes the editor once it is saved. */
export function DraftPanel({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const draft = useArtifacts((state) => state.drafts[draftId])
  const end = useRef<HTMLDivElement>(null)
  const content = draft?.content
  // Follow the newest text, the way the chat follows a reply.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [content])
  if (!draft) return null
  return (
    <Frame
      label={`Writing: ${draft.name}`}
      onClose={onClose}
      title={
        <>
          <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          <span className="truncate">{draft.name}</span>
        </>
      }
    >
      <ScrollArea className="size-full">
        {draft.format === 'markdown' ? (
          <div className="mx-auto max-w-3xl px-6 py-5 text-sm">
            <Markdown>{draft.content}</Markdown>
          </div>
        ) : (
          <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{draft.content}</pre>
        )}
        <div ref={end} />
      </ScrollArea>
    </Frame>
  )
}

/**
 * The file Sensei made, open on the right of the chat like the terminal is open at the bottom. On a phone it covers the
 * screen instead. A Markdown document opens in S-Note's editor and every edit is saved back into the stored attachment,
 * which is also the copy the terminal reads. When Sensei rewrites the document, it is loaded again.
 */
export function ArtifactPanel({ file, onClose }: { file: ChatAttachment; onClose: () => void }) {
  const kind = artifactKind(file)
  const [reload, setReload] = useState(0)
  const stored = useFileText(
    file.src,
    kind === 'markdown' || kind === 'html' || kind === 'text' || kind === 'csv' || kind === 'google',
    reload,
  )
  // The newest text, including edits the editor has made since the file was read.
  const edited = useRef<string | null>(null)
  const { copied, copy } = useCopy()

  useEffect(
    () =>
      onMediaUpdated((src, origin) => {
        if (src !== file.src || origin !== 'agent') return
        edited.current = null
        setReload((count) => count + 1)
      }),
    [file.src],
  )

  const save = (markdown: string) => {
    edited.current = markdown
    void updateMedia(file.src, new Blob([markdown], { type: file.type || 'text/markdown' }), file.name)
  }
  const withUrl = async (action: (url: string) => void) => {
    const blob = await readMedia(file.src)
    if (blob) action(URL.createObjectURL(blob))
  }
  const download = () =>
    void withUrl((url) => {
      Object.assign(document.createElement('a'), { href: url, download: file.name }).click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    })
  const openInTab = () => void withUrl((url) => window.open(url, '_blank', 'noopener'))

  return (
    <Frame
      label={`Document: ${file.name}`}
      onClose={onClose}
      title={<span className="truncate">{file.name}</span>}
      actions={
        <>
          {stored && (
            <Button variant="ghost" size="icon-sm" aria-label="Copy" onClick={() => void copy(edited.current ?? stored)}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={download}>
            <DownloadIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Open in a new tab" onClick={openInTab}>
            <ExternalLinkIcon />
          </Button>
        </>
      }
    >
      <Body key={reload} file={file} kind={kind} text={stored} onEdit={save} />
    </Frame>
  )
}
