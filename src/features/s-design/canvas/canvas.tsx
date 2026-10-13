import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { useTheme } from 'next-themes'
import { broadcastPresence, containerAt, currentPage, useS3D } from '@/features/s-3d/store'
import { type Rect, absPos, absRect, ancestors, childrenOf, intersects, isContainer, pathBounds, translatePath, unionRect } from '@/features/s-3d/model'
import { AnimationStyles, NodeView, RenderContext, type RenderCtx } from '@/features/s-3d/render/node-view'
import { CANVAS_MENU, CommandContextMenu, NODE_MENU } from '../components/command-context-menu'
import { addFilesToCanvas } from '@/features/s-3d/io'
import type { Doc, NodeType, SNode } from '@/features/s-3d/types'
import { Rulers } from './rulers'
import { openSceneEditor } from '@/features/s-3d/scene-editor/edit'
import { useCanvasShortcuts } from './use-shortcuts'
import { toolCursor } from './tool-cursors'
import { BRUSH_TOOLS, type RasterGesture, type XY, brushDiameter, cachedSize, commitRaster, isRaster, pixelToWorld, rectOf, startRaster } from '../raster/canvas-tools'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_POS: Record<Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] }
const CURSORS: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
const DRAW_TYPES: Partial<Record<string, NodeType>> = { frame: 'frame', section: 'section', rect: 'rect', ellipse: 'ellipse', polygon: 'polygon', star: 'star', shape3d: 'shape3d', text: 'text' }

interface Guide { x1: number; y1: number; x2: number; y2: number }
interface PenPoint { x: number; y: number; hx: number; hy: number }

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cam: { x: number; y: number } }
  | { kind: 'move'; start: { x: number; y: number }; origin: Record<string, { x: number; y: number }>; ids: string[]; moved: boolean }
  | { kind: 'resize'; handle: Handle; start: { x: number; y: number }; ids: string[]; orig: Record<string, SNode>; nodes: Record<string, SNode>; box: Rect; abs: Record<string, { x: number; y: number }> }
  | { kind: 'rotate'; center: { x: number; y: number }; startAngle: number; orig: Record<string, number> }
  | { kind: 'marquee'; start: { x: number; y: number }; additive: string[] }
  | { kind: 'create'; type: NodeType; start: { x: number; y: number }; parent: string }
  | { kind: 'pen-handle'; index: number }
  | RasterGesture

const snapTo = (v: number, grid: number) => Math.round(v / grid) * grid

function penPath(points: PenPoint[], closed: boolean) {
  if (!points.length) return ''
  const f = (n: number) => n.toFixed(2)
  let d = `M${f(points[0].x)},${f(points[0].y)}`
  const seg = (a: PenPoint, b: PenPoint) => `C${f(a.x + a.hx)},${f(a.y + a.hy)} ${f(b.x - b.hx)},${f(b.y - b.hy)} ${f(b.x)},${f(b.y)}`
  for (let i = 1; i < points.length; i++) d += seg(points[i - 1], points[i])
  if (closed && points.length > 2) d += `${seg(points.at(-1)!, points[0])}Z`
  return d
}

/** Picks what a click on `deepId` selects: children of top-level frames directly, group members only once inside the group. */
function pickTarget(doc: Doc, deepId: string, selection: string[], deep: boolean) {
  if (deep) return deepId
  const chain = [deepId, ...ancestors(doc, deepId)].reverse()
  let pick = chain[0]
  const top = doc.nodes[chain[0]]
  if (top && (top.type === 'frame' || top.type === 'section') && chain[1]) pick = chain[1]
  let depth = chain.indexOf(pick)
  for (const s of selection) {
    const n = doc.nodes[s]
    if (!n) continue
    const idx = chain.indexOf(n.parentId)
    if (idx >= 0 && chain[idx + 1] && idx + 1 > depth) {
      depth = idx + 1
      pick = chain[idx + 1]
    }
    const self = chain.indexOf(s)
    if (self >= 0 && self > depth) {
      depth = self
      pick = s
    }
  }
  return pick
}

/** #rrggbb and an opacity to an rgba() string, for the brush preview. */
const hexAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function DesignCanvas() {
  const s = useS3D
  const doc = useS3D((st) => st.doc)
  const page = useS3D(currentPage)
  const selection = useS3D((st) => st.selection)
  const hovered = useS3D((st) => st.hovered)
  const camera = useS3D((st) => st.camera)
  const tool = useS3D((st) => st.tool)
  const fg = useS3D((st) => st.foregroundColor)
  const brush = useS3D((st) => st.brush)
  const cloneSample = useS3D((st) => st.cloneSample)
  const editingTextId = useS3D((st) => st.editingTextId)
  const showRulers = useS3D((st) => st.showRulers)
  const showGrid = useS3D((st) => st.showGrid)
  const peers = useS3D((st) => st.peers)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  const rootRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [draft, setDraft] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [pen, setPen] = useState<PenPoint[]>([])
  const [penCursor, setPenCursor] = useState<{ x: number; y: number } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [altDown, setAltDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [trail, setTrail] = useState<XY[]>([])
  const [strokePreview, setStrokePreview] = useState<XY[]>([])
  const brushRef = useRef<HTMLDivElement>(null)

  const finishPen = useCallback((closed = false) => {
    setPen((points) => {
      if (points.length > 1) {
        const parent = containerAt(s.getState().doc, s.getState().pageId, points[0].x, points[0].y)
        const d = penPath(points, closed)
        const b = pathBounds(d)
        const pAbs = s.getState().doc.nodes[parent] ? absPos(s.getState().doc, parent) : { x: 0, y: 0 }
        const node = s.getState().addNode('vector', {
          x: b.x - pAbs.x, y: b.y - pAbs.y, w: b.w, h: b.h, path: translatePath(d, -b.x, -b.y),
          fills: closed ? [{ id: crypto.randomUUID(), kind: 'solid', color: '#d9d9d9', opacity: 1, visible: true }] : [],
        }, parent)
        s.getState().select([node.id])
      }
      return []
    })
    s.getState().set({ tool: 'select' })
  }, [s])

  useCanvasShortcuts({ setSpaceDown, setAltDown, pen, finishPen, cancelPen: () => setPen([]) })

  // Track viewport size for zoom-to-fit and centering.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => s.getState().set({ viewport: { w: el.clientWidth, h: el.clientHeight } }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [s])

  // Wheel: pan, or zoom with ctrl/cmd (also trackpad pinch).
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = s.getState()
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) st.zoomTo(st.camera.zoom * Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top)
      else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
        st.set({ camera: { ...st.camera, x: st.camera.x - dx, y: st.camera.y - dy } })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [s])

  // Clipboard events, so the system clipboard works across tabs and pasting images imports them.
  useEffect(() => {
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    const onCopy = (e: ClipboardEvent) => {
      if (editable(e.target) || !s.getState().selection.length) return
      e.preventDefault()
      if (e.type === 'cut') s.getState().cut()
      else s.getState().copy()
      const clip = s.getState().clipboard
      if (clip) e.clipboardData?.setData('text/plain', JSON.stringify({ s3d: true, ...clip }))
    }
    const onPaste = (e: ClipboardEvent) => {
      if (editable(e.target)) return
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) {
        e.preventDefault()
        void addFilesToCanvas(files)
        return
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      try {
        const data = JSON.parse(text)
        if (data?.s3d) s.getState().set({ clipboard: { nodes: data.nodes, roots: data.roots } })
      } catch {
        if (text.trim() && !s.getState().clipboard) {
          const node = s.getState().addNode('text', { x: -s.getState().camera.x / s.getState().camera.zoom + 40, y: -s.getState().camera.y / s.getState().camera.zoom + 40 })
          s.getState().updateNodes([node.id], (n) => void (n.text!.content = text.slice(0, 5000)))
          s.getState().select([node.id])
          return
        }
      }
      e.preventDefault()
      s.getState().paste()
    }
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
      document.removeEventListener('paste', onPaste)
    }
  }, [s])

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = rootRef.current!.getBoundingClientRect()
    const cam = s.getState().camera
    return { x: (clientX - rect.left - cam.x) / cam.zoom, y: (clientY - rect.top - cam.y) / cam.zoom }
  }, [s])

  const hitNode = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest?.('[data-node-id]') as HTMLElement | null
    return el?.dataset.nodeId ?? null
  }

  /* ---------- smart guides ---------- */
  const snapMove = (box: Rect, ids: string[], d: Doc, threshold: number) => {
    const first = d.nodes[ids[0]]
    const parentId = first.parentId
    const siblings = childrenOf(d, parentId).filter((c) => !ids.includes(c) && d.nodes[c]?.visible)
    const targets = siblings.map((c) => absRect(d, c))
    if (d.nodes[parentId]) targets.push(absRect(d, parentId))
    const xs = [box.x, box.x + box.w / 2, box.x + box.w]
    const ys = [box.y, box.y + box.h / 2, box.y + box.h]
    let bestX: { diff: number; at: number; t: Rect } | null = null
    let bestY: { diff: number; at: number; t: Rect } | null = null
    for (const t of targets) {
      for (const tx of [t.x, t.x + t.w / 2, t.x + t.w]) for (const x of xs) {
        const diff = tx - x
        if (Math.abs(diff) <= threshold && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff, at: tx, t }
      }
      for (const ty of [t.y, t.y + t.h / 2, t.y + t.h]) for (const y of ys) {
        const diff = ty - y
        if (Math.abs(diff) <= threshold && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff, at: ty, t }
      }
    }
    const g: Guide[] = []
    const dx = bestX?.diff ?? 0
    const dy = bestY?.diff ?? 0
    if (bestX) g.push({ x1: bestX.at, x2: bestX.at, y1: Math.min(box.y + dy, bestX.t.y), y2: Math.max(box.y + dy + box.h, bestX.t.y + bestX.t.h) })
    if (bestY) g.push({ y1: bestY.at, y2: bestY.at, x1: Math.min(box.x + dx, bestY.t.x), x2: Math.max(box.x + dx + box.w, bestY.t.x + bestY.t.w) })
    return { dx: bestX ? dx : null, dy: bestY ? dy : null, guides: g }
  }

  /* ---------- pointer handling ---------- */
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const st = s.getState()
    if (st.editingTextId && hitNode(e.target) === st.editingTextId) return
    if (st.editingTextId) st.set({ editingTextId: null })
    const target = e.target as HTMLElement
    if (target.closest('[data-ui]')) return
    rootRef.current?.setPointerCapture(e.pointerId)
    const w = toWorld(e.clientX, e.clientY)

    if (e.button === 1 || spaceDown || st.tool === 'hand') {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: { x: st.camera.x, y: st.camera.y } }
      setPanning(true)
      return
    }

    if (st.tool === 'zoom' && e.button === 0) {
      const rect = rootRef.current!.getBoundingClientRect()
      st.zoomTo(st.camera.zoom * (e.altKey ? 0.5 : 2), e.clientX - rect.left, e.clientY - rect.top)
      return
    }
    if (isRaster(st.tool)) {
      if (e.button === 0) gesture.current = startRaster(st.tool, hitNode(e.target), w, { shift: e.shiftKey, alt: e.altKey })
      return
    }

    const handle = target.dataset.handle as Handle | 'rotate' | undefined
    if (e.button === 0 && handle && st.selection.length) {
      st.beginGesture()
      if (handle === 'rotate') {
        const box = unionRect(st.selection.map((id) => absRect(st.doc, id)))!
        const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
        gesture.current = { kind: 'rotate', center, startAngle: Math.atan2(w.y - center.y, w.x - center.x), orig: Object.fromEntries(st.selection.map((id) => [id, st.doc.nodes[id].rotation])) }
      } else {
        const ids = st.selection.filter((id) => !st.doc.nodes[id].locked)
        gesture.current = {
          kind: 'resize', handle, start: w, ids,
          orig: Object.fromEntries(ids.map((id) => [id, st.doc.nodes[id]])),
          nodes: st.doc.nodes,
          abs: Object.fromEntries(ids.map((id) => [id, absPos(st.doc, id)])),
          box: unionRect(ids.map((id) => absRect(st.doc, id)))!,
        }
      }
      return
    }

    if (st.tool === 'pen') {
      if (pen.length > 2 && Math.hypot(w.x - pen[0].x, w.y - pen[0].y) < 8 / st.camera.zoom) {
        finishPen(true)
        return
      }
      setPen((p) => [...p, { x: w.x, y: w.y, hx: 0, hy: 0 }])
      gesture.current = { kind: 'pen-handle', index: pen.length }
      return
    }

    if (st.tool === 'comment') {
      const parent = containerAt(st.doc, st.pageId, w.x, w.y)
      const pAbs = st.doc.nodes[parent] ? absPos(st.doc, parent) : { x: 0, y: 0 }
      const text = window.prompt('Comment')
      if (text) {
        const node = st.addNode('comment', { x: w.x - pAbs.x, y: w.y - pAbs.y - 28, w: 28, h: 28, name: text.slice(0, 40), author: 'You', text: { content: text, fontFamily: 'Inter Variable', fontSize: 12, fontWeight: 400, italic: false, underline: false, strike: false, lineHeight: 1.3, letterSpacing: 0, align: 'left', verticalAlign: 'top', transform: 'none', autoSize: 'fixed' } })
        st.select([node.id])
      }
      st.set({ tool: 'select' })
      return
    }

    const drawType = DRAW_TYPES[st.tool]
    if (drawType && e.button === 0) {
      const parent = containerAt(st.doc, st.pageId, w.x, w.y)
      gesture.current = { kind: 'create', type: drawType, start: st.snapToGrid ? { x: snapTo(w.x, st.gridSize), y: snapTo(w.y, st.gridSize) } : w, parent }
      return
    }

    // Select tool.
    const deep = hitNode(e.target)
    if (deep && !st.doc.nodes[deep]?.locked) {
      const id = pickTarget(st.doc, deep, st.selection, e.metaKey || e.ctrlKey)
      if (st.doc.nodes[id]?.locked) return
      if (e.shiftKey) st.select([id], true)
      else if (!st.selection.includes(id)) st.select([id])
      if (e.button !== 0) return
      let ids = s.getState().selection.filter((x) => !s.getState().doc.nodes[x]?.locked)
      st.beginGesture()
      if (e.altKey && ids.length) {
        st.duplicate(ids)
        ids = s.getState().selection
      }
      const d = s.getState().doc
      gesture.current = { kind: 'move', start: w, ids, moved: false, origin: Object.fromEntries(ids.map((x) => [x, { x: d.nodes[x].x, y: d.nodes[x].y }])) }
      return
    }
    if (e.button !== 0) {
      if (!deep) st.select([])
      return
    }
    gesture.current = { kind: 'marquee', start: w, additive: e.shiftKey ? st.selection : [] }
    if (!e.shiftKey) st.select([])
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const st = s.getState()
    const w = toWorld(e.clientX, e.clientY)
    broadcastPresence(w.x, w.y)
    if (st.tool === 'pen') setPenCursor(w)
    if (BRUSH_TOOLS.includes(st.tool) && brushRef.current) {
      const d = brushDiameter(st.doc, hitNode(e.target), st.selection, st.brush.size, st.camera.zoom)
      const el = brushRef.current
      el.style.display = 'block'
      el.style.width = el.style.height = `${d}px`
      el.style.transform = `translate(${w.x * st.camera.zoom + st.camera.x - d / 2}px, ${w.y * st.camera.zoom + st.camera.y - d / 2}px)`
    }
    const g = gesture.current
    if (!g) {
      const h = hitNode(e.target)
      const id = h ? pickTarget(st.doc, h, st.selection, e.metaKey || e.ctrlKey) : null
      if (id !== st.hovered) st.set({ hovered: id })
      return
    }
    const zoom = st.camera.zoom
    if (g.kind === 'pan') {
      st.set({ camera: { ...st.camera, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy } })
    } else if (g.kind === 'pen-handle') {
      setPen((pts) => pts.map((p, i) => (i === g.index ? { ...p, hx: (w.x - p.x) / 3, hy: (w.y - p.y) / 3 } : p)))
    } else if (g.kind === 'move') {
      let dx = w.x - g.start.x
      let dy = w.y - g.start.y
      if (!g.moved && Math.hypot(dx, dy) * zoom < 3) return
      g.moved = true
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      const d = st.doc
      // Nodes inside auto layout are reordered, not moved.
      const parent = d.nodes[d.nodes[g.ids[0]]?.parentId]
      if (parent?.autoLayout) {
        const horiz = parent.autoLayout.direction === 'horizontal'
        const pAbs = absPos(d, parent.id)
        const pos = horiz ? w.x - pAbs.x : w.y - pAbs.y
        const others = parent.children.filter((c) => !g.ids.includes(c))
        let index = others.findIndex((c) => (horiz ? d.nodes[c].x + d.nodes[c].w / 2 : d.nodes[c].y + d.nodes[c].h / 2) > pos)
        if (index < 0) index = others.length
        const order = [...others.slice(0, index), ...g.ids, ...others.slice(index)]
        if (order.join() !== parent.children.join()) st.mutate((dd) => void (dd.nodes[parent.id].children = order), { history: false })
        return
      }
      const box0 = unionRect(g.ids.map((id) => {
        const r = absRect(d, id)
        return { ...r, x: r.x - d.nodes[id].x + g.origin[id].x, y: r.y - d.nodes[id].y + g.origin[id].y }
      }))!
      const moved = { ...box0, x: box0.x + dx, y: box0.y + dy }
      const snap = e.metaKey || e.ctrlKey ? { dx: null, dy: null, guides: [] } : snapMove(moved, g.ids, d, 6 / zoom)
      if (snap.dx !== null) dx += snap.dx
      else if (st.snapToGrid) dx = snapTo(box0.x + dx, st.gridSize) - box0.x
      else dx = Math.round(box0.x + dx) - box0.x
      if (snap.dy !== null) dy += snap.dy
      else if (st.snapToGrid) dy = snapTo(box0.y + dy, st.gridSize) - box0.y
      else dy = Math.round(box0.y + dy) - box0.y
      setGuides(snap.guides)
      st.mutate((dd) => {
        for (const id of g.ids) {
          dd.nodes[id].x = g.origin[id].x + dx
          dd.nodes[id].y = g.origin[id].y + dy
        }
      }, { history: false })
    } else if (g.kind === 'resize') {
      resize(g, w, e.shiftKey, e.altKey)
    } else if (g.kind === 'rotate') {
      const delta = ((Math.atan2(w.y - g.center.y, w.x - g.center.x) - g.startAngle) * 180) / Math.PI
      st.mutate((dd) => {
        for (const [id, r] of Object.entries(g.orig)) {
          let rot = r + delta
          if (e.shiftKey) rot = Math.round(rot / 15) * 15
          dd.nodes[id].rotation = Math.round((((rot % 360) + 540) % 360 - 180) * 10) / 10
        }
      }, { history: false })
    } else if (g.kind === 'marquee') {
      const r = { x: Math.min(g.start.x, w.x), y: Math.min(g.start.y, w.y), w: Math.abs(w.x - g.start.x), h: Math.abs(w.y - g.start.y) }
      setMarquee(r)
      const d = st.doc
      // Marquee picks top-level nodes, or children of a top-level frame when it starts inside one.
      const scope = containerAt(d, st.pageId, g.start.x, g.start.y)
      const hits = childrenOf(d, scope).filter((id) => d.nodes[id]?.visible && !d.nodes[id].locked && intersects(r, absRect(d, id)))
      st.set({ selection: [...new Set([...g.additive, ...hits])] })
    } else if (g.kind === 'raster') {
      g.points.push(w)
      if (g.tool === 'marquee') setMarquee(rectOf(g.start, w))
      else if (g.tool === 'crop') setDraft(rectOf(g.start, w))
      else if (g.tool === 'lasso') setTrail(g.points.slice())
      else if (BRUSH_TOOLS.includes(g.tool)) setStrokePreview(g.points.slice())
    } else if (g.kind === 'create') {
      let x2 = w.x
      let y2 = w.y
      if (st.snapToGrid) {
        x2 = snapTo(x2, st.gridSize)
        y2 = snapTo(y2, st.gridSize)
      }
      let width = x2 - g.start.x
      let height = y2 - g.start.y
      if (e.shiftKey) {
        const m = Math.max(Math.abs(width), Math.abs(height))
        width = Math.sign(width || 1) * m
        height = Math.sign(height || 1) * m
      }
      const r = e.altKey
        ? { x: g.start.x - Math.abs(width), y: g.start.y - Math.abs(height), w: Math.abs(width) * 2, h: Math.abs(height) * 2 }
        : { x: Math.min(g.start.x, g.start.x + width), y: Math.min(g.start.y, g.start.y + height), w: Math.abs(width), h: Math.abs(height) }
      setDraft(r)
    }
  }

  const resize = (g: Extract<Gesture, { kind: 'resize' }>, w: { x: number; y: number }, shift: boolean, alt: boolean) => {
    const st = s.getState()
    const [hx, hy] = HANDLE_POS[g.handle]
    const single = g.ids.length === 1 ? g.orig[g.ids[0]] : null
    const rot = single ? (single.rotation * Math.PI) / 180 : 0
    // Pointer delta in the node's local (unrotated) axes.
    const wdx = w.x - g.start.x
    const wdy = w.y - g.start.y
    const dx = wdx * Math.cos(-rot) - wdy * Math.sin(-rot)
    const dy = wdx * Math.sin(-rot) + wdy * Math.cos(-rot)
    const box = g.box
    let left = 0
    let top = 0
    let right = box.w
    let bottom = box.h
    if (hx === 0) left += dx
    if (hx === 1) right += dx
    if (hy === 0) top += dy
    if (hy === 1) bottom += dy
    if (alt) {
      if (hx === 0) right -= dx
      if (hx === 1) left -= dx
      if (hy === 0) bottom -= dy
      if (hy === 1) top -= dy
    }
    let nw = right - left
    let nh = bottom - top
    const keepRatio = shift || (single?.aspectLocked ?? false)
    if (keepRatio && box.w && box.h) {
      const ratio = box.w / box.h
      if (hx === 0.5) nw = nh * ratio
      else if (hy === 0.5) nh = nw / ratio
      else if (Math.abs(nw / box.w) > Math.abs(nh / box.h)) nh = nw / ratio
      else nw = nh * ratio
      if (hx === 0) left = right - nw
      else if (hx === 0.5) left = (box.w - nw) / 2
      else right = left + nw
      if (hy === 0) top = bottom - nh
      else if (hy === 0.5) top = (box.h - nh) / 2
      else bottom = top + nh
    }
    if (st.snapToGrid && !single?.rotation) {
      nw = Math.max(st.gridSize, snapTo(nw, st.gridSize))
      nh = Math.max(st.gridSize, snapTo(nh, st.gridSize))
    }
    const flipX = nw < 0
    const flipY = nh < 0
    const fw = Math.max(1, Math.round(Math.abs(nw)))
    const fh = Math.max(1, Math.round(Math.abs(nh)))
    const fl = flipX ? left + nw : left
    const ft = flipY ? top + nh : top
    st.mutate((d) => {
      if (single) {
        const n = d.nodes[single.id]
        // Keep the opposite anchor fixed in rotated space by moving the centre.
        const cx = fl + fw / 2 - box.w / 2
        const cy = ft + fh / 2 - box.h / 2
        const wx = cx * Math.cos(rot) - cy * Math.sin(rot)
        const wy = cx * Math.sin(rot) + cy * Math.cos(rot)
        n.x = Math.round(single.x + box.w / 2 + wx - fw / 2)
        n.y = Math.round(single.y + box.h / 2 + wy - fh / 2)
        n.w = fw
        n.h = fh
        if (single.type === 'vector') n.path = translatePath(single.path, 0, 0, fw / single.w, fh / single.h)
        if (single.text && single.text.autoSize === 'width' && fw !== single.w) n.text!.autoSize = 'fixed'
        if (single.text && single.text.autoSize === 'height' && fh !== single.h) n.text!.autoSize = 'fixed'
        if (n.sizing.h === 'hug' && fw !== single.w) n.sizing.h = 'fixed'
        if (n.sizing.v === 'hug' && fh !== single.h) n.sizing.v = 'fixed'
        if (isContainer(n)) {
          // Children follow constraints; reset them to their gesture-start geometry first.
          const sx = fw / single.w
          const sy = fh / single.h
          for (const cid of n.children) {
            const c = d.nodes[cid]
            const o = g.nodes[cid] ?? c
            if (n.type === 'group' || n.type === 'boolean' || c.constraints.h === 'scale') { c.x = o.x * sx; c.w = Math.max(1, o.w * sx) }
            else if (c.constraints.h === 'right') c.x = o.x + fw - single.w
            else if (c.constraints.h === 'center') c.x = o.x + (fw - single.w) / 2
            else if (c.constraints.h === 'left-right') c.w = Math.max(1, o.w + fw - single.w)
            if (n.type === 'group' || n.type === 'boolean' || c.constraints.v === 'scale') { c.y = o.y * sy; c.h = Math.max(1, o.h * sy) }
            else if (c.constraints.v === 'bottom') c.y = o.y + fh - single.h
            else if (c.constraints.v === 'center') c.y = o.y + (fh - single.h) / 2
            else if (c.constraints.v === 'top-bottom') c.h = Math.max(1, o.h + fh - single.h)
            if (c.type === 'vector' && (n.type === 'group' || n.type === 'boolean')) c.path = translatePath(o.path, 0, 0, c.w / o.w, c.h / o.h)
          }
        }
      } else {
        const sx = fw / box.w
        const sy = fh / box.h
        for (const id of g.ids) {
          const o = g.orig[id]
          const a = g.abs[id]
          const n = d.nodes[id]
          n.x = Math.round(o.x + (box.x + fl + (a.x - box.x) * sx) - a.x)
          n.y = Math.round(o.y + (box.y + ft + (a.y - box.y) * sy) - a.y)
          n.w = Math.max(1, Math.round(o.w * sx))
          n.h = Math.max(1, Math.round(o.h * sy))
          if (o.type === 'vector') n.path = translatePath(o.path, 0, 0, n.w / o.w, n.h / o.h)
        }
      }
    }, { history: false })
  }

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const st = s.getState()
    const g = gesture.current
    gesture.current = null
    setPanning(false)
    setGuides([])
    setMarquee(null)
    setStrokePreview([])
    if (!g) return
    if (g.kind === 'raster') {
      g.points.push(toWorld(e.clientX, e.clientY))
      setTrail([])
      setDraft(null)
      void commitRaster(g)
      return
    }
    if (g.kind === 'move') {
      // Dropping onto a different frame reparents the nodes.
      if (g.moved) {
        const w = toWorld(e.clientX, e.clientY)
        const target = containerAt(st.doc, st.pageId, w.x, w.y, g.ids)
        const current = st.doc.nodes[g.ids[0]]?.parentId
        if (target !== current && !st.doc.nodes[current]?.autoLayout && !st.doc.nodes[current]?.mask && st.doc.nodes[current]?.type !== 'group' && st.doc.nodes[current]?.type !== 'boolean') {
          for (const id of g.ids) st.moveNode(id, target, childrenOf(st.doc, target).length)
        }
      }
      st.endGesture()
    } else if (g.kind === 'resize' || g.kind === 'rotate') {
      st.endGesture()
    } else if (g.kind === 'create') {
      const r = draft && draft.w > 2 && draft.h > 2 ? draft : null
      setDraft(null)
      const pAbs = st.doc.nodes[g.parent] ? absPos(st.doc, g.parent) : { x: 0, y: 0 }
      const defaults: Partial<Record<NodeType, [number, number]>> = { frame: [400, 300], section: [600, 400], shape3d: [240, 240], text: [10, 10] }
      const [dw, dh] = defaults[g.type] ?? [100, 100]
      const box = r ?? { x: g.start.x - (g.type === 'text' ? 0 : dw / 2), y: g.start.y - (g.type === 'text' ? 0 : dh / 2), w: dw, h: dh }
      const patch: Partial<SNode> = { x: Math.round(box.x - pAbs.x), y: Math.round(box.y - pAbs.y), w: Math.round(box.w), h: Math.round(box.h) }
      if (g.type === 'shape3d') patch.shape3d = st.shape3d
      if (g.type === 'text' && r) patch.text = { ...createTextDefaults(), autoSize: 'height' }
      // A new frame drawn around existing top-level nodes adopts them.
      const node = st.addNode(g.type, patch, g.parent)
      if (g.type === 'frame' || g.type === 'section') {
        const abs = { x: box.x, y: box.y, w: box.w, h: box.h }
        const inside = childrenOf(s.getState().doc, g.parent).filter((id) => {
          if (id === node.id) return false
          const rr = absRect(s.getState().doc, id)
          return rr.x >= abs.x && rr.y >= abs.y && rr.x + rr.w <= abs.x + abs.w && rr.y + rr.h <= abs.y + abs.h
        })
        for (const id of inside) s.getState().moveNode(id, node.id, childrenOf(s.getState().doc, node.id).length)
      }
      s.getState().set({ tool: 'select', selection: [node.id], editingTextId: g.type === 'text' ? node.id : null })
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = s.getState()
    if (st.tool === 'pen') {
      finishPen(false)
      return
    }
    const deep = hitNode(e.target)
    if (!deep) return
    const chain = [deep, ...ancestors(st.doc, deep)].reverse()
    const selected = st.selection.length === 1 ? st.selection[0] : null
    const idx = selected ? chain.indexOf(selected) : -1
    const node = selected ? st.doc.nodes[selected] : null
    if (node?.type === 'text' && idx === chain.length - 1) {
      st.set({ editingTextId: node.id })
      return
    }
    // Double-clicking a 3D node opens it in the scene editor.
    const t = st.doc.nodes[deep]?.type
    if (t === 'shape3d' || t === 'model3d') {
      openSceneEditor(deep)
      return
    }
    const next = idx >= 0 ? chain[idx + 1] : chain[0]
    if (next) {
      const n = st.doc.nodes[next]
      st.set({ selection: [next], editingTextId: n?.type === 'text' ? next : null })
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = [...e.dataTransfer.files]
    if (files.length) void addFilesToCanvas(files, toWorld(e.clientX, e.clientY))
  }

  const ctx = useMemo<RenderCtx>(() => ({
    doc, play: false, editingTextId,
    onTextCommit: (id, content) => {
      const st = s.getState()
      st.set({ editingTextId: null })
      if (!content.trim()) st.deleteNodes([id])
      else if (st.doc.nodes[id]?.text?.content !== content) st.updateNodes([id], (n) => void (n.text!.content = content))
    },
    onTextMeasure: (id, w, h) => s.getState().mutate((d) => {
      const n = d.nodes[id]
      if (n) {
        n.w = w
        n.h = h
      }
    }, { history: false }),
  }), [doc, editingTextId, s])

  /* ---------- overlay geometry (screen space) ---------- */
  const cloneNode = cloneSample ? doc.nodes[cloneSample.id] : undefined
  const cloneDims = cloneNode ? cachedSize(cloneNode.src) : undefined
  const cloneMarker = cloneNode && cloneDims && cloneSample ? pixelToWorld(doc, cloneNode, cloneDims, [cloneSample.x, cloneSample.y]) : null
  const toScreen = (x: number, y: number) => ({ x: x * camera.zoom + camera.x, y: y * camera.zoom + camera.y })
  const selRects = selection.filter((id) => doc.nodes[id]).map((id) => ({ id, ...absRect(doc, id), rot: doc.nodes[id].rotation }))
  const single = selRects.length === 1 ? selRects[0] : null
  const box = single ?? (selRects.length ? { ...unionRect(selRects)!, rot: 0, id: '' } : null)
  const hoverRect = hovered && !selection.includes(hovered) && doc.nodes[hovered] ? { ...absRect(doc, hovered), rot: doc.nodes[hovered].rotation } : null
  const showHandles = box && tool === 'select' && !editingTextId && !selRects.every((r) => doc.nodes[r.id]?.locked)

  // Alt-hover measurement between the selection and the hovered node (or its parent).
  let measures: { x1: number; y1: number; x2: number; y2: number; label: string }[] = []
  if (altDown && box) {
    const other = hovered && !selection.includes(hovered) && doc.nodes[hovered] ? absRect(doc, hovered) : single && doc.nodes[doc.nodes[single.id].parentId] ? absRect(doc, doc.nodes[single.id].parentId) : null
    if (other) measures = measureBetween(box, other)
  }

  const gridStep = (() => {
    let step = 8
    while (step * camera.zoom < 12) step *= 2
    return step * camera.zoom
  })()
  const bg = page?.background ?? (dark ? '#1e1e1e' : '#f5f5f5')
  const cursor = panning ? 'grabbing' : spaceDown || tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'zoom' ? (altDown ? 'zoom-out' : 'zoom-in') : BRUSH_TOOLS.includes(tool) ? 'none' : toolCursor(tool)

  const topFrames = (page?.children ?? []).map((id) => doc.nodes[id]).filter((n): n is SNode => !!n && n.visible && (n.type === 'frame' || n.type === 'section' || n.type === 'shape3d' || n.type === 'model3d'))
  const pagePeers = Object.values(peers).filter((p) => p.pageId === page?.id && Date.now() - p.seen < 15000)

  return (
    <CommandContextMenu items={() => (s.getState().selection.length ? NODE_MENU : CANVAS_MENU)} render={<div className="relative size-full overflow-hidden" />}>
      <div
        ref={rootRef}
        className="absolute inset-0 select-none touch-none"
        style={{
          cursor,
          backgroundColor: bg,
          backgroundImage: showGrid ? `radial-gradient(${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.09)'} 1px, transparent 1px)` : undefined,
          backgroundSize: `${gridStep}px ${gridStep}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (brushRef.current) brushRef.current.style.display = 'none'
          s.getState().set({ hovered: null })
        }}
        onDoubleClick={onDoubleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <AnimationStyles />
        <RenderContext.Provider value={ctx}>
          <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
            {page?.children.map((id) => <NodeView key={id} id={id} />)}
          </div>
        </RenderContext.Provider>

        {camera.zoom >= 8 && showGrid && (
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, rgba(128,128,128,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,.25) 1px, transparent 1px)', backgroundSize: `${camera.zoom}px ${camera.zoom}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }} />
        )}

        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {hoverRect && <RotRect r={hoverRect} toScreen={toScreen} zoom={camera.zoom} stroke="#0d99ff" width={1.5} />}
          {selRects.length > 1 && selRects.map((r) => <RotRect key={r.id} r={r} toScreen={toScreen} zoom={camera.zoom} stroke="#0d99ff" width={1} />)}
          {box && <RotRect r={box} toScreen={toScreen} zoom={camera.zoom} stroke="#0d99ff" width={1.5} />}
          {guides.map((g, i) => {
            const a = toScreen(g.x1, g.y1)
            const b = toScreen(g.x2, g.y2)
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f24822" strokeWidth={1} />
          })}
          {measures.map((m, i) => {
            const a = toScreen(m.x1, m.y1)
            const b = toScreen(m.x2, m.y2)
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f24822" strokeWidth={1} />
                <rect x={(a.x + b.x) / 2 - 18} y={(a.y + b.y) / 2 - 9} width={36} height={18} rx={3} fill="#f24822" />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 4} fill="white" fontSize={10} textAnchor="middle">{m.label}</text>
              </g>
            )
          })}
          {marquee && (() => {
            const a = toScreen(marquee.x, marquee.y)
            return <rect x={a.x} y={a.y} width={marquee.w * camera.zoom} height={marquee.h * camera.zoom} fill="rgba(13,153,255,.08)" stroke="#0d99ff" />
          })()}
          {strokePreview.length > 1 && <polyline points={strokePreview.map((p) => { const q = toScreen(p.x, p.y); return `${q.x},${q.y}` }).join(' ')} fill="none" stroke={tool === 'eraser' ? 'rgba(120,120,120,.6)' : hexAlpha(fg, brush.opacity)} strokeWidth={brushDiameter(doc, null, selection, brush.size, camera.zoom)} strokeLinecap="round" strokeLinejoin="round" />}
          {cloneMarker && (() => { const q = toScreen(cloneMarker.x, cloneMarker.y); return <g stroke="#0d99ff" strokeWidth={1.5}><circle cx={q.x} cy={q.y} r={8} fill="none" /><path d={`M${q.x - 12},${q.y}H${q.x + 12}M${q.x},${q.y - 12}V${q.y + 12}`} /></g> })()}
          {trail.length > 1 && <polyline points={trail.map((p) => { const q = toScreen(p.x, p.y); return `${q.x},${q.y}` }).join(' ')} fill="rgba(13,153,255,.08)" stroke="#0d99ff" />}
          {draft && (() => {
            const a = toScreen(draft.x, draft.y)
            return <rect x={a.x} y={a.y} width={draft.w * camera.zoom} height={draft.h * camera.zoom} fill="rgba(13,153,255,.06)" stroke="#0d99ff" strokeDasharray="4 3" rx={tool === 'ellipse' ? draft.w * camera.zoom / 2 : 0} />
          })()}
          {pen.length > 0 && (
            <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
              <path d={penPath(penCursor ? [...pen, { ...penCursor, hx: 0, hy: 0 }] : pen, false)} fill="none" stroke="#0d99ff" strokeWidth={1.5 / camera.zoom} />
              {pen.map((p, i) => <rect key={i} x={p.x - 3 / camera.zoom} y={p.y - 3 / camera.zoom} width={6 / camera.zoom} height={6 / camera.zoom} fill="white" stroke="#0d99ff" strokeWidth={1 / camera.zoom} />)}
            </g>
          )}
        </svg>

        <div ref={brushRef} className="pointer-events-none absolute left-0 top-0 rounded-full border border-black/60 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]" style={{ display: 'none' }} />

        {/* Frame name labels: click to select the frame. */}
        {topFrames.map((n) => {
          const p = toScreen(n.x, n.y)
          if (n.type === 'section') return null
          return (
            <div key={n.id} data-ui className="absolute cursor-default truncate text-[11px] text-muted-foreground hover:text-foreground"
              style={{ left: p.x, top: p.y - 18, maxWidth: Math.max(40, n.w * camera.zoom), color: selection.includes(n.id) ? '#0d99ff' : undefined }}
              onPointerDown={(e) => { e.stopPropagation(); s.getState().select([n.id], e.shiftKey) }}>
              {n.name}
            </div>
          )
        })}

        {showHandles && box && <SelectionHandles box={box} camera={camera} single={!!single} />}
        {box && !editingTextId && (() => {
          const p = toScreen(box.x + box.w / 2, box.y + box.h)
          return (
            <div className="pointer-events-none absolute -translate-x-1/2 rounded-sm bg-[#0d99ff] px-1 text-[10px] leading-4 text-white tabular-nums" style={{ left: p.x, top: p.y + 8 }}>
              {Math.round(box.w)} × {Math.round(box.h)}
            </div>
          )
        })()}

        {pagePeers.map((p) => {
          const pt = toScreen(p.x, p.y)
          return (
            <div key={p.id} className="pointer-events-none absolute" style={{ left: pt.x, top: pt.y }}>
              <svg width="14" height="18" viewBox="0 0 14 18"><path d="M0 0L14 10L7 11L4 18Z" fill={p.color} stroke="white" /></svg>
              <span className="ml-3 rounded px-1 text-[10px] text-white" style={{ background: p.color }}>{p.name}</span>
            </div>
          )
        })}

        {showRulers && <Rulers selection={box} />}
      </div>
    </CommandContextMenu>
  )
}

function createTextDefaults() {
  return { content: 'Text', fontFamily: 'Inter Variable', fontSize: 24, fontWeight: 400, italic: false, underline: false, strike: false, lineHeight: 1.2, letterSpacing: 0, align: 'left' as const, verticalAlign: 'top' as const, transform: 'none' as const, autoSize: 'width' as const }
}

function measureBetween(a: Rect, b: Rect) {
  const out: { x1: number; y1: number; x2: number; y2: number; label: string }[] = []
  const cy = a.y + a.h / 2
  const cx = a.x + a.w / 2
  const inside = a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h
  if (inside) {
    out.push({ x1: b.x, y1: cy, x2: a.x, y2: cy, label: String(Math.round(a.x - b.x)) })
    out.push({ x1: a.x + a.w, y1: cy, x2: b.x + b.w, y2: cy, label: String(Math.round(b.x + b.w - a.x - a.w)) })
    out.push({ x1: cx, y1: b.y, x2: cx, y2: a.y, label: String(Math.round(a.y - b.y)) })
    out.push({ x1: cx, y1: a.y + a.h, x2: cx, y2: b.y + b.h, label: String(Math.round(b.y + b.h - a.y - a.h)) })
    return out
  }
  if (b.x >= a.x + a.w) out.push({ x1: a.x + a.w, y1: cy, x2: b.x, y2: cy, label: String(Math.round(b.x - a.x - a.w)) })
  else if (b.x + b.w <= a.x) out.push({ x1: b.x + b.w, y1: cy, x2: a.x, y2: cy, label: String(Math.round(a.x - b.x - b.w)) })
  if (b.y >= a.y + a.h) out.push({ x1: cx, y1: a.y + a.h, x2: cx, y2: b.y, label: String(Math.round(b.y - a.y - a.h)) })
  else if (b.y + b.h <= a.y) out.push({ x1: cx, y1: b.y + b.h, x2: cx, y2: a.y, label: String(Math.round(a.y - b.y - b.h)) })
  return out
}

function RotRect({ r, toScreen, zoom, stroke, width }: { r: Rect & { rot: number }; toScreen: (x: number, y: number) => { x: number; y: number }; zoom: number; stroke: string; width: number }) {
  const p = toScreen(r.x, r.y)
  const cx = p.x + (r.w * zoom) / 2
  const cy = p.y + (r.h * zoom) / 2
  return <rect x={p.x} y={p.y} width={r.w * zoom} height={r.h * zoom} fill="none" stroke={stroke} strokeWidth={width} transform={r.rot ? `rotate(${r.rot} ${cx} ${cy})` : undefined} />
}

function SelectionHandles({ box, camera, single }: { box: Rect & { rot: number }; camera: { x: number; y: number; zoom: number }; single: boolean }) {
  const left = box.x * camera.zoom + camera.x
  const top = box.y * camera.zoom + camera.y
  const w = box.w * camera.zoom
  const h = box.h * camera.zoom
  return (
    <div className="pointer-events-none absolute" style={{ left, top, width: w, height: h, transform: single && box.rot ? `rotate(${box.rot}deg)` : undefined }}>
      {(['nw', 'ne', 'se', 'sw'] as const).map((c) => {
        const [hx, hy] = HANDLE_POS[c]
        return <div key={`r-${c}`} data-handle="rotate" className="pointer-events-auto absolute size-4" style={{ left: hx * w - 8 + (hx ? 8 : -8), top: hy * h - 8 + (hy ? 8 : -8), cursor: 'grab' }} />
      })}
      {HANDLES.map((hd) => {
        const [hx, hy] = HANDLE_POS[hd]
        const edge = hd.length === 1
        if (edge) {
          const horiz = hy !== 0.5
          return <div key={hd} data-handle={hd} className="pointer-events-auto absolute" style={{ left: horiz ? 6 : hx * w - 4, top: horiz ? hy * h - 4 : 6, width: horiz ? Math.max(0, w - 12) : 8, height: horiz ? 8 : Math.max(0, h - 12), cursor: CURSORS[hd] }} />
        }
        return <div key={hd} data-handle={hd} className="pointer-events-auto absolute size-2 border border-[#0d99ff] bg-white" style={{ left: hx * w - 4, top: hy * h - 4, cursor: CURSORS[hd] }} />
      })}
    </div>
  )
}
