import * as THREE from 'three'
import { resolveFile } from '../files'
import type { Material3D, TexturePattern } from '../types'

export const TEXTURE_PATTERNS: TexturePattern[] = ['checker', 'stripes', 'ridges', 'dots', 'grid', 'bricks', 'noise', 'wood', 'waves', 'weave', 'fur', 'pores', 'hide']

const SIZE = 256
const TAU = Math.PI * 2

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
/** Tileable value noise: lattice coordinates wrap at `period`. */
function vnoise(x: number, y: number, period: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const w = (a: number) => ((a % period) + period) % period
  const s = (t: number) => t * t * (3 - 2 * t)
  const a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi)), c = hash(w(xi), w(yi + 1)), d = hash(w(xi + 1), w(yi + 1))
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf)
}
const fbm = (u: number, v: number, base: number) => {
  let sum = 0, amp = 0.5, f = base
  for (let i = 0; i < 4; i++, amp /= 2, f *= 2) sum += amp * vnoise(u * f, v * f, f)
  return sum
}

/** Height (0..1) of each pattern at a tiling coordinate; used for both the colour and the bump map. */
const HEIGHT: Record<TexturePattern, (u: number, v: number) => number> = {
  checker: (u, v) => (Math.floor(u * 8) + Math.floor(v * 8)) % 2,
  stripes: (u) => Math.floor(u * 8) % 2,
  ridges: (u) => 0.5 + 0.5 * Math.sin(u * TAU * 12),
  dots: (u, v) => (Math.hypot((u * 8) % 1 - 0.5, (v * 8) % 1 - 0.5) < 0.32 ? 1 : 0),
  grid: (u, v) => ((u * 8) % 1 < 0.08 || (v * 8) % 1 < 0.08 ? 0 : 1),
  bricks: (u, v) => {
    const row = Math.floor(v * 8)
    const x = (u * 4 + (row % 2) * 0.5) % 1
    const mortar = x < 0.05 || (v * 8) % 1 < 0.08
    return mortar ? 0 : 0.7 + 0.3 * hash(Math.floor(u * 4 + (row % 2) * 0.5), row)
  },
  noise: (u, v) => fbm(u, v, 4),
  wood: (u, v) => 0.5 + 0.5 * Math.sin((v * 14 + fbm(u, v, 3) * 5) * TAU * 0.5),
  // Dense short strands: fine streaks broken up by noise, for a coat's surface relief.
  fur: (u, v) => 0.5 * fbm(u * 6, v * 90, 2) + 0.5 * hash(Math.floor(u * 256), Math.floor(v * 256)),
  pores: (u, v) => 0.6 * hash(Math.floor(u * 200), Math.floor(v * 200)) + 0.4 * fbm(u, v, 24),
  hide: (u, v) => 0.65 * fbm(u, v, 6) + 0.35 * fbm(u + 3.1, v + 1.7, 40),
  waves: (u, v) => 0.5 + 0.5 * Math.sin(u * TAU * 6 + Math.sin(v * TAU * 3) * 2),
  weave: (u, v) => {
    const a = 0.5 + 0.5 * Math.sin(u * TAU * 8), b = 0.5 + 0.5 * Math.sin(v * TAU * 8)
    return (Math.floor(u * 8) + Math.floor(v * 8)) % 2 ? a : b
  },
}

type MapKind = 'color' | 'height'
const cache = new Map<string, THREE.CanvasTexture>()

function patternTexture(pattern: TexturePattern, kind: MapKind) {
  const key = `${pattern}:${kind}`
  let tex = cache.get(key)
  if (tex) return tex
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(SIZE, SIZE)
  const fn = HEIGHT[pattern]
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const h = fn(x / SIZE, y / SIZE)
      // The colour map only darkens the base colour, so the material colour still shows through.
      const g = Math.round((kind === 'height' ? h : 0.35 + 0.65 * h) * 255)
      const i = (y * SIZE + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  tex = new THREE.CanvasTexture(canvas)
  if (kind === 'color') tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}

const imageCache = new Map<string, Promise<THREE.Texture | null>>()
function imageTexture(src: string) {
  if (!imageCache.has(src)) {
    imageCache.set(src, resolveFile(src).then((url) => new THREE.TextureLoader().loadAsync(url)).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      return t
    }, (e) => {
      console.warn('[S3D] texture failed to load:', e)
      return null
    }))
  }
  return imageCache.get(src)!
}

/** A per-material copy of a shared texture, so each material can tile it differently. Disposed with the material. */
function tile(source: THREE.Texture, scale: number) {
  const t = source.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(scale, scale)
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** Adds the colour texture and bump (ridges) to a material from its `pattern`, `image`, `patternScale` and `bump` fields. */
export function applyTextures(mat: THREE.MeshPhysicalMaterial, v: Pick<Material3D, 'pattern' | 'image' | 'patternScale' | 'bump' | 'normalImage' | 'roughnessImage' | 'aoImage' | 'normalScale'>) {
  if (typeof document === 'undefined') return
  const scale = v.patternScale ?? 1
  const bump = v.bump ?? 0
  // Extra maps are plain data (not colour), so they stay in linear space.
  const data = (src: string | undefined, apply: (t: THREE.Texture) => void) => {
    if (src) void imageTexture(src).then((t) => {
      if (!t) return
      const c = tile(t, scale)
      c.colorSpace = THREE.NoColorSpace
      apply(c)
      mat.needsUpdate = true
    })
  }
  data(v.normalImage, (t) => { mat.normalMap = t; mat.normalScale.set(v.normalScale ?? 1, v.normalScale ?? 1) })
  data(v.roughnessImage, (t) => { mat.roughnessMap = t })
  data(v.aoImage, (t) => { mat.aoMap = t })
  if (v.pattern && v.pattern in HEIGHT) {
    mat.map = tile(patternTexture(v.pattern, 'color'), scale)
    if (bump > 0) {
      mat.bumpMap = tile(patternTexture(v.pattern, 'height'), scale)
      mat.bumpScale = bump * 4
    }
  } else if (v.image) {
    void imageTexture(v.image).then((t) => {
      if (!t) return
      mat.map = tile(t, scale)
      if (bump > 0) {
        mat.bumpMap = mat.map
        mat.bumpScale = bump * 4
      }
      mat.needsUpdate = true
    })
  }
}

/** Frees the per-material texture copies (the shared sources stay cached). */
export function disposeTextures(mat: THREE.Material) {
  const m = mat as THREE.MeshPhysicalMaterial
  m.map?.dispose()
  if (m.bumpMap !== m.map) m.bumpMap?.dispose()
  m.normalMap?.dispose()
  m.roughnessMap?.dispose()
  m.aoMap?.dispose()
}
