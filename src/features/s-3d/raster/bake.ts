import { readFile, storeFile } from '../files'
import { useS3D } from '../store'
import type { SNode } from '../types'
import { cropCanvas, ctxOf, extendCanvas, makeCanvas, resizeCanvas, straightenCanvas } from './canvas-ops'
import {
  type Mask,
  type Pixels,
  type Selection,
  clipToMask,
  combineMasks,
  featherMask,
  growMask,
  invertMask,
  selectionMask,
} from './pixels'

/**
 * Photoshop-style raster edits on image nodes. Each edit decodes the node's source, changes the pixels, and stores the
 * result as a new file. The first original is kept in `origSrc`, so `revertImages` can always undo the whole stack.
 * Layer masks are PNGs whose alpha shows (opaque) or hides (transparent) the image, applied through CSS mask-image.
 */

/** Active pixel selection per image node. Session only, like Photoshop's marching ants; cleared when the size changes. */
const selections = new Map<string, Mask>()

export const activeSelection = (id: string) => selections.get(id)

export { cropCanvas, extendCanvas, makeCanvas, resizeCanvas, straightenCanvas }

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

/**
 * Applies a geometry transform to each image (and its layer mask), keeping the first original for revert. Crop, canvas
 * and straighten keep the pixel scale, so the node is resized to match. Resampling keeps the node's on-canvas size.
 */
export async function transformImages(
  ids: string[],
  transform: (c: HTMLCanvasElement) => HTMLCanvasElement,
  opts: { keepSize?: boolean } = {},
) {
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
    await editPixels(
      [id],
      (px) => {
        for (let p = 0; p < mask.data.length; p++) {
          px.data.set([255, 255, 255, Math.round(mask.data[p] * 255)], p * 4)
        }
      },
      { target: 'mask', initial: 'hide' },
    )
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
  const shape = selectionMask(
    { width: canvas.width, height: canvas.height, data: ctxOf(canvas).getImageData(0, 0, canvas.width, canvas.height).data },
    sel,
  )
  const combined =
    mode === 'replace' || !current
      ? shape
      : combineMasks(current, shape, mode === 'add' ? 'add' : mode === 'subtract' ? 'subtract' : 'intersect')
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
