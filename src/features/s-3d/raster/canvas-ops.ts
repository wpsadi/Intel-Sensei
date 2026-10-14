/**
 * Pure canvas geometry for raster images: crop, resample, canvas size and straighten. Store-free, so S-Design's
 * image nodes and standalone editors (such as the image editor widget in S-Note) share the same code.
 */

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export const ctxOf = (canvas: HTMLCanvasElement) => canvas.getContext('2d', { willReadFrequently: true })!

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
  'top-left': [0, 0],
  top: [0.5, 0],
  'top-right': [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  'bottom-left': [0, 1],
  bottom: [0.5, 1],
  'bottom-right': [1, 1],
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
  const c = Math.cos(rad),
    s = Math.sin(rad)
  const fits = (k: number) =>
    [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].every(([sx, sy]) => {
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
  const cos = Math.abs(Math.cos(rad)),
    sin = Math.abs(Math.sin(rad))
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
