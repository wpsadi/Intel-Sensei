import { formatDistanceToNow } from 'date-fns'
import { CopyIcon, FileIcon, FilePlusIcon, FolderOpenIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { COMMANDS } from '@/features/s-3d/commands'
import { docsRepo, settingsRepo, uid, versionsRepo } from '@/features/s-3d/db'
import { exportNodes, exportSvgString, exportVideo } from '@/features/s-3d/export/exporter'
import { encodeDoc } from '@/features/s-3d/export/share'
import { deleteFile, downloadBlob, listFiles, touchFile } from '@/features/s-3d/files'
import { addFilesToCanvas, fileFromRef, openFiles } from '@/features/s-3d/io'
import { useS3D } from '@/features/s-3d/store'
import type { Doc, ExportSetting, FileMeta, Version } from '@/features/s-3d/types'

import { SenseiAskModal } from '../agent/ask-user'
import { DiscoverDialog } from '../discover/discover-dialog'
import { useS3DDialog } from './dialog-store'

const field = 'h-7 rounded-md border bg-transparent px-2 text-xs'
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex items-center justify-between gap-3 text-xs">
    <span className="text-muted-foreground">{label}</span>
    {children}
  </label>
)

function Shell({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  const open = useS3DDialog((s) => s.open === id)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && useS3DDialog.getState().setOpen(null)}>
      <DialogContent className={className ?? 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
        </DialogHeader>
        {open && children}
      </DialogContent>
    </Dialog>
  )
}

const pageFrames = () => {
  const { doc, pageId } = useS3D.getState()
  return (doc.pages.find((p) => p.id === pageId)?.children ?? []).filter((id) => ['frame', 'section'].includes(doc.nodes[id]?.type))
}

/* ---------- export ---------- */

function ExportBody() {
  const selection = useS3D((s) => s.selection)
  const [scope, setScope] = useState<'selection' | 'page' | 'all'>(selection.length ? 'selection' : 'page')
  const [format, setFormat] = useState<ExportSetting['format']>('png')
  const [scale, setScale] = useState(2)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)

  const ids = useMemo(() => {
    const { doc } = useS3D.getState()
    if (scope === 'selection') return selection
    if (scope === 'page')
      return pageFrames().length ? pageFrames() : (doc.pages.find((p) => p.id === useS3D.getState().pageId)?.children ?? [])
    return doc.pages.flatMap((p) => p.children.filter((id) => ['frame', 'section'].includes(doc.nodes[id]?.type)))
  }, [scope, selection])

  const [previewIds, setPreviewIds] = useState<string[] | null>(null)
  if (previewIds !== ids) {
    setPreviewIds(ids)
    if (!ids.length) setPreview('')
  }

  useEffect(() => {
    let alive = true
    if (!ids.length) return
    void exportSvgString([ids[0]])
      .then((svg) => {
        if (alive) setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [ids])

  const run = async () => {
    setBusy(true)
    try {
      await exportNodes(ids, [
        { id: uid(), format, scale, suffix: scale !== 1 && format !== 'svg' && format !== 'pdf' ? `@${scale}x` : '' },
      ])
      toast.success(`Exported ${ids.length} item${ids.length > 1 ? 's' : ''}`)
      useS3DDialog.getState().setOpen(null)
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid h-40 place-items-center rounded-md border bg-[repeating-conic-gradient(#8881_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
        {preview ? (
          <img src={preview} alt="Preview" className="max-h-36 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">Nothing to export</span>
        )}
      </div>
      <Row label="Scope">
        <select className={field} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="selection" disabled={!selection.length}>
            Selection ({selection.length})
          </option>
          <option value="page">Frames on this page</option>
          <option value="all">Frames on all pages</option>
        </select>
      </Row>
      <Row label="Format">
        <select className={field} value={format} onChange={(e) => setFormat(e.target.value as ExportSetting['format'])}>
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
          <option value="svg">SVG</option>
          <option value="pdf">PDF</option>
        </select>
      </Row>
      {format !== 'svg' && (
        <Row label="Scale">
          <select className={field} value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {[0.5, 1, 1.5, 2, 3, 4].map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </Row>
      )}
      <DialogFooter>
        <span className="mr-auto text-xs text-muted-foreground">
          {ids.length} item{ids.length === 1 ? '' : 's'}
          {format === 'pdf' ? ' → 1 PDF' : ''}
        </span>
        <Button size="sm" disabled={!ids.length || busy} onClick={run}>
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      </DialogFooter>
    </div>
  )
}

/* ---------- video ---------- */

const RES = { '720p': [1280, 720], '1080p': [1920, 1080], '4k': [3840, 2160], square: [1080, 1080] } as const

function VideoBody() {
  const doc = useS3D((s) => s.doc)
  const frames = useMemo(() => pageFrames(), [])
  const initial = useS3D.getState().selection[0]
  const [nodeId, setNodeId] = useState(initial && doc.nodes[initial] ? initial : (frames[0] ?? ''))
  const [duration, setDuration] = useState(5)
  const [fps, setFps] = useState(30)
  const [res, setRes] = useState<keyof typeof RES | 'node'>('1080p')
  const [progress, setProgress] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const node = doc.nodes[nodeId]
  const [w, h] = res === 'node' ? [Math.round(node?.w ?? 1280) & ~1, Math.round(node?.h ?? 720) & ~1] : RES[res]

  const run = async () => {
    abort.current = new AbortController()
    setProgress(0)
    try {
      const blob = await exportVideo({ nodeId, duration, fps, width: w, height: h, onProgress: setProgress, signal: abort.current.signal })
      downloadBlob(blob, `${node?.name ?? 'video'}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`)
      toast.success('Video exported')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(`Video export failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="grid gap-3">
      <Row label="Frame">
        <select className={field} value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
          {initial && doc.nodes[initial] && !frames.includes(initial) && (
            <option value={initial}>{doc.nodes[initial].name} (selection)</option>
          )}
          {frames.map((id) => (
            <option key={id} value={id}>
              {doc.nodes[id].name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Duration (s)">
        <Input
          type="number"
          className="h-7 w-24 text-xs"
          min={1}
          max={120}
          value={duration}
          onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
        />
      </Row>
      <Row label="Frame rate">
        <select className={field} value={fps} onChange={(e) => setFps(Number(e.target.value))}>
          {[24, 30, 60].map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </Row>
      <Row label="Resolution">
        <select className={field} value={res} onChange={(e) => setRes(e.target.value as typeof res)}>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="4k">4K</option>
          <option value="square">Square 1080</option>
          <option value="node">Frame size</option>
        </select>
      </Row>
      <p className="text-xs text-muted-foreground">
        {w}×{h} · animations with an “On load” trigger are recorded in real time.
      </p>
      {progress !== null && <Progress value={progress * 100} />}
      <DialogFooter>
        {progress !== null ? (
          <Button size="sm" variant="outline" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" disabled={!node} onClick={run}>
            Render video
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

/* ---------- share ---------- */

function ShareBody() {
  const doc = useS3D((s) => s.doc)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(useS3D.getState().pageId)
  const [hideUi, setHideUi] = useState(false)
  const [interactive, setInteractive] = useState(true)
  const [responsive, setResponsive] = useState(true)
  const [publishedAt, setPublishedAt] = useState<number | null>(null)

  useEffect(() => {
    void settingsRepo.get<{ publishedAt: number } | null>(`published:${doc.id}`, null).then((p) => setPublishedAt(p?.publishedAt ?? null))
  }, [doc.id])

  const publish = async () => {
    setBusy(true)
    try {
      const data = await encodeDoc(doc)
      setUrl(`${location.origin}/s-3d/embed#${data}`)
      const at = Date.now()
      await settingsRepo.set(`published:${doc.id}`, { publishedAt: at, doc })
      setPublishedAt(at)
    } catch (e) {
      toast.error(`Publish failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const link = useMemo(() => {
    if (!url) return ''
    const [base, hash] = url.split('#')
    const q = new URLSearchParams()
    if (page !== doc.pages[0]?.id) q.set('page', page)
    if (hideUi) q.set('hideUi', '1')
    if (!interactive) q.set('interactive', '0')
    return `${base}${q.size ? `?${q}` : ''}#${hash}`
  }, [url, page, hideUi, interactive, doc.pages])

  const frame = doc.nodes[(doc.pages.find((p) => p.id === page)?.children ?? []).find((id) => doc.nodes[id]?.type === 'frame') ?? '']
  const ratio = frame ? (frame.h / frame.w) * 100 : 56.25
  const embed = !link
    ? ''
    : responsive
      ? `<div style="position:relative;width:100%;padding-top:${ratio.toFixed(2)}%"><iframe src="${link}" style="position:absolute;inset:0;width:100%;height:100%" frameborder="0" allowfullscreen></iframe></div>`
      : `<iframe src="${link}" width="${frame?.w ?? 800}" height="${frame?.h ?? 600}" frameborder="0" allowfullscreen></iframe>`
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success('Copied'))

  return (
    <div className="grid gap-3">
      <Row label="Start page">
        <select className={field} value={page} onChange={(e) => setPage(e.target.value)}>
          {doc.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Hide player UI">
        <input type="checkbox" checked={hideUi} onChange={(e) => setHideUi(e.target.checked)} />
      </Row>
      <Row label="Allow interaction">
        <input type="checkbox" checked={interactive} onChange={(e) => setInteractive(e.target.checked)} />
      </Row>
      <Row label="Responsive embed">
        <input type="checkbox" checked={responsive} onChange={(e) => setResponsive(e.target.checked)} />
      </Row>
      {link && (
        <>
          <div className="flex gap-1">
            <Input readOnly value={link} className="h-7 text-xs" />
            <Button size="icon-sm" variant="outline" aria-label="Copy link" onClick={() => copy(link)}>
              <CopyIcon />
            </Button>
          </div>
          {link.length > 60_000 && (
            <p className="text-xs text-amber-600">
              This link is {Math.round(link.length / 1024)} KB. Some apps truncate long URLs; large images make it bigger.
            </p>
          )}
          <div className="flex gap-1">
            <textarea
              readOnly
              value={embed}
              className="h-16 flex-1 resize-none rounded-md border bg-transparent p-2 font-mono text-[10px]"
            />
            <Button size="icon-sm" variant="outline" aria-label="Copy embed code" onClick={() => copy(embed)}>
              <CopyIcon />
            </Button>
          </div>
        </>
      )}
      <DialogFooter>
        <span className="mr-auto text-xs text-muted-foreground">
          {publishedAt ? `Published ${formatDistanceToNow(publishedAt, { addSuffix: true })}` : 'Not published yet'}
        </span>
        {link && (
          <Button size="sm" variant="outline" onClick={() => window.open(link, '_blank')}>
            Open
          </Button>
        )}
        <Button size="sm" disabled={busy} onClick={publish}>
          {busy ? 'Publishing…' : url ? 'Update link' : 'Publish'}
        </Button>
      </DialogFooter>
    </div>
  )
}

/* ---------- versions ---------- */

function VersionsBody() {
  const doc = useS3D((s) => s.doc)
  const [versions, setVersions] = useState<Version[]>([])
  const [label, setLabel] = useState('')
  const reload = () => void versionsRepo.list(doc.id).then(setVersions)
  useEffect(reload, [doc.id])

  return (
    <div className="grid gap-3">
      <div className="flex gap-1">
        <Input placeholder="Version name" value={label} onChange={(e) => setLabel(e.target.value)} className="h-7 text-xs" />
        <Button
          size="sm"
          onClick={async () => {
            await useS3D.getState().saveNow(label || 'Manual save')
            setLabel('')
            reload()
          }}
        >
          Save version
        </Button>
      </div>
      <ScrollArea className="h-72 rounded-md border">
        {!versions.length && <p className="p-4 text-center text-xs text-muted-foreground">No versions yet.</p>}
        {versions.map((v) => (
          <div key={v.id} className="flex items-center gap-2 border-b px-3 py-2 text-xs last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{v.label}</div>
              <div className="text-muted-foreground">
                {formatDistanceToNow(v.createdAt, { addSuffix: true })} · {v.doc.pages.length} pages · {Object.keys(v.doc.nodes).length}{' '}
                layers
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                useS3D.getState().restoreVersion(v.doc)
                toast.success(`Restored “${v.label}”`)
                useS3DDialog.getState().setOpen(null)
              }}
            >
              Restore
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete version"
              onClick={async () => {
                await versionsRepo.remove(v.id)
                reload()
              }}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
      </ScrollArea>
    </div>
  )
}

/* ---------- open ---------- */

const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`)

function OpenBody() {
  const current = useS3D((s) => s.doc.id)
  const [docs, setDocs] = useState<Doc[]>([])
  const [files, setFiles] = useState<FileMeta[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const reload = () => {
    void docsRepo.list().then((all) => setDocs(all.filter((d) => (d.kind ?? 'design') === useS3D.getState().service)))
    void listFiles().then(setFiles)
  }
  useEffect(reload, [])
  const close = () => useS3DDialog.getState().setOpen(null)

  return (
    <Tabs defaultValue="projects" className="gap-3">
      <TabsList>
        <TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
      </TabsList>
      <TabsContent value="projects">
        <ScrollArea className="h-72 rounded-md border">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 border-b px-3 py-2 text-xs last:border-0">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                {renaming === d.id ? (
                  <Input
                    autoFocus
                    defaultValue={d.name}
                    className="h-6 text-xs"
                    onBlur={async (e) => {
                      const name = e.target.value.trim() || d.name
                      if (d.id === current) useS3D.getState().renameDoc(name)
                      else await docsRepo.put({ ...d, name, nameLocked: true })
                      setRenaming(null)
                      setTimeout(reload, 50)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                ) : (
                  <div className="truncate font-medium" onDoubleClick={() => setRenaming(d.id)}>
                    {d.name}
                    {d.id === current && <span className="ml-1 text-muted-foreground">(open)</span>}
                  </div>
                )}
                <div className="text-muted-foreground">
                  Edited {formatDistanceToNow(d.updatedAt, { addSuffix: true })} · {d.pages.length} pages
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(d.id)}>
                Rename
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={d.id === current}
                onClick={async () => {
                  await useS3D.getState().openDoc(d.id)
                  close()
                }}
              >
                Open
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete project"
                onClick={async () => {
                  if (confirm(`Delete “${d.name}”?`)) {
                    await useS3D.getState().deleteDoc(d.id)
                    reload()
                  }
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </ScrollArea>
      </TabsContent>
      <TabsContent value="files">
        <ScrollArea className="h-72 rounded-md border">
          {!files.length && <p className="p-4 text-center text-xs text-muted-foreground">Files you open or import are kept here.</p>}
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 border-b px-3 py-2 text-xs last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}</div>
                <div className="text-muted-foreground">
                  {f.kind} · {fmtSize(f.size)} · {formatDistanceToNow(f.lastOpenedAt, { addSuffix: true })}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={f.kind === 'other'}
                onClick={async () => {
                  const file = await fileFromRef(`s3d-file:${f.id}`, f.name)
                  if (!file) return toast.error('The file is no longer in the cache')
                  await touchFile(f.id)
                  close()
                  await addFilesToCanvas([file])
                }}
              >
                {f.kind === 'project' ? 'Open' : 'Insert'}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete file"
                onClick={async () => {
                  await deleteFile(f.id)
                  reload()
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </ScrollArea>
      </TabsContent>
      <DialogFooter>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await useS3D.getState().newDoc()
            close()
          }}
        >
          <FilePlusIcon /> New project
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            close()
            await openFiles()
          }}
        >
          <FolderOpenIcon /> Open from computer…
        </Button>
      </DialogFooter>
    </Tabs>
  )
}

function ShortcutsBody() {
  return (
    <ScrollArea className="h-96">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 pr-3">
        {COMMANDS.filter((c) => c.shortcut).map((c) => (
          <div key={c.id} className="flex items-center justify-between border-b py-1 text-xs">
            <span>{c.label}</span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{c.shortcut}</kbd>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

export function S3DDialogs() {
  return (
    <>
      <Shell id="export" title="Export" description="PNG, JPG, SVG or a multi-page PDF.">
        <ExportBody />
      </Shell>
      <Shell id="video" title="Export video" description="Record a frame and its animations.">
        <VideoBody />
      </Shell>
      <Shell id="share" title="Share & embed" description="The link carries the whole design, so anyone can view it without an account.">
        <ShareBody />
      </Shell>
      <Shell id="versions" title="Version history">
        <VersionsBody />
      </Shell>
      <Shell id="open" title="Open" className="sm:max-w-lg">
        <OpenBody />
      </Shell>
      <Shell id="shortcuts" title="Keyboard shortcuts" className="sm:max-w-xl">
        <ShortcutsBody />
      </Shell>
      <DiscoverDialog />
      <SenseiAskModal />
    </>
  )
}
