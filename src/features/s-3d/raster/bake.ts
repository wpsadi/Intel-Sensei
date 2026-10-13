import { readFile, storeFile } from '../files'
import { useS3D } from '../store'
import type { SNode } from '../types'
import { clipToMask, combineMasks, featherMask, growMask, invertMask, type Mask, type Pixels, type Selection, selectionMask } from './pixels'

/**
 * Photoshop-style raster edits on image nodes. Each edit decodes the node's source, changes the pixels, and stores the
 * result as a new file. The first original is kept in `origSrc`, so `revertImages` can always undo the whole stack.
 * Layer masks are PNGs whose alpha shows (opaque) or hides (transparent) the image, applied through CSS mask-image.
 */

/** Active pixel selection per image node. Session only, like Photoshop's marching ants; cleared when the size changes. */
const selections = new Map<string, Mask>()

export const activeSelection = (id: string) => selections.get(id)

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

const ctxOf = (canvas: HTMLCanvasElement) => canvas.getContext('2d', { willReadFrequently: true })!

export async function decode(src: string): Promise<HTMLCanvasElement> {
  const blob = await readFile(src)
  if (!blob) throw new Error('Could not read the image file')
  const bitmap = await createImageBitmap(blob)
  const canvas = makeCanvas(bitmap.width, bitmap.height)
  ctxOf(canvas).drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}

async function encode(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the edited image'))), 'image/png'),
  )
  return storeFile(blob, name, useS3D.getState().doc.id)
}

const imageNode = (id: string): SNode | undefined => {
  const n = useS3D.getState().doc.nodes[id]
  return n?.type === 'image' ? n : undefined
}

/** Geometry edits (crop, resize, canvas size, straighten). The node keeps its scale: a 2x wider image is drawn 2x wider. */
export function cropCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const out = makeCanvas(w, h)
  ctxOf(out).drawImage(src, -x, -y)
  return out
}

export function resizeCanvas(src: HTMLCanvasElement, w: number, h: number, smooth: boolean) {
  const out = makeCanvas(w, h)
  const ctx = ctxOf(out)
  ctx.imageSmoothingEnabled = smooth
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

/** Anchor name to the fraction of the free space placed before the image: 0 = start, 0.5 = centre, 1 = end. */
const ANCHORS: Record<string, [number, number]> = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0],
  left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
}

/** Canvas size: a larger canvas with transparent space, the image placed by anchor; a smaller one crops around the anchor. */
export function extendCanvas(src: HTMLCanvasElement, w: number, h: number, anchor: string) {
  const [fx, fy] = ANCHORS[anchor] ?? ANCHORS.center
  const out = makeCanvas(w, h)
  ctxOf(out).drawImage(src, Math.round((w - src.width) * fx), Math.round((h - src.height) * fy))
  return out
}

/** Largest scale k (0..1) of a w×h rectangle that stays inside the original image after rotating by rad. */
function inscribedScale(w: number, h: number, rad: number) {
  const c = Math.cos(rad), s = Math.sin(rad)
  const fits = (k: number) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([sx, sy]) => {
    const x = (sx * k * w) / 2
    const y = (sy * k * h) / 2
    const u = x * c + y * s
    const v = -x * s + y * c
    return Math.abs(u) <= w / 2 + 1e-6 && Math.abs(v) <= h / 2 + 1e-6
  })
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** Straighten: rotates by degrees (counter-clockwise positive, like Photoshop) and, with crop, trims to the largest upright area. */
export function straightenCanvas(src: HTMLCanvasElement, degrees: number, crop: boolean) {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
  const W = Math.ceil(src.width * cos + src.height * sin)
  const H = Math.ceil(src.width * sin + src.height * cos)
  const out = makeCanvas(W, H)
  const ctx = ctxOf(out)
  // Photoshop rotates counter-clockwise for positive angles; canvas rotates clockwise, so negate.
  ctx.translate(W / 2, H / 2)
  ctx.rotate(-rad)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  if (!crop) return out
  const k = inscribedScale(src.width, src.height, rad)
  const w = Math.floor(src.width * k)
  const h = Math.floor(src.height * k)
  return cropCanvas(out, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h)
}

/**
 * Applies a geometry transform to each image (and its layer mask), keeping the first original for revert. Crop, canvas
 * and straighten keep the pixel scale, so the node is resized to match. Resampling keeps the node's on-canvas size.
 */
export async function transformImages(ids: string[], transform: (c: HTMLCanvasElement) => HTMLCanvasElement, opts: { keepSize?: boolean } = {}) {
  const st = useS3D.getState
  const done: string[] = []
  for (const id of ids) {
    const n = imageNode(id)
    if (!n) continue
    const canvas = await decode(n.src)
    const out = transform(canvas)
    const patch: Partial<SNode> = {
      src: await encode(out, `${n.name}-edit.png`),
      origSrc: n.origSrc ?? n.src,
      w: opts.keepSize ? n.w : (n.w * out.width) / canvas.width,
      h: opts.keepSize ? n.h : (n.h * out.height) / canvas.height,
    }
    if (n.layerMask) patch.layerMask = await encode(transform(await decode(n.layerMask)), `${n.name}-mask.png`)
    selections.delete(id)
    st().updateNodes([id], patch)
    done.push(id)
  }
  return done
}

/**
 * Pixel edit (brush, clone, heal, fill, vibrance) on the image or its layer mask. The active selection, if any, limits
 * the change: selected pixels take the edit, the rest keep their original value.
 */
export async function editPixels(
  ids: string[],
  mutate: (px: Pixels, selection: Mask | undefined) => void,
  opts: { target?: 'pixels' | 'mask'; initial?: 'reveal' | 'hide' } = {},
) {
  const st = useS3D.getState
  const target = opts.target ?? 'pixels'
  const done: string[] = []
  for (const id of ids) {
    const n = imageNode(id)
    if (!n) continue
    let canvas: HTMLCanvasElement
    if (target === 'mask' && !n.layerMask) {
      const size = await decode(n.src)
      canvas = makeCanvas(size.width, size.height)
      if (opts.initial !== 'hide') {
        ctxOf(canvas).fillStyle = '#fff'
        ctxOf(canvas).fillRect(0, 0, canvas.width, canvas.height)
      }
    } else {
      canvas = await decode(target === 'mask' ? n.layerMask! : n.src)
    }
    const ctx = ctxOf(canvas)
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const original = image.data.slice()
    const sel = activeSelection(id)
    const usable = sel && sel.width === canvas.width && sel.height === canvas.height ? sel : undefined
    mutate({ width: canvas.width, height: canvas.height, data: image.data }, usable)
    if (usable) clipToMask(original, image.data, usable)
    ctx.putImageData(image, 0, 0)
    const src = await encode(canvas, target === 'mask' ? `${n.name}-mask.png` : `${n.name}-edit.png`)
    st().updateNodes([id], target === 'mask' ? { layerMask: src } : { src, origSrc: n.origSrc ?? n.src })
    done.push(id)
  }
  return done
}

/** Updates the session selection for an image: replaces it, or combines the new shape with the current one. */
export type SelectMode = 'replace' | 'add' | 'subtract' | 'intersect' | 'invert' | 'deselect' | 'layerMask'

/**
 * Updates the session selection. `layerMask` turns the selection into the image's layer mask (Photoshop "Add layer
 * mask > reveal selection") and clears the selection. `refine` grows or contracts the edge, then feathers it.
 */
export async function selectPixels(id: string, mode: SelectMode, sel?: Selection, refine?: { grow?: number; feather?: number }) {
  const n = imageNode(id)
  if (!n) throw new Error(`Node ${id} is not an image`)
  if (mode === 'deselect') {
    selections.delete(id)
    return null
  }
  if (mode === 'layerMask') {
    const mask = selections.get(id)
    if (!mask) throw new Error('No selection to turn into a layer mask')
    selections.delete(id)
    await editPixels([id], (px) => {
      for (let p = 0; p < mask.data.length; p++) {
        px.data.set([255, 255, 255, Math.round(mask.data[p] * 255)], p * 4)
      }
    }, { target: 'mask', initial: 'hide' })
    return null
  }
  const current = selections.get(id)
  if (mode === 'invert') {
    const base = current ?? (await fullMask(n.src))
    selections.set(id, invertMask(base))
    return selections.get(id)!
  }
  if (!sel) throw new Error('Pass a selection shape (rect, ellipse, lasso or wand)')
  const canvas = await decode(n.src)
  const shape = selectionMask({ width: canvas.width, height: canvas.height, data: ctxOf(canvas).getImageData(0, 0, canvas.width, canvas.height).data }, sel)
  const combined = mode === 'replace' || !current ? shape : combineMasks(current, shape, mode === 'add' ? 'add' : mode === 'subtract' ? 'subtract' : 'intersect')
  if (refine?.grow) growMask(combined, refine.grow)
  if (refine?.feather) featherMask(combined, refine.feather)
  selections.set(id, combined)
  return selections.get(id)!
}

async function fullMask(src: string): Promise<Mask> {
  const canvas = await decode(src)
  return { width: canvas.width, height: canvas.height, data: new Float32Array(canvas.width * canvas.height).fill(1) }
}

/** Reads the pixels of an image's current source without changing it. */
export async function readPixels(id: string) {
  const n = imageNode(id)
  if (!n) throw new Error(`Node ${id} is not an image`)
  const canvas = await decode(n.src)
  return { canvas, px: ctxOf(canvas).getImageData(0, 0, canvas.width, canvas.height) }
}

/** Puts back the original file and drops the layer mask, undoing the whole raster stack for each node. */
export function revertImages(ids: string[], opts: { mask?: boolean } = {}) {
  const st = useS3D.getState
  const reverted: string[] = []
  for (const id of ids) {
    const n = imageNode(id)
    if (!n) continue
    if (opts.mask) {
      if (!n.layerMask) continue
      st().updateNodes([id], { layerMask: undefined })
    } else {
      if (!n.origSrc) continue
      st().updateNodes([id], { src: n.origSrc, origSrc: undefined, layerMask: undefined })
      selections.delete(id)
    }
    reverted.push(id)
  }
  return reverted
}
