import type { Scene3D } from '../types'

/** One saved picture of a scene from a named viewpoint, kept so a later picture from the same spot can be compared with it. */
export interface Snapshot {
  image: string
  camera: Scene3D['camera']
  time: number
}

const saved = new Map<string, Snapshot>()
const keyOf = (sceneId: string, label: string) => `${sceneId}:${label.trim().toLowerCase()}`

export const getSnapshot = (sceneId: string, label: string) => saved.get(keyOf(sceneId, label))
export const setSnapshot = (sceneId: string, label: string, snap: Snapshot) => void saved.set(keyOf(sceneId, label), snap)
export const clearSnapshot = (sceneId: string, label: string) => void saved.delete(keyOf(sceneId, label))

function load(base64: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the snapshot'))
    img.src = `data:image/png;base64,${base64}`
  })
}

/**
 * Puts two pictures of the same view side by side with a third that marks what changed in red. Also reports how much of
 * the picture changed and where, as fractions of the width and height, so a model can tell a small tweak from a rebuild.
 */
export async function compareImages(before: string, after: string) {
  const [a, b] = await Promise.all([load(before), load(after)])
  const w = b.width,
    h = b.height
  const read = (img: HTMLImageElement) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0, w, h)
    return g.getImageData(0, 0, w, h)
  }
  const da = read(a),
    db = read(b)
  const diff = new ImageData(w, h)
  let changed = 0
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const d = Math.abs(da.data[o] - db.data[o]) + Math.abs(da.data[o + 1] - db.data[o + 1]) + Math.abs(da.data[o + 2] - db.data[o + 2])
    const hit = d > 48
    // Unchanged pixels stay as a faded copy of the new picture, so the red marks keep their context.
    diff.data[o] = hit ? 239 : 255 - (255 - db.data[o]) * 0.35
    diff.data[o + 1] = hit ? 68 : 255 - (255 - db.data[o + 1]) * 0.35
    diff.data[o + 2] = hit ? 68 : 255 - (255 - db.data[o + 2]) * 0.35
    diff.data[o + 3] = 255
    if (hit) {
      changed++
      const x = i % w,
        y = (i / w) | 0
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const percent = Math.round((changed / (w * h)) * 1000) / 10
  const sheet = document.createElement('canvas')
  sheet.width = w * 3
  sheet.height = h
  const g = sheet.getContext('2d')!
  g.drawImage(a, 0, 0, w, h)
  g.drawImage(b, w, 0)
  g.putImageData(diff, w * 2, 0)
  g.font = '600 16px system-ui, sans-serif'
  ;['before', 'after', `changes ${percent}%`].forEach((text, i) => {
    g.fillStyle = '#000a'
    g.fillRect(i * w + 6, 6, 16 + g.measureText(text).width, 24)
    g.fillStyle = '#fff'
    g.fillText(text, i * w + 14, 24)
    if (i) {
      g.strokeStyle = '#0004'
      g.strokeRect(i * w, 0, w, h)
    }
  })
  const url = sheet.toDataURL('image/png')
  const frac = (v: number, n: number) => Math.round((v / n) * 100) / 100
  return {
    image: url.slice(url.indexOf(',') + 1),
    changedPercent: percent,
    changedRegion: changed ? { left: frac(x0, w), top: frac(y0, h), right: frac(x1 + 1, w), bottom: frac(y1 + 1, h) } : null,
  }
}
