import { toast } from 'sonner'

import { impl } from '@/features/s-3d/agent/tools-impl'
import { absPos } from '@/features/s-3d/model'
import { decode } from '@/features/s-3d/raster/bake'
import type { Point } from '@/features/s-3d/raster/pixels'
import { useS3D } from '@/features/s-3d/store'
import type { Doc, SNode, Tool } from '@/features/s-3d/types'

/** Pixel tools on the canvas. Each one calls the same agent tool that the model uses, so both paths stay in step. */
export type RasterTool = 'brush' | 'eraser' | 'clone' | 'heal' | 'marquee' | 'lasso' | 'wand' | 'quick' | 'crop' | 'eyedropper' | 'zoom'

export const RASTER_TOOLS: RasterTool[] = [
  'brush',
  'eraser',
  'clone',
  'heal',
  'marquee',
  'lasso',
  'wand',
  'quick',
  'crop',
  'eyedropper',
  'zoom',
]
export const BRUSH_TOOLS: Tool[] = ['brush', 'eraser', 'clone', 'heal']
export const isRaster = (t: Tool): t is RasterTool => (RASTER_TOOLS as Tool[]).includes(t)

export interface XY {
  x: number
  y: number
}

/** A pixel gesture: world points collected while the pointer is down, converted to source pixels on release. */
export interface RasterGesture {
  kind: 'raster'
  tool: RasterTool
  id: string
  start: XY
  points: XY[]
  shift: boolean
  alt: boolean
}

const sizes = new Map<string, { width: number; height: number }>()
const pending = new Map<string, Promise<{ width: number; height: number }>>()

/** Pixel size of an image source. Cached per source: every edit stores a new source, so the cache never goes stale. */
export function imageSize(src: string) {
  const known = sizes.get(src)
  if (known) return Promise.resolve(known)
  let p = pending.get(src)
  if (!p) {
    p = decode(src)
      .then(({ width, height }) => {
        sizes.set(src, { width, height })
        return { width, height }
      })
      .finally(() => pending.delete(src))
    pending.set(src, p)
  }
  return p
}

/** Already-measured size of an image source, or undefined (for synchronous rendering). */
export const cachedSize = (src: string) => sizes.get(src)

/** World point of a source pixel on the canvas. */
export function pixelToWorld(doc: Doc, node: SNode, dims: { width: number; height: number }, px: Point): XY {
  const origin = absPos(doc, node.id)
  return { x: origin.x + (px[0] * node.w) / dims.width, y: origin.y + (px[1] * node.h) / dims.height }
}

/** The image a pixel tool works on: the image under the pointer, else the first selected image. */
export function rasterImage(doc: Doc, hit: string | null, selection: string[]): SNode | undefined {
  const under = hit ? doc.nodes[hit] : undefined
  if (under?.type === 'image') return under
  return selection.map((id) => doc.nodes[id]).find((n) => n?.type === 'image')
}

export const rectOf = (a: XY, b: XY) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) })

/** Starts a pixel gesture on the target image; null (with a toast) when there is no image that can be edited. */
export function startRaster(tool: RasterTool, hit: string | null, start: XY, mods: { shift: boolean; alt: boolean }): RasterGesture | null {
  const st = useS3D.getState()
  const node = rasterImage(st.doc, hit, st.selection)
  if (!node) {
    toast('Select an image first')
    return null
  }
  if (node.rotation) {
    toast('Straighten the image back to 0° to edit its pixels')
    return null
  }
  if (!st.selection.includes(node.id)) st.select([node.id])
  return { kind: 'raster', tool, id: node.id, start, points: [start], ...mods }
}

/** On-screen diameter of the brush outline: the brush size in image pixels, scaled to the image's size on the canvas. */
export function brushDiameter(doc: Doc, hit: string | null, selection: string[], size: number, zoom: number) {
  const node = rasterImage(doc, hit, selection)
  const dims = node ? sizes.get(node.src) : undefined
  const scale = node && dims ? node.w / dims.width : 1
  return size * scale * zoom
}

/** Source-pixel rectangle between two points, clamped to the image. */
function pixelRect(a: Point, b: Point, dims: { width: number; height: number }) {
  const x0 = Math.min(dims.width - 1, Math.max(0, Math.floor(Math.min(a[0], b[0]))))
  const y0 = Math.min(dims.height - 1, Math.max(0, Math.floor(Math.min(a[1], b[1]))))
  const x1 = Math.min(dims.width, Math.max(0, Math.ceil(Math.max(a[0], b[0]))))
  const y1 = Math.min(dims.height, Math.max(0, Math.ceil(Math.max(a[1], b[1]))))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Runs the gesture's edit through the agent tools on release. Errors are shown as toasts. */
export async function commitRaster(g: RasterGesture) {
  const st = useS3D.getState()
  const node = st.doc.nodes[g.id]
  if (!node) return
  const ids = [g.id]
  const mode = g.shift ? 'add' : g.alt ? 'subtract' : 'replace'
  const { brush, foregroundColor } = st
  const select = (selection: Parameters<typeof impl.select_pixels>[0]['selection']) => impl.select_pixels({ ids, mode, selection })
  // A click without a drag clears the selection, as in Photoshop; with shift or alt it changes nothing.
  const clickSelect = () => (mode === 'replace' ? impl.select_pixels({ ids, mode: 'deselect' }) : undefined)
  try {
    const dims = await imageSize(node.src)
    const origin = absPos(st.doc, g.id)
    const toPx = (p: XY): Point => [((p.x - origin.x) * dims.width) / node.w, ((p.y - origin.y) * dims.height) / node.h]
    const at = toPx(g.start)
    const last = toPx(g.points[g.points.length - 1])
    const dragged = Math.abs(last[0] - at[0]) + Math.abs(last[1] - at[1]) >= 1
    const stroke = { size: brush.size, hardness: brush.hardness, opacity: brush.opacity, points: g.points.map(toPx) }
    switch (g.tool) {
      case 'brush':
        await impl.paint_image({ ids, strokes: [{ mode: 'paint', color: foregroundColor, ...stroke }] })
        return
      case 'eraser':
        await impl.paint_image({ ids, strokes: [{ mode: 'erase', ...stroke }] })
        return
      case 'clone': {
        if (g.alt) {
          st.set({ cloneSample: { id: g.id, x: Math.round(at[0]), y: Math.round(at[1]) } })
          toast('Clone source set')
          return
        }
        const sample = useS3D.getState().cloneSample
        if (!sample || sample.id !== g.id) {
          toast('Alt-click this image to set the clone source first')
          return
        }
        await impl.clone_image({ ids, strokes: [{ from: [sample.x, sample.y], ...stroke }] })
        return
      }
      case 'heal':
        await impl.heal_image({ ids, spots: [{ x: at[0], y: at[1], size: brush.size }] })
        return
      case 'marquee':
        if (!dragged) return void (await clickSelect())
        await select({ type: st.marqueeShape, ...pixelRect(at, last, dims) })
        return
      case 'lasso':
        if (!dragged) return void (await clickSelect())
        if (g.points.length < 3) return
        await select({ type: 'lasso', points: g.points.map(toPx) })
        return
      case 'wand':
      case 'quick':
        await select({
          type: 'wand',
          x: Math.floor(at[0]),
          y: Math.floor(at[1]),
          tolerance: g.tool === 'quick' ? 64 : 32,
          contiguous: true,
        })
        return
      case 'crop': {
        const r = pixelRect(at, last, dims)
        if (r.w < 1 || r.h < 1) return
        await impl.crop_image({ ids, ...r })
        return
      }
      case 'eyedropper': {
        const { hex } = await impl.pick_color({ ids, x: Math.floor(at[0]), y: Math.floor(at[1]) })
        st.set(g.alt ? { backgroundColor: hex } : { foregroundColor: hex })
        return
      }
      default:
        return
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'The pixel edit failed')
  }
}
