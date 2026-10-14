import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AnimationStyles, NodeView } from '@/features/s-3d/render/node-view'
import { RenderContext, type RenderCtx } from '@/features/s-3d/render/render-context'
import { useS3D } from '@/features/s-3d/store'
import type { Doc, Interaction, SNode } from '@/features/s-3d/types'

const isFrame = (n?: SNode) => !!n && (n.type === 'frame' || n.type === 'section')

function loadAnims(doc: Doc, rootId: string) {
  const out: Record<string, string> = {}
  const visit = (id: string) => {
    const n = doc.nodes[id]
    if (!n) return
    const i = n.interactions.find((x) => x.trigger === 'load' && x.action === 'animate' && x.animation)
    if (i?.animation) out[id] = i.animation
    n.children.forEach(visit)
  }
  visit(rootId)
  return out
}

export function Player({
  doc,
  startPageId,
  startFrameId,
  hideUi,
  interactive = true,
  onClose,
}: {
  doc: Doc
  startPageId?: string
  startFrameId?: string
  hideUi?: boolean
  interactive?: boolean
  onClose?: () => void
}) {
  const [pageId, setPageId] = useState<string | undefined>(() => doc.pages.find((p) => p.id === startPageId)?.id ?? doc.pages[0]?.id)
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
  const frames = useMemo(() => (page?.children ?? []).filter((id) => isFrame(doc.nodes[id]) && doc.nodes[id].visible), [doc, page])
  const [frameId, setFrameId] = useState<string | undefined>(() =>
    startFrameId && frames.includes(startFrameId) ? startFrameId : frames[0],
  )
  const [states, setStates] = useState<Record<string, string>>({})
  const [anims, setAnims] = useState<Record<string, string>>({})
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [transition, setTransition] = useState<{ duration: number; easing: string; key: number }>({ duration: 0, easing: 'ease', key: 0 })
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if ((!frameId || !frames.includes(frameId)) && frameId !== frames[0]) setFrameId(frames[0])

  // Each frame (or document edit) starts from that frame's stored animations.
  const [animsFor, setAnimsFor] = useState<{ doc: Doc; frameId: string | undefined } | null>(null)
  if (!animsFor || animsFor.doc !== doc || animsFor.frameId !== frameId) {
    setAnimsFor({ doc, frameId })
    if (frameId) setAnims(loadAnims(doc, frameId))
  }

  const go = useCallback((id: string | undefined, i?: Interaction) => {
    if (!id) return
    setTransition((t) => ({
      duration: i?.duration ?? 300,
      easing: i?.easing === 'spring' ? 'cubic-bezier(.34,1.56,.64,1)' : (i?.easing ?? 'ease'),
      key: t.key + 1,
    }))
    setFrameId(id)
  }, [])

  const run = useCallback(
    (n: SNode, i: Interaction) => {
      switch (i.action) {
        case 'go-to-frame': {
          const target = i.target && doc.nodes[i.target] ? i.target : undefined
          if (target) {
            const p = doc.pages.find((pg) => pg.children.includes(target))
            if (p && p.id !== pageId) setPageId(p.id)
          }
          go(target, i)
          break
        }
        case 'go-to-page':
          if (i.target) {
            setPageId(i.target)
            setFrameId((doc.pages.find((p) => p.id === i.target)?.children ?? []).find((id) => isFrame(doc.nodes[id])))
          }
          break
        case 'set-state': {
          const target = i.target || n.id
          setStates((s) => ({ ...s, [target]: i.value ?? '' }))
          break
        }
        case 'toggle-visibility': {
          const target = i.target || n.id
          setHidden((h) => ({ ...h, [target]: !(h[target] ?? !doc.nodes[target]?.visible) }))
          break
        }
        case 'open-url':
          if (i.value) window.open(i.value, '_blank', 'noopener')
          break
        case 'animate': {
          const target = i.target || n.id
          if (!i.animation) break
          setAnims((a) => ({ ...a, [target]: '' }))
          requestAnimationFrame(() => setAnims((a) => ({ ...a, [target]: i.animation! })))
          break
        }
      }
    },
    [doc, go, pageId],
  )

  const onTrigger = useCallback(
    (n: SNode, trigger: 'click' | 'hover') => {
      if (!interactive) return
      for (const i of n.interactions) if (i.trigger === trigger) run(n, i)
    },
    [interactive, run],
  )

  useEffect(() => {
    if (!interactive) return
    const onKey = (e: KeyboardEvent) => {
      const visit = (id: string) => {
        const n = doc.nodes[id]
        if (!n) return
        for (const i of n.interactions) if (i.trigger === 'key' && i.key?.toLowerCase() === e.key.toLowerCase()) run(n, i)
        n.children.forEach(visit)
      }
      if (frameId) visit(frameId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, frameId, interactive, run])

  const ctx = useMemo<RenderCtx>(() => ({ doc, play: true, states, anims, hidden, onTrigger }), [doc, states, anims, hidden, onTrigger])
  const frame = frameId ? doc.nodes[frameId] : undefined
  const index = frameId ? frames.indexOf(frameId) : -1
  const scale = frame ? Math.min(size.w / frame.w, size.h / frame.h, 4) : 1
  const restart = () => {
    setStates({})
    setHidden({})
    go(frames[0])
  }

  return (
    <div className="flex size-full flex-col">
      <AnimationStyles />
      <style>{'@keyframes s3d-enter { from { opacity: 0; translate: 24px 0 } to { opacity: 1; translate: 0 0 } }'}</style>
      {!hideUi && (
        <div className="dark flex h-10 shrink-0 items-center gap-1 px-2 text-xs text-white">
          <Select
            value={pageId ?? null}
            items={doc.pages.map((p) => ({ value: p.id, label: p.name }))}
            onValueChange={(v) => {
              if (v) {
                setPageId(v)
                setFrameId(undefined)
              }
            }}
          >
            <SelectTrigger size="sm" aria-label="Page" className="h-7 max-w-40 rounded-md border-transparent bg-white/10 px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark">
              {doc.pages.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={frameId ?? null}
            items={frames.map((id) => ({ value: id, label: doc.nodes[id].name }))}
            onValueChange={(v) => {
              if (v) go(v)
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="Frame"
              className="h-7 max-w-48 rounded-md border-transparent bg-white/10 px-2 text-xs"
              disabled={!frames.length}
            >
              <SelectValue placeholder="No frames" />
            </SelectTrigger>
            <SelectContent className="dark">
              {frames.map((id) => (
                <SelectItem key={id} value={id} className="text-xs">
                  {doc.nodes[id].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white"
            aria-label="Previous"
            disabled={index <= 0}
            onClick={() => go(frames[index - 1])}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums opacity-70">
            {index + 1} / {frames.length}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white"
            aria-label="Next"
            disabled={index >= frames.length - 1}
            onClick={() => go(frames[index + 1])}
          >
            <ChevronRightIcon />
          </Button>
          <Button size="icon-sm" variant="ghost" className="text-white" aria-label="Restart" onClick={restart}>
            <RotateCcwIcon />
          </Button>
          {onClose && (
            <Button size="icon-sm" variant="ghost" className="ml-auto text-white" aria-label="Close" onClick={onClose}>
              <XIcon />
            </Button>
          )}
        </div>
      )}
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden">
        {frame ? (
          <RenderContext.Provider value={ctx}>
            <div
              key={`${frameId}-${transition.key}`}
              style={{
                position: 'absolute',
                left: (size.w - frame.w * scale) / 2,
                top: (size.h - frame.h * scale) / 2,
                width: frame.w,
                height: frame.h,
                transform: `scale(${scale})`,
                transformOrigin: '0 0',
                animation: transition.duration ? `s3d-enter ${transition.duration}ms ${transition.easing} both` : undefined,
              }}
            >
              <NodeView id={frame.id} asFill />
            </div>
          </RenderContext.Provider>
        ) : (
          <div className="grid size-full place-items-center text-sm text-white/60">Add a frame to this page to preview it.</div>
        )}
      </div>
    </div>
  )
}

/** Full-screen preview of the current document in the editor. */
export function PlayMode() {
  const doc = useS3D((s) => s.doc)
  const pageId = useS3D((s) => s.pageId)
  const selection = useS3D((s) => s.selection)
  const close = () => useS3D.getState().set({ mode: 'edit' })
  // The frame containing the selection is where playback starts.
  const startFrame = useMemo(() => {
    let id: string | undefined = selection[0]
    while (id && doc.nodes[id] && doc.nodes[doc.nodes[id].parentId]) id = doc.nodes[id].parentId
    return id
  }, [doc, selection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950">
      <Player doc={doc} startPageId={pageId} startFrameId={startFrame} onClose={close} />
    </div>
  )
}
