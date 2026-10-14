import { BoxIcon, LoaderIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { useS3DDialog } from '../dialogs/dialog-store'
import { importRemoteModel } from '../io'
import { useS3D } from '../store'
import { type DiscoverItem, OWNING_UNITS, searchModels } from './smithsonian'

const SUGGESTED = ['dinosaur', 'space shuttle', 'skull', 'airplane', 'mask', 'shell', 'statue', 'insect']

/** A preview image that falls back to an icon, since not every model publishes one. */
export function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed)
    return (
      <div className="grid size-full place-items-center text-muted-foreground">
        <BoxIcon className="size-8" />
      </div>
    )
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
}

/** A bar that creeps forward, slowing as it nears the end, and waits there until the download finishes. */
function CreepingBar() {
  const [p, setP] = useState(0.05)
  useEffect(() => {
    const t = setInterval(() => setP((v) => v + (0.95 - v) * 0.04), 100)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/25">
      <div className="h-full bg-white transition-[width] duration-100" style={{ width: `${p * 100}%` }} />
    </div>
  )
}

function Card({
  item,
  loading,
  onAdd,
  inScene,
}: {
  item: DiscoverItem
  loading: boolean
  onAdd: (intoScene: boolean) => void
  inScene: boolean
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-square bg-muted">
        <Thumb src={item.thumb} />
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 transition-opacity',
            loading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {loading ? (
            <CreepingBar />
          ) : (
            <>
              {inScene && (
                <Button size="xs" onClick={() => onAdd(true)}>
                  <PlusIcon /> Add to scene
                </Button>
              )}
              <Button size="xs" variant={inScene ? 'secondary' : 'default'} onClick={() => onAdd(false)}>
                <PlusIcon /> New scene
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="line-clamp-2 p-2 text-xs leading-snug" title={item.title}>
        {item.title}
      </div>
    </div>
  )
}

/** Discover: browse and search the Smithsonian's open-access 3D collection and bring models into the file. */
export function DiscoverDialog() {
  const open = useS3DDialog((s) => s.open === 'discover')
  const sceneId = useS3D((s) => s.sceneEdit?.nodeId)
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [unit, setUnit] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<DiscoverItem[]>([])
  const [pages, setPages] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  // A new query or collection starts over from the first batch.
  const [query, setQuery] = useState({ q, unit })
  if (query.q !== q || query.unit !== unit) {
    setQuery({ q, unit })
    setItems([])
    setPages(null)
    setPage(1)
  }

  // Each new request shows the spinner and clears the last error.
  const fetchKey = `${open}|${q}|${unit}|${page}`
  const [lastFetchKey, setLastFetchKey] = useState<string | null>(null)
  if (fetchKey !== lastFetchKey) {
    setLastFetchKey(fetchKey)
    if (open) {
      setLoading(true)
      setError('')
    }
  }

  // Each batch is appended; an empty query browses everything.
  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    searchModels({ q, unit: unit || undefined, page, signal: ctrl.signal })
      .then((r) => {
        setPages(r.pages)
        // A model can straddle two batches; keep its first appearance.
        setItems((prev) => [...prev, ...r.items.filter((x) => !prev.some((y) => y.id === x.id))])
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [open, q, unit, page])

  const more = pages !== null && page < pages
  // Reaching the bottom loads the next batch. Re-observing after every load also fills a screen the first batch did not.
  useEffect(() => {
    const el = sentinel.current
    if (!el || loading || !more) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setPage((p) => p + 1)
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loading, more, items.length])

  const search = (term: string) => {
    setInput(term)
    setQ(term.trim())
    setPage(1)
  }

  const add = async (item: DiscoverItem, intoScene: boolean) => {
    setBusy(item.id)
    try {
      await importRemoteModel(item.glb, item.title, intoScene ? sceneId : undefined)
      useS3DDialog.getState().setOpen(null)
    } catch (e) {
      toast.error(`Could not import: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && useS3DDialog.getState().setOpen(null)}>
      <DialogContent className="flex h-[88vh] w-[min(1200px,94vw)] max-w-none flex-col gap-3 p-0 sm:max-w-none">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Discover 3D models</DialogTitle>
          <DialogDescription>Free, open-access 3D scans from the Smithsonian Institution. Hover a model to bring it in.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2 px-5"
          onSubmit={(e) => {
            e.preventDefault()
            search(input)
          }}
        >
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search fossils, aircraft, artifacts…"
              className="pl-8"
            />
          </div>
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value)
              setPage(1)
            }}
            className="h-9 max-w-56 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">All collections</option>
            {Object.entries(OWNING_UNITS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={loading}>
            {loading ? <LoaderIcon className="animate-spin" /> : <SearchIcon />} Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5 px-5">
          {SUGGESTED.map((s) => (
            <Button key={s} size="xs" variant={q === s ? 'secondary' : 'outline'} onClick={() => search(s)}>
              {s}
            </Button>
          ))}
          {q && (
            <Button size="xs" variant="ghost" onClick={() => search('')}>
              Clear search
            </Button>
          )}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="relative px-5 pb-5">
            {error && <div className="mb-3 rounded-md bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
            {!loading && pages !== null && !items.length && !error && (
              <div className="py-16 text-center text-sm text-muted-foreground">No models found{q && ` for “${q}”`}.</div>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {items.map((item) => (
                <Card key={item.id} item={item} loading={busy === item.id} inScene={!!sceneId} onAdd={(into) => void add(item, into)} />
              ))}
            </div>
            <div ref={sentinel} />
            {loading && (
              <div className={cn('grid place-items-center', items.length ? 'py-6' : 'py-16')}>
                <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && !more && items.length > 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">That's everything{q && ` for “${q}”`}.</div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
