import {
  BandageIcon,
  BrushIcon,
  CheckIcon,
  CropIcon,
  DownloadIcon,
  EraserIcon,
  EyeIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  HandIcon,
  ImageMinusIcon,
  Link2OffIcon,
  LinkIcon,
  Loader2Icon,
  type LucideIcon,
  PipetteIcon,
  Redo2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  ScanIcon,
  StampIcon,
  Undo2Icon,
  UserRoundIcon,
  WandSparklesIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { type ReactNode, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { adjustFilter } from '@/features/s-3d/raster/adjust'
import { cropCanvas, ctxOf, makeCanvas, resizeCanvas, straightenCanvas } from '@/features/s-3d/raster/canvas-ops'
import { cutOutBackground } from '@/features/s-3d/raster/matting'
import {
  type Mask,
  type Pixels,
  type Point,
  cloneStroke,
  combineMasks,
  featherMask,
  fillMask,
  growMask,
  healSpot,
  hexRgb,
  invertMask,
  maskSummary,
  paintStroke,
  pickColor,
  selectionMask,
} from '@/features/s-3d/raster/pixels'
import type { ImageAdjust } from '@/features/s-3d/types'
import { cn } from '@/lib/utils'

import { ADJUST_PRESETS, ADJUST_SLIDERS } from './image-adjust'

type Tool = 'hand' | 'crop' | 'brush' | 'eraser' | 'heal' | 'clone' | 'wand' | 'eyedropper'
type Rect = { x: number; y: number; w: number; h: number }
type Handle = 'nw' | 'ne' | 'sw' | 'se'

const TOOLS: { id: Tool; label: string; key: string; icon: LucideIcon; hint: string }[] = [
  { id: 'hand', label: 'Hand', key: 'h', icon: HandIcon, hint: 'Drag to pan. Ctrl + scroll zooms.' },
  { id: 'crop', label: 'Crop', key: 'c', icon: CropIcon, hint: 'Drag a box, move it or pull its corners, then press Enter.' },
  { id: 'brush', label: 'Brush', key: 'b', icon: BrushIcon, hint: 'Paint over the image. [ and ] change the size.' },
  { id: 'eraser', label: 'Eraser', key: 'e', icon: EraserIcon, hint: 'Erase pixels to transparency.' },
  { id: 'heal', label: 'Spot heal', key: 'j', icon: BandageIcon, hint: 'Click a blemish to blend it into its surroundings.' },
  { id: 'clone', label: 'Clone stamp', key: 's', icon: StampIcon, hint: 'Alt-click a source spot, then paint to copy it.' },
  { id: 'wand', label: 'Magic wand', key: 'w', icon: WandSparklesIcon, hint: 'Click to select similar colour. Shift adds, Alt subtracts.' },
  { id: 'eyedropper', label: 'Eyedropper', key: 'i', icon: PipetteIcon, hint: 'Click to pick the brush colour from the image.' },
]

const RATIOS: { label: string; value: number | 'original' | null }[] = [
  { label: 'Free', value: null },
  { label: 'Original', value: 'original' },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
]

const HISTORY_LIMIT = 40
const PAD = 32

const pixelsOf = (c: HTMLCanvasElement): Pixels => ({
  width: c.width,
  height: c.height,
  data: ctxOf(c).getImageData(0, 0, c.width, c.height).data,
})

function canvasOf(px: Pixels) {
  const c = makeCanvas(px.width, px.height)
  ctxOf(c).putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0)
  return c
}

async function canvasFromBlob(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  const c = makeCanvas(bitmap.width, bitmap.height)
  ctxOf(c).drawImage(bitmap, 0, 0)
  bitmap.close()
  return c
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), type, quality))

function rotate90(src: HTMLCanvasElement, clockwise: boolean) {
  const out = makeCanvas(src.height, src.width)
  const ctx = ctxOf(out)
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate(((clockwise ? 1 : -1) * Math.PI) / 2)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return out
}

function flip(src: HTMLCanvasElement, horizontal: boolean) {
  const out = makeCanvas(src.width, src.height)
  const ctx = ctxOf(out)
  ctx.translate(horizontal ? src.width : 0, horizontal ? 0 : src.height)
  ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1)
  ctx.drawImage(src, 0, 0)
  return out
}

/** Burns the live adjustments (a CSS filter while editing) into the pixels. */
function bake(src: HTMLCanvasElement, adjust: ImageAdjust) {
  const filter = adjustFilter(adjust)
  if (!filter) return src
  const out = makeCanvas(src.width, src.height)
  const ctx = ctxOf(out)
  ctx.filter = filter
  ctx.drawImage(src, 0, 0)
  return out
}

function hasTransparency(c: HTMLCanvasElement) {
  const d = pixelsOf(c).data
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true
  return false
}

const copyMask = (m: Mask): Mask => ({ ...m, data: m.data.slice() })

/** Mask from an image's alpha channel, such as a background cut-out. */
function alphaMask(c: HTMLCanvasElement): Mask {
  const d = pixelsOf(c).data
  const data = new Float32Array(c.width * c.height)
  for (let p = 0; p < data.length; p++) data[p] = d[p * 4 + 3] / 255
  return { width: c.width, height: c.height, data }
}

/** A box from a fixed corner to the pointer, kept to the aspect ratio and inside the image. */
function rectFrom(anchor: Point, p: Point, ratio: number | null, W: number, H: number): Rect {
  let w = p[0] - anchor[0]
  let h = p[1] - anchor[1]
  if (ratio) {
    if (Math.abs(w) / ratio > Math.abs(h)) h = (Math.sign(h) || 1) * (Math.abs(w) / ratio)
    else w = (Math.sign(w) || 1) * Math.abs(h) * ratio
  }
  const maxW = w >= 0 ? W - anchor[0] : anchor[0]
  const maxH = h >= 0 ? H - anchor[1] : anchor[1]
  if (ratio) {
    const k = Math.min(1, maxW / Math.max(1e-6, Math.abs(w)), maxH / Math.max(1e-6, Math.abs(h)))
    w *= k
    h *= k
  } else {
    w = Math.sign(w) * Math.min(Math.abs(w), maxW)
    h = Math.sign(h) * Math.min(Math.abs(h), maxH)
  }
  return { x: Math.min(anchor[0], anchor[0] + w), y: Math.min(anchor[1], anchor[1] + h), w: Math.abs(w), h: Math.abs(h) }
}

/** The largest centred box of the given ratio. */
function centredRect(W: number, H: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: W, h: H }
  const w = Math.min(W, H * ratio)
  const h = w / ratio
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="grid gap-1 text-xs" onDoubleClick={() => onChange(min < 0 ? 0 : min)} title="Double-click to reset">
      <span className="flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground tabular-nums">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        className="h-4 w-full cursor-pointer accent-primary"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="grid gap-2.5 border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  )
}

const chip = (active: boolean) =>
  cn(
    'h-7 rounded-md border px-2 text-xs transition-colors',
    active ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  )

export interface ImageEditorWidgetProps {
  /** The image to edit: a Blob, or a URL the browser can fetch (object URLs work; other sites need CORS). */
  source: Blob | string
  /** File name, shown in the header and used for downloads. */
  name?: string
  onClose: () => void
  /** Receives the edited image. Leave it out to open the editor without saving (download still works). */
  onSave?: (image: Blob) => void | Promise<void>
}

/**
 * S-Design's image tools in a standalone overlay: crop, rotate, flip, straighten and resize; brush, eraser, spot
 * healing and clone stamp; magic wand and AI subject selection with content fill; adjustments and presets; AI background
 * removal. Works on a Blob in and a Blob out, so any feature can open it (S-Note opens it when an image is clicked).
 */
export function ImageEditorWidget({ source, name = 'image', onClose, onSave }: ImageEditorWidgetProps) {
  const [history, setHistory] = useState<{ list: HTMLCanvasElement[]; at: number }>({ list: [], at: -1 })
  const current = history.list[history.at] as HTMLCanvasElement | undefined
  const [error, setError] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState('image/png')
  const [tool, setTool] = useState<Tool>('hand')
  const [adjust, setAdjust] = useState<ImageAdjust>({})
  const [brushSize, setBrushSize] = useState(40)
  const [hardness, setHardness] = useState(0.7)
  const [opacity, setOpacity] = useState(1)
  const [color, setColor] = useState('#ef4444')
  const [tolerance, setTolerance] = useState(32)
  const [contiguous, setContiguous] = useState(true)
  const [mask, setMask] = useState<Mask | null>(null)
  const [cloneFrom, setCloneFrom] = useState<Point | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [ratio, setRatio] = useState<number | 'original' | null>(null)
  const [angle, setAngle] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0, locked: true })
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [stage, setStage] = useState({ w: 800, h: 600 })
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [sizedFor, setSizedFor] = useState<HTMLCanvasElement | null | undefined>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const stroke = useRef<{ px: Pixels; source?: Pixels; offset?: Point; last: Point; frame: number } | null>(null)
  const drag = useRef<
    { mode: 'new' | 'move' | Handle; start: Point; rect: Rect } | { mode: 'pan'; x: number; y: number; left: number; top: number } | null
  >(null)

  // Load the image once.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const blob =
          typeof source === 'string'
            ? await fetch(source).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
            : source
        const c = await canvasFromBlob(blob)
        if (cancelled) return
        setSourceType(blob.type || 'image/png')
        setHistory({ list: [c], at: 0 })
      } catch {
        if (!cancelled)
          setError('This image could not be opened for editing. Images linked from other sites often block it; upload the file instead.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source])

  const W = current?.width ?? 1
  const H = current?.height ?? 1
  const shown = compare ? history.list[0] : current
  const fit = Math.min(1, (stage.w - PAD * 2) / (shown?.width ?? 1), (stage.h - PAD * 2) / (shown?.height ?? 1))
  const scale = zoom === 'fit' ? fit : zoom
  const liveMask = mask && mask.width === W && mask.height === H ? mask : null
  const ratioValue = ratio === 'original' ? W / H : ratio
  const dirty = history.at > 0 || !!adjustFilter(adjust)

  // Reset the resize fields to the current image whenever it changes.
  if (sizedFor !== current) {
    setSizedFor(current)
    if (current) setSize((s) => ({ ...s, w: current.width, h: current.height }))
  }

  const commit = useCallback((c: HTMLCanvasElement) => {
    setHistory((h) => {
      const list = [...h.list.slice(0, h.at + 1), c].slice(-HISTORY_LIMIT)
      return { list, at: list.length - 1 }
    })
  }, [])
  const undo = () => setHistory((h) => ({ ...h, at: Math.max(0, h.at - 1) }))
  const redo = () => setHistory((h) => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) }))

  // Keep the stage size for "fit".
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Draw the current image (or the original while comparing).
  useLayoutEffect(() => {
    const v = viewRef.current
    if (!v || !shown) return
    v.width = shown.width
    v.height = shown.height
    ctxOf(v).drawImage(shown, 0, 0)
  }, [shown])

  // Tint the selection.
  useLayoutEffect(() => {
    const c = maskRef.current
    if (!c) return
    c.width = W
    c.height = H
    if (!liveMask) return
    const img = new ImageData(W, H)
    for (let p = 0; p < liveMask.data.length; p++) {
      const m = liveMask.data[p]
      if (m <= 0) continue
      img.data[p * 4] = 59
      img.data[p * 4 + 1] = 130
      img.data[p * 4 + 2] = 246
      img.data[p * 4 + 3] = 120 * m
    }
    ctxOf(c).putImageData(img, 0, 0)
  }, [liveMask, W, H])

  // Entering crop starts from the whole image; leaving it drops the box and any straighten preview.
  const [cropFor, setCropFor] = useState<{ tool: Tool; current: HTMLCanvasElement | undefined } | null>(null)
  if (!cropFor || cropFor.tool !== tool || cropFor.current !== current) {
    setCropFor({ tool, current })
    if (tool === 'crop' && current) setCrop((c) => c ?? centredRect(current.width, current.height, null))
    if (tool !== 'crop') {
      setCrop(null)
      setAngle(0)
    }
  }

  const close = useCallback(() => {
    if (dirty && !window.confirm('Discard your changes to this image?')) return
    onClose()
  }, [dirty, onClose])

  const applyCrop = useCallback(() => {
    if (!current || !crop || crop.w < 1 || crop.h < 1) return
    const r = { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(crop.w), h: Math.round(crop.h) }
    if (r.x === 0 && r.y === 0 && r.w === current.width && r.h === current.height) return setTool('hand')
    commit(cropCanvas(current, r.x, r.y, r.w, r.h))
    setTool('hand')
  }, [commit, crop, current])

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label)
    try {
      await work()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const removeBackground = () =>
    run('Removing background…', async () => {
      if (!current) return
      commit(await canvasFromBlob(await cutOutBackground(await toBlob(current))))
    })

  const selectSubject = () =>
    run('Finding the subject…', async () => {
      if (!current) return
      setMask(alphaMask(await canvasFromBlob(await cutOutBackground(await toBlob(current)))))
      setTool('wand')
    })

  const editSelection = (edit: (px: Pixels, m: Mask) => void) => {
    if (!current || !liveMask) return
    const px = pixelsOf(current)
    edit(px, liveMask)
    commit(canvasOf(px))
  }

  const contentFill = () => editSelection((px, m) => fillMask(px, m))
  const deletePixels = () =>
    editSelection((px, m) => {
      for (let p = 0; p < m.data.length; p++) px.data[p * 4 + 3] *= 1 - m.data[p]
    })
  const fillColour = () =>
    editSelection((px, m) => {
      const [r, g, b] = hexRgb(color)
      for (let p = 0; p < m.data.length; p++) {
        const a = m.data[p] * opacity
        if (a <= 0) continue
        px.data[p * 4] += (r - px.data[p * 4]) * a
        px.data[p * 4 + 1] += (g - px.data[p * 4 + 1]) * a
        px.data[p * 4 + 2] += (b - px.data[p * 4 + 2]) * a
        px.data[p * 4 + 3] += (255 - px.data[p * 4 + 3]) * a
      }
    })

  const finalImage = async () => {
    if (!current) throw new Error('Nothing to save yet')
    const out = bake(current, adjust)
    const alpha = hasTransparency(out)
    const type = !alpha && (sourceType === 'image/jpeg' || sourceType === 'image/webp') ? sourceType : 'image/png'
    return toBlob(out, type, 0.92)
  }

  const save = () =>
    run('Saving…', async () => {
      if (!onSave) return
      await onSave(await finalImage())
      onClose()
    })

  const download = () =>
    run('Preparing download…', async () => {
      const blob = await finalImage()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name.replace(/\.[^.]+$/, '')}-edited.${blob.type.split('/')[1] === 'jpeg' ? 'jpg' : blob.type.split('/')[1]}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })

  const zoomBy = (k: number) => setZoom(clamp(scale * k, 0.05, 16))

  // Shortcuts. Typing in the panel's inputs is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      let handled = true
      if (mod && key === 'z') {
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && key === 'y') redo()
      else if (mod && key === '0') setZoom('fit')
      else if (mod && (key === '=' || key === '+')) zoomBy(1.25)
      else if (mod && key === '-') zoomBy(0.8)
      else if (mod) handled = false
      else if (e.key === 'Escape') {
        if (tool === 'crop') setTool('hand')
        else if (liveMask) setMask(null)
        else close()
      } else if (e.key === 'Enter' && tool === 'crop') applyCrop()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && liveMask) deletePixels()
      else if (e.key === '[') setBrushSize((s) => Math.max(1, Math.round(s * 0.85)))
      else if (e.key === ']') setBrushSize((s) => Math.min(800, Math.round(s * 1.18) + 1))
      else {
        const t = TOOLS.find((x) => x.key === key)
        if (t) setTool(t.id)
        else handled = false
      }
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const toPx = (e: { clientX: number; clientY: number }): Point => {
    const r = viewRef.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }

  const brushTool = tool === 'brush' || tool === 'eraser' || tool === 'clone' || tool === 'heal'

  const moveCursor = (e: ReactPointerEvent) => {
    const el = cursorRef.current
    const v = viewRef.current
    if (!el || !v) return
    const r = v.getBoundingClientRect()
    const d = brushSize * (r.width / W)
    el.style.display = brushTool ? 'block' : 'none'
    el.style.width = el.style.height = `${d}px`
    el.style.transform = `translate(${e.clientX - r.left - d / 2}px, ${e.clientY - r.top - d / 2}px)`
  }

  const paintSegment = (s: NonNullable<typeof stroke.current>, from: Point, to: Point) => {
    const brush = { size: brushSize, hardness, opacity }
    if (tool === 'brush') paintStroke(s.px, [from, to], brush, hexRgb(color))
    else if (tool === 'eraser') paintStroke(s.px, [from, to], brush)
    else if (tool === 'clone' && s.source && s.offset)
      cloneStroke(s.px, s.source, [from, to], [from[0] + s.offset[0], from[1] + s.offset[1]], brush)
  }

  const flush = () => {
    const s = stroke.current
    if (!s) return
    s.frame = 0
    ctxOf(viewRef.current!).putImageData(new ImageData(s.px.data as Uint8ClampedArray<ArrayBuffer>, s.px.width, s.px.height), 0, 0)
  }

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!current || busy || compare || e.button !== 0) return
    const p = toPx(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'hand') {
      const vp = stageRef.current?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]')
      if (vp) {
        drag.current = { mode: 'pan', x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop }
        setPanning(true)
      }
    } else if (tool === 'crop') {
      const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined
      const inside = crop && p[0] >= crop.x && p[0] <= crop.x + crop.w && p[1] >= crop.y && p[1] <= crop.y + crop.h
      drag.current = {
        mode: handle ?? (inside ? 'move' : 'new'),
        start: [clamp(p[0], 0, W), clamp(p[1], 0, H)],
        rect: crop ?? { x: 0, y: 0, w: W, h: H },
      }
    } else if (tool === 'eyedropper') {
      if (p[0] >= 0 && p[1] >= 0 && p[0] < W && p[1] < H) {
        setColor(pickColor(pixelsOf(current), p[0], p[1]).hex)
        setTool('brush')
      }
    } else if (tool === 'wand') {
      if (p[0] < 0 || p[1] < 0 || p[0] >= W || p[1] >= H) return
      const next = selectionMask(pixelsOf(current), { type: 'wand', x: p[0], y: p[1], tolerance, contiguous })
      if (liveMask && (e.shiftKey || e.altKey)) setMask(combineMasks(copyMask(liveMask), next, e.shiftKey ? 'add' : 'subtract'))
      else setMask(next)
    } else if (tool === 'heal') {
      const px = pixelsOf(current)
      healSpot(px, p[0], p[1], brushSize / 2)
      commit(canvasOf(px))
    } else if (tool === 'clone' && e.altKey) {
      setCloneFrom(p)
    } else if (tool === 'clone' && !cloneFrom) {
      toast.info('Alt-click the spot to copy from first')
    } else if (tool === 'brush' || tool === 'eraser' || tool === 'clone') {
      const px = pixelsOf(current)
      const s = {
        px,
        source: tool === 'clone' ? pixelsOf(current) : undefined,
        offset: cloneFrom ? ([cloneFrom[0] - p[0], cloneFrom[1] - p[1]] as Point) : undefined,
        last: p,
        frame: 0,
      }
      stroke.current = s
      paintSegment(s, p, p)
      flush()
    }
  }

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    moveCursor(e)
    const s = stroke.current
    if (s) {
      const p = toPx(e)
      paintSegment(s, s.last, p)
      s.last = p
      s.frame ||= requestAnimationFrame(flush)
      return
    }
    const d = drag.current
    if (!d) return
    if (d.mode === 'pan') {
      const vp = stageRef.current?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]')
      if (vp) {
        vp.scrollLeft = d.left - (e.clientX - d.x)
        vp.scrollTop = d.top - (e.clientY - d.y)
      }
      return
    }
    const p: Point = [clamp(toPx(e)[0], 0, W), clamp(toPx(e)[1], 0, H)]
    const r = d.rect
    if (d.mode === 'new') setCrop(rectFrom(d.start, p, ratioValue, W, H))
    else if (d.mode === 'move')
      setCrop({ ...r, x: clamp(r.x + p[0] - d.start[0], 0, W - r.w), y: clamp(r.y + p[1] - d.start[1], 0, H - r.h) })
    else {
      const anchor: Point = [d.mode.includes('w') ? r.x + r.w : r.x, d.mode.includes('n') ? r.y + r.h : r.y]
      setCrop(rectFrom(anchor, p, ratioValue, W, H))
    }
  }

  const onUp = () => {
    const s = stroke.current
    if (s) {
      if (s.frame) cancelAnimationFrame(s.frame)
      stroke.current = null
      commit(canvasOf(s.px))
    }
    if (drag.current && drag.current.mode !== 'pan' && crop && (crop.w < 4 || crop.h < 4)) setCrop(drag.current.rect)
    drag.current = null
    setPanning(false)
  }

  const pickRatio = (value: number | 'original' | null) => {
    setRatio(value)
    setCrop(centredRect(W, H, value === 'original' ? W / H : value))
  }

  const summary = liveMask ? maskSummary(liveMask) : null
  const activeTool = TOOLS.find((t) => t.id === tool)!
  const cursor = tool === 'hand' ? (panning ? 'grabbing' : 'grab') : tool === 'crop' ? 'crosshair' : brushTool ? 'none' : 'crosshair'

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-0"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${name}`}
    >
      <div className="flex h-[min(860px,94vh)] w-[min(1280px,96vw)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl animate-in zoom-in-95">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
          <span className="mr-2 max-w-64 truncate text-sm font-medium" title={name}>
            {name}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{current ? `${W} × ${H}` : ''}</span>
          <div className="mx-auto flex items-center gap-0.5">
            <Button variant="ghost" size="icon-xs" title="Undo (Ctrl+Z)" disabled={history.at <= 0} onClick={undo}>
              <Undo2Icon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Redo (Ctrl+Shift+Z)"
              disabled={history.at >= history.list.length - 1}
              onClick={redo}
            >
              <Redo2Icon />
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button variant="ghost" size="icon-xs" title="Zoom out (Ctrl -)" onClick={() => zoomBy(0.8)}>
              <ZoomOutIcon />
            </Button>
            <button
              className="w-12 text-center text-xs tabular-nums hover:text-foreground"
              title="Fit (Ctrl+0)"
              onClick={() => setZoom('fit')}
            >
              {Math.round(scale * 100)}%
            </button>
            <Button variant="ghost" size="icon-xs" title="Zoom in (Ctrl +)" onClick={() => zoomBy(1.25)}>
              <ZoomInIcon />
            </Button>
            <Button variant="ghost" size="icon-xs" title="Fit to screen" onClick={() => setZoom('fit')}>
              <ScanIcon />
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              variant={compare ? 'secondary' : 'ghost'}
              size="xs"
              title="Hold to see the original"
              disabled={!dirty}
              onPointerDown={() => setCompare(true)}
              onPointerUp={() => setCompare(false)}
              onPointerLeave={() => setCompare(false)}
            >
              <EyeIcon />
              Before
            </Button>
          </div>
          {busy && (
            <span className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              {busy}
            </span>
          )}
          <Button variant="ghost" size="xs" disabled={!current || !!busy} onClick={() => void download()}>
            <DownloadIcon />
            Download
          </Button>
          <Button variant="outline" size="xs" onClick={close}>
            Cancel
          </Button>
          {onSave && (
            <Button size="xs" disabled={!current || !!busy || !dirty} onClick={() => void save()}>
              <CheckIcon />
              Save
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" title="Close" onClick={close}>
            <XIcon />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Tool rail */}
          <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2" aria-label="Tools">
            {TOOLS.map((t) => (
              <Button
                key={t.id}
                variant={tool === t.id ? 'secondary' : 'ghost'}
                size="icon-sm"
                className={cn('size-9', tool === t.id && 'ring-1 ring-primary/40')}
                title={`${t.label} (${t.key.toUpperCase()})`}
                aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}
              >
                <t.icon className="size-4" />
              </Button>
            ))}
          </nav>

          {/* Stage */}
          <div ref={stageRef} className="relative min-w-0 flex-1 bg-muted/40">
            {error ? (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">{error}</div>
            ) : !current ? (
              <div className="grid h-full place-items-center">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea
                className="size-full"
                onWheel={(e) => {
                  if (!e.ctrlKey && !e.metaKey) return
                  e.preventDefault()
                  zoomBy(e.deltaY < 0 ? 1.1 : 0.9)
                }}
              >
                <div
                  className="grid min-h-full min-w-full place-items-center"
                  style={{ padding: PAD, width: 'max-content', height: 'max-content', minWidth: stage.w, minHeight: stage.h }}
                >
                  <div
                    className="relative touch-none select-none overflow-hidden shadow-lg ring-1 ring-black/10"
                    style={{
                      width: (shown?.width ?? W) * scale,
                      height: (shown?.height ?? H) * scale,
                      cursor,
                      background: 'repeating-conic-gradient(#d4d4d4 0 25%, #fafafa 0 50%) 0 0 / 16px 16px',
                    }}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    onPointerLeave={() => cursorRef.current && (cursorRef.current.style.display = 'none')}
                  >
                    <canvas
                      ref={viewRef}
                      className="absolute inset-0 size-full"
                      style={{
                        filter: compare ? undefined : adjustFilter(adjust),
                        imageRendering: scale > 2 ? 'pixelated' : undefined,
                        transform: angle
                          ? `rotate(${-angle}deg) scale(${1 + Math.abs(Math.sin((angle * Math.PI) / 180)) * 0.6})`
                          : undefined,
                      }}
                    />
                    <canvas
                      ref={maskRef}
                      className={cn('pointer-events-none absolute inset-0 size-full', (!liveMask || compare) && 'hidden')}
                    />
                    {cloneFrom && tool === 'clone' && (
                      <div
                        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_black]"
                        style={{ left: `${(cloneFrom[0] / W) * 100}%`, top: `${(cloneFrom[1] / H) * 100}%` }}
                      >
                        <div className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                      </div>
                    )}
                    {tool === 'crop' && crop && (
                      <div
                        className="absolute cursor-move border border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                        style={{
                          left: `${(crop.x / W) * 100}%`,
                          top: `${(crop.y / H) * 100}%`,
                          width: `${(crop.w / W) * 100}%`,
                          height: `${(crop.h / H) * 100}%`,
                        }}
                      >
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                          {Array.from({ length: 9 }, (_, i) => (
                            <div key={i} className="border-[0.5px] border-white/40" />
                          ))}
                        </div>
                        {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                          <div
                            key={h}
                            data-handle={h}
                            className={cn(
                              'absolute size-3.5 rounded-sm border-2 border-white bg-primary shadow',
                              h.includes('n') ? '-top-1.5' : '-bottom-1.5',
                              h.includes('w') ? '-left-1.5' : '-right-1.5',
                              h === 'nw' || h === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
                            )}
                          />
                        ))}
                        <span className="pointer-events-none absolute -top-6 left-0 rounded bg-black/70 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white tabular-nums">
                          {Math.round(crop.w)} × {Math.round(crop.h)}
                        </span>
                      </div>
                    )}
                    <div
                      ref={cursorRef}
                      className="pointer-events-none absolute top-0 left-0 hidden rounded-full border border-white mix-blend-difference"
                    />
                  </div>
                </div>
              </ScrollArea>
            )}
            {current && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow ring-1 ring-border">
                <span className="font-medium text-foreground">{activeTool.label}</span> · {activeTool.hint}
                {summary && summary.pixels > 0 && <> · {summary.pixels.toLocaleString()} px selected</>}
              </div>
            )}
          </div>

          {/* Options */}
          <aside className="flex w-72 shrink-0 flex-col border-l">
            <ScrollArea className="min-h-0 flex-1">
              {tool === 'crop' && (
                <Section title="Crop">
                  <div className="flex flex-wrap gap-1">
                    {RATIOS.map((r) => (
                      <button key={r.label} className={chip(ratio === r.value)} onClick={() => pickRatio(r.value)}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <Slider label="Straighten" value={angle} min={-45} max={45} step={0.5} suffix="°" onChange={setAngle} />
                  <div className="flex gap-1">
                    {angle !== 0 ? (
                      <Button
                        size="xs"
                        className="flex-1"
                        onClick={() => {
                          if (current) commit(straightenCanvas(current, angle, true))
                          setAngle(0)
                          setCrop(null)
                        }}
                      >
                        Apply straighten
                      </Button>
                    ) : (
                      <Button size="xs" className="flex-1" onClick={applyCrop}>
                        <CropIcon />
                        Apply crop
                      </Button>
                    )}
                    <Button size="xs" variant="outline" onClick={() => setTool('hand')}>
                      Cancel
                    </Button>
                  </div>
                </Section>
              )}

              {(tool === 'brush' || tool === 'eraser' || tool === 'clone' || tool === 'heal') && (
                <Section title={activeTool.label}>
                  {tool === 'brush' && (
                    <label className="flex items-center justify-between text-xs text-muted-foreground">
                      Colour
                      <span className="flex items-center gap-2">
                        <span className="text-foreground tabular-nums">{color}</span>
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="size-7 cursor-pointer rounded border bg-transparent"
                        />
                      </span>
                    </label>
                  )}
                  <Slider label="Size" value={brushSize} min={1} max={400} suffix="px" onChange={setBrushSize} />
                  {tool !== 'heal' && (
                    <Slider
                      label="Hardness"
                      value={Math.round(hardness * 100)}
                      min={0}
                      max={100}
                      suffix="%"
                      onChange={(v) => setHardness(v / 100)}
                    />
                  )}
                  {tool !== 'heal' && (
                    <Slider
                      label="Opacity"
                      value={Math.round(opacity * 100)}
                      min={1}
                      max={100}
                      suffix="%"
                      onChange={(v) => setOpacity(v / 100)}
                    />
                  )}
                  {tool === 'clone' && (
                    <p className="text-xs text-muted-foreground">
                      {cloneFrom ? 'Source set. Alt-click to move it.' : 'Alt-click the spot to copy from.'}
                    </p>
                  )}
                </Section>
              )}

              {(tool === 'wand' || liveMask) && (
                <Section
                  title="Selection"
                  actions={
                    liveMask && (
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMask(null)}>
                        Deselect
                      </button>
                    )
                  }
                >
                  {tool === 'wand' && (
                    <>
                      <Slider label="Tolerance" value={tolerance} min={0} max={255} onChange={setTolerance} />
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={contiguous}
                          onChange={(e) => setContiguous(e.target.checked)}
                        />
                        Contiguous
                      </label>
                    </>
                  )}
                  <Button size="xs" variant="outline" disabled={!!busy} onClick={() => void selectSubject()}>
                    <UserRoundIcon />
                    Select subject (AI)
                  </Button>
                  {liveMask && (
                    <>
                      <div className="grid grid-cols-2 gap-1">
                        <Button size="xs" variant="secondary" title="Fill the selection from its surroundings" onClick={contentFill}>
                          <WandSparklesIcon />
                          Remove
                        </Button>
                        <Button size="xs" variant="secondary" title="Make the selection transparent (Delete)" onClick={deletePixels}>
                          <EraserIcon />
                          Delete
                        </Button>
                        <Button size="xs" variant="secondary" onClick={fillColour}>
                          <span className="size-3 rounded-sm border" style={{ background: color }} />
                          Fill colour
                        </Button>
                        <Button size="xs" variant="secondary" onClick={() => setMask(invertMask(copyMask(liveMask)))}>
                          Invert
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => setMask(growMask(liveMask, 4))}>
                          Expand
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => setMask(growMask(liveMask, -4))}>
                          Contract
                        </Button>
                      </div>
                      <Button size="xs" variant="outline" onClick={() => setMask(featherMask(liveMask, 6))}>
                        Feather edges
                      </Button>
                    </>
                  )}
                </Section>
              )}

              <Section title="AI">
                <Button size="xs" variant="outline" disabled={!current || !!busy} onClick={() => void removeBackground()}>
                  <ImageMinusIcon />
                  Remove background
                </Button>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Runs in your browser. The first use downloads a small model.
                </p>
              </Section>

              <Section title="Transform">
                <div className="grid grid-cols-4 gap-1">
                  <Button
                    size="icon-xs"
                    variant="outline"
                    className="w-full"
                    title="Rotate left"
                    disabled={!current}
                    onClick={() => current && commit(rotate90(current, false))}
                  >
                    <RotateCcwIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="outline"
                    className="w-full"
                    title="Rotate right"
                    disabled={!current}
                    onClick={() => current && commit(rotate90(current, true))}
                  >
                    <RotateCwIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="outline"
                    className="w-full"
                    title="Flip horizontal"
                    disabled={!current}
                    onClick={() => current && commit(flip(current, true))}
                  >
                    <FlipHorizontal2Icon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="outline"
                    className="w-full"
                    title="Flip vertical"
                    disabled={!current}
                    onClick={() => current && commit(flip(current, false))}
                  >
                    <FlipVertical2Icon />
                  </Button>
                </div>
                <div className="flex items-end gap-1">
                  {(['w', 'h'] as const).map((k) => (
                    <label key={k} className="grid flex-1 gap-1 text-xs text-muted-foreground">
                      {k === 'w' ? 'Width' : 'Height'}
                      <input
                        type="number"
                        min={1}
                        max={16384}
                        value={size[k] || ''}
                        className="h-7 w-full rounded-md border bg-background px-2 text-xs text-foreground tabular-nums outline-none focus:border-primary"
                        onChange={(e) => {
                          const v = Math.max(0, Math.round(Number(e.target.value)))
                          setSize((s) =>
                            k === 'w'
                              ? { ...s, w: v, h: s.locked ? Math.round((v * H) / W) : s.h }
                              : { ...s, h: v, w: s.locked ? Math.round((v * W) / H) : s.w },
                          )
                        }}
                      />
                    </label>
                  ))}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title={size.locked ? 'Keep proportions: on' : 'Keep proportions: off'}
                    onClick={() => setSize((s) => ({ ...s, locked: !s.locked }))}
                  >
                    {size.locked ? <LinkIcon /> : <Link2OffIcon />}
                  </Button>
                </div>
                {current && size.w > 0 && size.h > 0 && (size.w !== W || size.h !== H) && (
                  <Button size="xs" onClick={() => commit(resizeCanvas(current, size.w, size.h, true))}>
                    Resize to {size.w} × {size.h}
                  </Button>
                )}
              </Section>

              <Section
                title="Adjust"
                actions={
                  dirty && adjustFilter(adjust) ? (
                    <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAdjust({})}>
                      Reset
                    </button>
                  ) : undefined
                }
              >
                <div className="flex flex-wrap gap-1">
                  {Object.entries(ADJUST_PRESETS).map(([label, preset]) => (
                    <button
                      key={label}
                      className={chip(JSON.stringify(preset) === JSON.stringify(adjust))}
                      onClick={() => setAdjust({ ...preset })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {ADJUST_SLIDERS.map((s) => (
                  <Slider
                    key={s.key}
                    label={s.label}
                    value={adjust[s.key] ?? 0}
                    min={s.min}
                    max={s.max}
                    suffix={s.suffix}
                    onChange={(v) => setAdjust((a) => ({ ...a, [s.key]: v }))}
                  />
                ))}
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={!!adjust.invert}
                    onChange={(e) => setAdjust((a) => ({ ...a, invert: e.target.checked }))}
                  />
                  Invert colours
                </label>
              </Section>
            </ScrollArea>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  )
}
