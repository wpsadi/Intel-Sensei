/**
 * Pixel tools behind the Photoshop-style image operations: brush and eraser, clone stamp, spot healing, selections,
 * smooth fill and vibrance. Everything works on RGBA buffers (straight alpha, like ImageData) so it runs in the browser
 * and in unit tests. Coordinates are source pixels of the image, not canvas units.
 */

export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type Point = [number, number]
export type RGB = [number, number, number]

/** Brush tip: diameter in pixels, hardness 0 (soft edge) .. 1 (hard edge), opacity 0..1 (flow per stamp). */
export interface Brush {
  size: number
  hardness: number
  opacity: number
}

/** Coverage per pixel, 0..1. */
export interface Mask {
  width: number
  height: number
  data: Float32Array
}

export type Selection =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'ellipse'; x: number; y: number; w: number; h: number }
  | { type: 'lasso'; points: Point[] }
  | { type: 'wand'; x: number; y: number; tolerance: number; contiguous: boolean }

/**
 * Background eraser: a stroke that removes only pixels close to `key` colour (per channel tolerance), so the subject
 * under the brush survives. Coverage fades with the colour distance, like Photoshop's sampling eraser.
 */
export function backgroundEraseStroke(px: Pixels, points: Point[], brush: Brush, key: RGB, tolerance: number) {
  const r = brush.size / 2
  for (const [cx, cy] of densify(points, Math.max(1, brush.size * 0.15))) {
    eachInDisc(px, cx, cy, r, (i, x, y) => {
      const d = Math.max(Math.abs(px.data[i] - key[0]), Math.abs(px.data[i + 1] - key[1]), Math.abs(px.data[i + 2] - key[2]))
      const match = d <= tolerance ? 1 : d <= tolerance * 1.5 ? (tolerance * 1.5 - d) / (tolerance * 0.5) : 0
      const a = falloff(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), r, brush.hardness) * brush.opacity * match
      px.data[i + 3] *= 1 - a
    })
  }
}

/** Coverage of a round brush tip at distance d from its centre: full inside the hard core, fading to 0 at the rim. */
function falloff(d: number, r: number, hardness: number) {
  if (d >= r) return 0
  const core = r * hardness
  if (d <= core) return 1
  return (r - d) / (r - core)
}

/** Points along the polyline every `spacing` pixels, so fast strokes leave no gaps between stamps. */
export function densify(points: Point[], spacing: number): Point[] {
  if (points.length <= 1) return points.slice()
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / spacing))
    for (let s = 1; s <= steps; s++) out.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps])
  }
  return out
}

/** Calls fn for every pixel index whose centre lies within r of (cx, cy), clipped to the buffer. */
function eachInDisc(px: Pixels, cx: number, cy: number, r: number, fn: (index: number, x: number, y: number) => void) {
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(px.width - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(px.height - 1, Math.ceil(cy + r))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn((y * px.width + x) * 4, x, y)
}

/** Source-over composite of one colour at coverage a onto the pixel at index i (straight alpha). */
function over(data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) {
  if (a <= 0) return
  const dA = data[i + 3] / 255
  const outA = a + dA * (1 - a)
  if (outA <= 0) return
  data[i] = (r * a + data[i] * dA * (1 - a)) / outA
  data[i + 1] = (g * a + data[i + 1] * dA * (1 - a)) / outA
  data[i + 2] = (b * a + data[i + 2] * dA * (1 - a)) / outA
  data[i + 3] = outA * 255
}

/** Brush stroke in a colour, or an eraser stroke (colour omitted) that removes pixels. */
export function paintStroke(px: Pixels, points: Point[], brush: Brush, color?: RGB) {
  const r = brush.size / 2
  for (const [cx, cy] of densify(points, Math.max(1, brush.size * 0.15))) {
    eachInDisc(px, cx, cy, r, (i, x, y) => {
      const a = falloff(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), r, brush.hardness) * brush.opacity
      if (!color) px.data[i + 3] *= 1 - a
      else over(px.data, i, color[0], color[1], color[2], a)
    })
  }
}

/**
 * Clone stamp: copies the pixels around `from` into the stroke, keeping the same offset while painting (aligned mode).
 * `source` is a copy of the pixels before the stroke, so the clone never samples its own output.
 */
export function cloneStroke(px: Pixels, source: Pixels, points: Point[], from: Point, brush: Brush) {
  const [ox, oy] = [from[0] - points[0][0], from[1] - points[0][1]]
  const r = brush.size / 2
  for (const [cx, cy] of densify(points, Math.max(1, brush.size * 0.15))) {
    eachInDisc(px, cx, cy, r, (i, x, y) => {
      const sx = Math.round(x + ox)
      const sy = Math.round(y + oy)
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) return
      const j = (sy * source.width + sx) * 4
      const a = falloff(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), r, brush.hardness) * brush.opacity * (source.data[j + 3] / 255)
      over(px.data, i, source.data[j], source.data[j + 1], source.data[j + 2], a)
    })
  }
}

/** Mean colour of the ring just outside radius r around (cx, cy), ignoring pixels outside the buffer. */
function ringMean(px: Pixels, cx: number, cy: number, r: number): RGB | null {
  let sr = 0,
    sg = 0,
    sb = 0,
    n = 0
  const outer = r * 1.6
  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
    for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
      if (x < 0 || y < 0 || x >= px.width || y >= px.height) continue
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d < r * 1.1 || d > outer) continue
      const i = (y * px.width + x) * 4
      sr += px.data[i]
      sg += px.data[i + 1]
      sb += px.data[i + 2]
      n++
    }
  }
  return n ? [sr / n, sg / n, sb / n] : null
}

/**
 * Spot healing: replaces a small blemish with texture copied from a nearby spot whose surroundings best match, then
 * corrects its brightness and colour to the blemish's surroundings and feathers the edge.
 */
export function healSpot(px: Pixels, cx: number, cy: number, r: number) {
  const before: Pixels = { width: px.width, height: px.height, data: px.data.slice() }
  const target = ringMean(px, cx, cy, r)
  if (!target) return
  let best: { dx: number; dy: number; corr: RGB; err: number } | null = null
  for (const dist of [2.2, 3]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      const dx = Math.cos(a) * r * dist
      const dy = Math.sin(a) * r * dist
      const sx = cx + dx
      const sy = cy + dy
      if (sx - r < 0 || sy - r < 0 || sx + r >= px.width || sy + r >= px.height) continue
      const mean = ringMean(before, sx, sy, r)
      if (!mean) continue
      const err = Math.abs(mean[0] - target[0]) + Math.abs(mean[1] - target[1]) + Math.abs(mean[2] - target[2])
      if (!best || err < best.err) best = { dx, dy, corr: [target[0] - mean[0], target[1] - mean[1], target[2] - mean[2]], err }
    }
  }
  if (!best) return
  eachInDisc(px, cx, cy, r, (i, x, y) => {
    const w = falloff(Math.hypot(x + 0.5 - cx, y + 0.5 - cy), r, 0.4)
    const j = (Math.round(y + best!.dy) * px.width + Math.round(x + best!.dx)) * 4
    if (j < 0 || j >= before.data.length) return
    for (let c = 0; c < 3; c++) px.data[i + c] = px.data[i + c] * (1 - w) + (before.data[j + c] + best!.corr[c]) * w
  })
}

/** Selection shape to a coverage mask. Wand selects by colour similarity to the seed pixel. */
export function selectionMask(px: Pixels, sel: Selection): Mask {
  const data = new Float32Array(px.width * px.height)
  const mask: Mask = { width: px.width, height: px.height, data }
  if (sel.type === 'rect') {
    for (let y = 0; y < px.height; y++)
      for (let x = 0; x < px.width; x++) {
        if (x + 0.5 >= sel.x && x + 0.5 < sel.x + sel.w && y + 0.5 >= sel.y && y + 0.5 < sel.y + sel.h) data[y * px.width + x] = 1
      }
  } else if (sel.type === 'ellipse') {
    const rx = sel.w / 2,
      ry = sel.h / 2,
      cx = sel.x + rx,
      cy = sel.y + ry
    for (let y = 0; y < px.height; y++)
      for (let x = 0; x < px.width; x++) {
        const dx = (x + 0.5 - cx) / rx,
          dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1) data[y * px.width + x] = 1
      }
  } else if (sel.type === 'lasso') {
    const pts = sel.points
    if (pts.length < 3) return mask
    for (let y = 0; y < px.height; y++)
      for (let x = 0; x < px.width; x++) if (insidePolygon(x + 0.5, y + 0.5, pts)) data[y * px.width + x] = 1
  } else {
    const sx = Math.round(sel.x),
      sy = Math.round(sel.y)
    if (sx < 0 || sy < 0 || sx >= px.width || sy >= px.height) throw new Error('Wand seed is outside the image')
    const seed = (sy * px.width + sx) * 4
    const same = (i: number) =>
      Math.max(
        Math.abs(px.data[i] - px.data[seed]),
        Math.abs(px.data[i + 1] - px.data[seed + 1]),
        Math.abs(px.data[i + 2] - px.data[seed + 2]),
        Math.abs(px.data[i + 3] - px.data[seed + 3]),
      ) <= sel.tolerance
    if (sel.contiguous) {
      const queue = [sy * px.width + sx]
      data[queue[0]] = 1
      while (queue.length) {
        const p = queue.pop()!
        const x = p % px.width,
          y = (p - x) / px.width
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= px.width || ny >= px.height) continue
          const q = ny * px.width + nx
          if (!data[q] && same(q * 4)) {
            data[q] = 1
            queue.push(q)
          }
        }
      }
    } else {
      for (let p = 0; p < data.length; p++) if (same(p * 4)) data[p] = 1
    }
  }
  return mask
}

function insidePolygon(x: number, y: number, pts: Point[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Combines selections the way Photoshop's add/subtract/intersect modes do. Mutates `into`. */
export function combineMasks(into: Mask, other: Mask, mode: 'add' | 'subtract' | 'intersect') {
  for (let p = 0; p < into.data.length; p++) {
    const b = other.data[p]
    into.data[p] = mode === 'add' ? Math.max(into.data[p], b) : mode === 'subtract' ? into.data[p] * (1 - b) : Math.min(into.data[p], b)
  }
  return into
}

export function invertMask(mask: Mask) {
  for (let p = 0; p < mask.data.length; p++) mask.data[p] = 1 - mask.data[p]
  return mask
}

/** Select & Mask "feather": a soft edge of about `radius` pixels (three box blurs approximate a Gaussian). */
export function featherMask(mask: Mask, radius: number): Mask {
  if (radius < 1) return mask
  const r = Math.round(radius)
  let src = mask.data
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(src.length)
    const out = new Float32Array(src.length)
    for (let y = 0; y < mask.height; y++)
      for (let x = 0; x < mask.width; x++) {
        let sum = 0,
          n = 0
        for (let k = Math.max(0, x - r); k <= Math.min(mask.width - 1, x + r); k++) {
          sum += src[y * mask.width + k]
          n++
        }
        tmp[y * mask.width + x] = sum / n
      }
    for (let x = 0; x < mask.width; x++)
      for (let y = 0; y < mask.height; y++) {
        let sum = 0,
          n = 0
        for (let k = Math.max(0, y - r); k <= Math.min(mask.height - 1, y + r); k++) {
          sum += tmp[k * mask.width + x]
          n++
        }
        out[y * mask.width + x] = sum / n
      }
    src = out
  }
  mask.data.set(src)
  return mask
}

/** Select & Mask "shift edge": positive grows the selection by `px` pixels, negative contracts it (square neighbourhood). */
export function growMask(mask: Mask, px: number): Mask {
  const steps = Math.round(Math.abs(px))
  const grow = px > 0
  for (let s = 0; s < steps; s++) {
    const prev = mask.data.slice()
    for (let y = 0; y < mask.height; y++)
      for (let x = 0; x < mask.width; x++) {
        let v = prev[y * mask.width + x]
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy
          const outside = nx < 0 || ny < 0 || nx >= mask.width || ny >= mask.height
          const n = outside ? 0 : prev[ny * mask.width + nx]
          v = grow ? Math.max(v, n) : Math.min(v, n)
        }
        mask.data[y * mask.width + x] = v
      }
  }
  return mask
}

/** Hue/Saturation/Lightness: hue in degrees (-180..180), saturation and lightness in -100..100. */
export function hueSaturation(px: Pixels, hue: number, saturation: number, lightness: number) {
  const sat = 1 + saturation / 100
  for (let i = 0; i < px.data.length; i += 4) {
    const [h, s, l] = rgbToHsl(px.data[i], px.data[i + 1], px.data[i + 2])
    const l2 = lightness >= 0 ? l + (lightness / 100) * (1 - l) : l + (lightness / 100) * l
    const [r, g, b] = hslToRgb((((h + hue) % 360) + 360) % 360, Math.min(1, Math.max(0, s * sat)), Math.min(1, Math.max(0, l2)))
    px.data[i] = r
    px.data[i + 1] = g
    px.data[i + 2] = b
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

/**
 * Smooth fill of the selected pixels from their surroundings (push-pull averaging over a pyramid). It gives clean
 * removals on plain or gently varying areas; it does not synthesise new texture the way Photoshop's content-aware fill does.
 */
export function fillMask(px: Pixels, mask: Mask) {
  type Level = { w: number; h: number; rgb: Float32Array; known: Float32Array }
  const levels: Level[] = []
  let level: Level = {
    w: px.width,
    h: px.height,
    rgb: new Float32Array(px.width * px.height * 3),
    known: new Float32Array(px.width * px.height),
  }
  for (let p = 0; p < px.width * px.height; p++) {
    level.rgb.set([px.data[p * 4], px.data[p * 4 + 1], px.data[p * 4 + 2]], p * 3)
    level.known[p] = 1 - mask.data[p]
  }
  levels.push(level)
  while (level.w > 1 || level.h > 1) {
    const w = Math.ceil(level.w / 2),
      h = Math.ceil(level.h / 2)
    const next: Level = { w, h, rgb: new Float32Array(w * h * 3), known: new Float32Array(w * h) }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0,
          r = 0,
          g = 0,
          b = 0
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(level.w - 1, x * 2 + dx),
              sy = Math.min(level.h - 1, y * 2 + dy)
            const q = sy * level.w + sx
            const k = level.known[q]
            sum += k
            r += level.rgb[q * 3] * k
            g += level.rgb[q * 3 + 1] * k
            b += level.rgb[q * 3 + 2] * k
          }
        const o = y * w + x
        next.known[o] = sum / 4
        if (sum > 0) next.rgb.set([r / sum, g / sum, b / sum], o * 3)
      }
    levels.push(next)
    level = next
  }
  // Pull: holes take the value of the coarser level, sampled bilinearly, from coarse to fine.
  for (let l = levels.length - 2; l >= 0; l--) {
    const fine = levels[l],
      coarse = levels[l + 1]
    for (let y = 0; y < fine.h; y++)
      for (let x = 0; x < fine.w; x++) {
        const o = y * fine.w + x
        if (fine.known[o] > 0) continue
        const fx = Math.max(0, Math.min(coarse.w - 1, (x + 0.5) / 2 - 0.5))
        const fy = Math.max(0, Math.min(coarse.h - 1, (y + 0.5) / 2 - 0.5))
        const x0 = Math.floor(fx),
          y0 = Math.floor(fy),
          x1 = Math.min(coarse.w - 1, x0 + 1),
          y1 = Math.min(coarse.h - 1, y0 + 1)
        const tx = fx - x0,
          ty = fy - y0
        for (let c = 0; c < 3; c++) {
          const top = coarse.rgb[(y0 * coarse.w + x0) * 3 + c] * (1 - tx) + coarse.rgb[(y0 * coarse.w + x1) * 3 + c] * tx
          const bottom = coarse.rgb[(y1 * coarse.w + x0) * 3 + c] * (1 - tx) + coarse.rgb[(y1 * coarse.w + x1) * 3 + c] * tx
          fine.rgb[o * 3 + c] = top * (1 - ty) + bottom * ty
        }
        fine.known[o] = 1
      }
  }
  const filled = levels[0].rgb
  for (let p = 0; p < px.width * px.height; p++) {
    const m = mask.data[p]
    if (m <= 0) continue
    for (let c = 0; c < 3; c++) px.data[p * 4 + c] = px.data[p * 4 + c] * (1 - m) + filled[p * 3 + c] * m
    px.data[p * 4 + 3] = px.data[p * 4 + 3] * (1 - m) + 255 * m
  }
}

/** Vibrance: boosts muted colours more than saturated ones (-100 desaturates, 100 is the strongest boost). */
export function vibrance(px: Pixels, amount: number) {
  const k = amount / 100
  for (let i = 0; i < px.data.length; i += 4) {
    const r = px.data[i],
      g = px.data[i + 1],
      b = px.data[i + 2]
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b)
    const sat = mx === 0 ? 0 : (mx - mn) / mx
    const factor = k >= 0 ? 1 + k * (1 - sat) : 1 + k
    const avg = (r + g + b) / 3
    px.data[i] = avg + (r - avg) * factor
    px.data[i + 1] = avg + (g - avg) * factor
    px.data[i + 2] = avg + (b - avg) * factor
  }
}

/** Colour at a source pixel as #rrggbb plus alpha 0..1 (eyedropper). */
export function pickColor(px: Pixels, x: number, y: number) {
  if (x < 0 || y < 0 || x >= px.width || y >= px.height) throw new Error(`Pixel (${x}, ${y}) is outside the ${px.width}×${px.height} image`)
  const i = (Math.floor(y) * px.width + Math.floor(x)) * 4
  const hex = [px.data[i], px.data[i + 1], px.data[i + 2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  return { hex: `#${hex}`, alpha: +(px.data[i + 3] / 255).toFixed(3) }
}

/** #rgb or #rrggbb to channels 0..255. */
export function hexRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`Colour "${hex}" must be a hex value such as #1e293b`)
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB
}

/** Pixel count and bounding box of a selection (coverage above one half counts as selected). */
export function maskSummary(mask: Mask) {
  let count = 0,
    minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1
  for (let p = 0; p < mask.data.length; p++) {
    if (mask.data[p] < 0.5) continue
    const x = p % mask.width,
      y = (p - x) / mask.width
    count++
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return count ? { pixels: count, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } } : { pixels: 0, bounds: null }
}

/** Blends an edited buffer back over the original through a selection: selected pixels take the edit, the rest stay. */
export function clipToMask(original: Uint8ClampedArray, edited: Uint8ClampedArray, mask: Mask) {
  for (let p = 0; p < mask.data.length; p++) {
    const m = mask.data[p]
    if (m >= 1) continue
    for (let c = 0; c < 4; c++) edited[p * 4 + c] = original[p * 4 + c] * (1 - m) + edited[p * 4 + c] * m
  }
  return edited
}
