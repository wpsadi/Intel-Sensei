import { downloadBlob, fileDataUrl } from '../files'
import { absPos, absRect, shapePath, translatePath, unionRect } from '../model'
import { useS3D } from '../store'
import type { Doc, ExportSetting, Fill, SNode } from '../types'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const PATH_TYPES = ['ellipse', 'polygon', 'star', 'vector']

/** Per-node transform overrides for animation frames. */
export type AnimFrame = Record<string, { dx?: number; dy?: number; scale?: number; rotate?: number; opacity?: number }>

async function videoFrame(src: string) {
  const data = await fileDataUrl(src)
  if (!data) return ''
  return new Promise<string>((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.onloadeddata = () => {
      v.currentTime = 0.01
    }
    v.onseeked = () => {
      const c = document.createElement('canvas')
      c.width = v.videoWidth || 640
      c.height = v.videoHeight || 360
      c.getContext('2d')!.drawImage(v, 0, 0)
      resolve(c.toDataURL('image/jpeg', 0.9))
    }
    v.onerror = () => resolve('')
    v.src = data
  })
}

const dataCache = new Map<string, Promise<string>>()
const mediaData = (src: string, video: boolean) => {
  const key = `${video}:${src}`
  if (!dataCache.has(key)) dataCache.set(key, video ? videoFrame(src) : fileDataUrl(src))
  return dataCache.get(key)!
}

function threeSnapshot(id: string) {
  const canvas = document.querySelector<HTMLCanvasElement>(`[data-node-id="${id}"] canvas`)
  try {
    return canvas?.toDataURL('image/png') ?? ''
  } catch {
    return ''
  }
}

class Builder {
  defs: string[] = []
  n = 0
  doc: Doc
  anim: AnimFrame
  constructor(doc: Doc, anim: AnimFrame = {}) {
    this.doc = doc
    this.anim = anim
  }
  id(p: string) {
    return `${p}${++this.n}`
  }

  async paint(f: Fill, n: SNode, d: string): Promise<string> {
    if (f.kind === 'solid') return `<path d="${d}" fill="${f.color}" fill-opacity="${f.opacity}"/>`
    if (f.kind === 'linear' || f.kind === 'radial') {
      const gid = this.id('g')
      const stops = f.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('')
      this.defs.push(
        f.kind === 'linear'
          ? `<linearGradient id="${gid}" gradientTransform="rotate(${f.angle - 90} .5 .5)">${stops}</linearGradient>`
          : `<radialGradient id="${gid}">${stops}</radialGradient>`,
      )
      return `<path d="${d}" fill="url(#${gid})" fill-opacity="${f.opacity}"/>`
    }
    if (f.kind === 'image' || f.kind === 'video') {
      const data = await mediaData(f.src, f.kind === 'video')
      if (!data) return ''
      const cid = this.id('c')
      this.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`)
      const par = f.fit === 'cover' ? 'xMidYMid slice' : f.fit === 'contain' ? 'xMidYMid meet' : 'none'
      return `<image href="${data}" width="${n.w}" height="${n.h}" preserveAspectRatio="${par}" opacity="${f.opacity}" clip-path="url(#${cid})"/>`
    }
    if (f.kind !== 'frame') return ''
    const frame = this.doc.nodes[f.frameId]
    if (!frame) return ''
    const inner = await this.node({ ...frame, x: 0, y: 0, rotation: 0 })
    const cid = this.id('c')
    this.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`)
    return `<g clip-path="url(#${cid})" opacity="${f.opacity}"><g transform="scale(${n.w / frame.w} ${n.h / frame.h})">${inner}</g></g>`
  }

  strokes(n: SNode, d: string) {
    return n.strokes
      .filter((s) => s.visible)
      .map((s) => {
        const dash = s.dash ? ` stroke-dasharray="${s.dash} ${s.dash}"` : ''
        const base = `fill="none" stroke="${s.color}" stroke-opacity="${s.opacity}" stroke-linejoin="round"${dash}`
        if (s.align === 'center') return `<path d="${d}" ${base} stroke-width="${s.width}"/>`
        const cid = this.id('c')
        if (s.align === 'inside') {
          this.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`)
          return `<path d="${d}" ${base} stroke-width="${s.width * 2}" clip-path="url(#${cid})"/>`
        }
        this.defs.push(
          `<mask id="${cid}"><rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/><path d="${d}" fill="black"/></mask>`,
        )
        return `<path d="${d}" ${base} stroke-width="${s.width * 2}" mask="url(#${cid})"/>`
      })
      .join('')
  }

  filter(n: SNode) {
    const parts: string[] = []
    for (const e of n.effects) {
      if (!e.visible) continue
      if (e.kind === 'drop-shadow')
        parts.push(`<feDropShadow dx="${e.x}" dy="${e.y}" stdDeviation="${e.blur / 2}" flood-color="${e.color}"/>`)
      if (e.kind === 'layer-blur') parts.push(`<feGaussianBlur stdDeviation="${e.radius / 2}"/>`)
    }
    if (!parts.length) return ''
    const fid = this.id('f')
    this.defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%">${parts.join('')}</filter>`)
    return ` filter="url(#${fid})"`
  }

  text(n: SNode) {
    const t = n.text!
    const fill = n.fills.find((f) => f.visible)
    const color =
      fill?.kind === 'solid'
        ? fill.color
        : fill && (fill.kind === 'linear' || fill.kind === 'radial')
          ? (fill.stops[0]?.color ?? '#000')
          : '#000'
    let content = t.content
    if (t.transform === 'uppercase') content = content.toUpperCase()
    if (t.transform === 'lowercase') content = content.toLowerCase()
    const lines = content.split('\n')
    const lh = t.fontSize * t.lineHeight
    const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'
    const x = t.align === 'center' ? n.w / 2 : t.align === 'right' ? n.w : 0
    const total = lines.length * lh
    const y0 = t.verticalAlign === 'middle' ? (n.h - total) / 2 : t.verticalAlign === 'bottom' ? n.h - total : 0
    const deco = [t.underline && 'underline', t.strike && 'line-through'].filter(Boolean).join(' ')
    const tspans = lines.map((l, i) => `<tspan x="${x}" y="${y0 + i * lh + lh / 2 + t.fontSize * 0.35}">${esc(l) || ' '}</tspan>`).join('')
    return `<text font-family="${esc(t.fontFamily)}, sans-serif" font-size="${t.fontSize}" font-weight="${t.fontWeight}"${t.italic ? ' font-style="italic"' : ''} letter-spacing="${t.letterSpacing}" text-anchor="${anchor}" fill="${color}" fill-opacity="${fill?.opacity ?? 1}"${deco ? ` text-decoration="${deco}"` : ''}>${tspans}</text>`
  }

  async boolean(n: SNode) {
    const kids = n.children.map((c) => this.doc.nodes[c]).filter((k) => k && k.visible)
    const fill = n.fills.find((f) => f.visible) ?? kids[0]?.fills.find((f) => f.visible)
    const color = fill?.kind === 'solid' ? fill.color : '#d9d9d9'
    const op = fill?.opacity ?? 1
    const paths = kids.map((k) => translatePath(shapePath(k), k.x, k.y))
    const [first, ...rest] = paths
    if (!first) return ''
    const shape = (d: string) => `<path d="${d}"/>`
    if (n.booleanOp === 'union') return `<g fill="${color}" fill-opacity="${op}">${paths.map(shape).join('')}</g>`
    if (n.booleanOp === 'exclude') return `<path fill-rule="evenodd" d="${paths.join(' ')}" fill="${color}" fill-opacity="${op}"/>`
    if (n.booleanOp === 'subtract') {
      const mid = this.id('m')
      this.defs.push(
        `<mask id="${mid}"><rect x="-10000" y="-10000" width="20000" height="20000" fill="white"/><g fill="black">${rest.map(shape).join('')}</g></mask>`,
      )
      return `<path d="${first}" fill="${color}" fill-opacity="${op}" mask="url(#${mid})"/>`
    }
    let out = `<path d="${first}" fill="${color}" fill-opacity="${op}"/>`
    for (const d of rest) {
      const cid = this.id('c')
      this.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`)
      out = `<g clip-path="url(#${cid})">${out}</g>`
    }
    return out
  }

  /** One node in its parent's coordinate space. */
  async node(n: SNode): Promise<string> {
    if (!n.visible || n.type === 'comment') return ''
    const a = this.anim[n.id] ?? {}
    const cx = n.w / 2
    const cy = n.h / 2
    const tr = [`translate(${n.x + (a.dx ?? 0)} ${n.y + (a.dy ?? 0)})`]
    const rot = n.rotation + (a.rotate ?? 0)
    if (rot) tr.push(`rotate(${rot} ${cx} ${cy})`)
    if (a.scale && a.scale !== 1) tr.push(`translate(${cx} ${cy}) scale(${a.scale}) translate(${-cx} ${-cy})`)
    const opacity = n.opacity * (a.opacity ?? 1)
    const d = shapePath(n)
    let body = ''
    if (n.type === 'boolean') body = await this.boolean(n)
    else if (n.type !== 'group') for (const f of n.fills) if (f.visible && n.type !== 'text') body += await this.paint(f, n, d)
    if (n.type === 'text' && n.text) body += this.text(n)
    if (n.type === 'image' || n.type === 'video') {
      const data = n.src ? await mediaData(n.src, n.type === 'video') : ''
      const cid = this.id('c')
      this.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`)
      if (data)
        body += `<image href="${data}" width="${n.w}" height="${n.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`
    }
    if (n.type === 'shape3d' || n.type === 'model3d') {
      const data = threeSnapshot(n.id)
      body += data
        ? `<image href="${data}" width="${n.w}" height="${n.h}"/>`
        : `<rect width="${n.w}" height="${n.h}" fill="${n.modelColor}" fill-opacity=".25" rx="8"/>`
    }
    if (n.type !== 'boolean' && n.type !== 'group' && n.type !== 'text') body += this.strokes(n, d)
    if (['frame', 'section', 'group'].includes(n.type) && n.children.length) {
      let kids = n.children
      let clip = ''
      if (n.type === 'group' && n.mask && kids.length > 1) {
        const m = this.doc.nodes[kids[0]]
        const cid = this.id('c')
        if (m) this.defs.push(`<clipPath id="${cid}"><path d="${translatePath(shapePath(m), m.x, m.y)}"/></clipPath>`)
        clip = ` clip-path="url(#${cid})"`
        kids = kids.slice(1)
      } else if (n.clip && n.type !== 'group') {
        const cid = this.id('c')
        this.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`)
        clip = ` clip-path="url(#${cid})"`
      }
      let inner = ''
      for (const c of kids) if (this.doc.nodes[c]) inner += await this.node(this.doc.nodes[c])
      body += `<g${clip}>${inner}</g>`
    }
    void PATH_TYPES
    return `<g transform="${tr.join(' ')}" opacity="${opacity}"${n.blend !== 'normal' ? ` style="mix-blend-mode:${n.blend}"` : ''}${this.filter(n)}>${body}</g>`
  }
}

function targets(nodeIds: string[]) {
  const { doc, pageId } = useS3D.getState()
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
  return nodeIds.length ? nodeIds.filter((id) => doc.nodes[id]) : page.children
}

export async function nodeToSvg(doc: Doc, nodeIds: string[], anim: AnimFrame = {}) {
  const box = unionRect(nodeIds.map((id) => absRect(doc, id))) ?? { x: 0, y: 0, w: 1, h: 1 }
  const b = new Builder(doc, anim)
  let body = ''
  for (const id of nodeIds) {
    const n = doc.nodes[id]
    const pos = absPos(doc, id)
    body += await b.node({ ...n, x: pos.x - box.x, y: pos.y - box.y })
  }
  const w = Math.max(1, Math.ceil(box.w))
  const h = Math.max(1, Math.ceil(box.h))
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${b.defs.join('')}</defs>${body}</svg>`,
    w,
    h,
  }
}

export async function exportSvgString(nodeIds: string[]) {
  return (await nodeToSvg(useS3D.getState().doc, targets(nodeIds))).svg
}

export function svgToImage(svg: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not rasterize SVG'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

async function rasterCanvas(nodeIds: string[], scale: number, background?: string) {
  const { svg, w, h } = await nodeToSvg(useS3D.getState().doc, targets(nodeIds))
  const img = await svgToImage(svg)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * scale))
  c.height = Math.max(1, Math.round(h * scale))
  const ctx = c.getContext('2d')!
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return { canvas: c, w, h }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, q))

export async function renderPng(nodeIds: string[], scale = 1, type: 'image/png' | 'image/jpeg' = 'image/png') {
  const { canvas } = await rasterCanvas(nodeIds, scale, type === 'image/jpeg' ? '#ffffff' : undefined)
  return toBlob(canvas, type, 0.92)
}

/** Minimal PDF writer: one page per node, each a full-page JPEG image. */
export async function renderPdf(nodeIds: string[], scale = 2) {
  const ids = targets(nodeIds)
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(bytes)
    length += bytes.length
  }
  const obj = (num: number, body: () => void) => {
    offsets[num] = length
    push(`${num} 0 obj\n`)
    body()
    push('\nendobj\n')
  }
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const pages = await Promise.all(
    ids.map(async (id) => {
      const { canvas, w, h } = await rasterCanvas([id], scale, '#ffffff')
      const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer())
      return { jpeg, w, h, pw: canvas.width, ph: canvas.height }
    }),
  )
  // Objects: 1 catalog, 2 pages, then per page: page, content, image.
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`))
  pages.forEach((p, i) => {
    const pn = 3 + i * 3
    obj(pn, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /XObject << /Im${i} ${pn + 2} 0 R >> >> /Contents ${pn + 1} 0 R >>`,
      ),
    )
    const content = `q ${p.w} 0 0 ${p.h} 0 0 cm /Im${i} Do Q`
    obj(pn + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`))
    obj(pn + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${p.pw} /Height ${p.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      )
      push(p.jpeg)
      push('\nendstream')
    })
  })
  const count = 3 + pages.length * 3
  const xref = length
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  push(`${table}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_') || 'export'

export async function exportNodes(nodeIds: string[], settings: ExportSetting[]) {
  const { doc } = useS3D.getState()
  const ids = targets(nodeIds)
  for (const s of settings) {
    if (s.format === 'pdf') {
      const name = ids.length === 1 ? (doc.nodes[ids[0]]?.name ?? doc.name) : doc.name
      downloadBlob(await renderPdf(ids, Math.max(1, s.scale)), `${safe(name)}${s.suffix}.pdf`)
      continue
    }
    for (const id of ids) {
      const name = `${safe(doc.nodes[id]?.name ?? 'export')}${s.suffix}`
      if (s.format === 'svg') downloadBlob(new Blob([await exportSvgString([id])], { type: 'image/svg+xml' }), `${name}.svg`)
      else downloadBlob(await renderPng([id], s.scale, s.format === 'jpg' ? 'image/jpeg' : 'image/png'), `${name}.${s.format}`)
    }
  }
}

/* ---------- video ---------- */

function animAt(doc: Doc, rootId: string, t: number): AnimFrame {
  const out: AnimFrame = {}
  const visit = (id: string) => {
    const n = doc.nodes[id]
    if (!n) return
    for (const i of n.interactions) {
      if (i.trigger !== 'load' || i.action !== 'animate' || !i.animation) continue
      const p = ((t * 1000) % Math.max(1, i.duration)) / Math.max(1, i.duration)
      const wave = Math.sin(p * Math.PI * 2)
      const a = (out[id] ??= {})
      if (i.animation === 'spin') a.rotate = p * 360
      if (i.animation === 'float') a.dy = -6 + Math.cos(p * Math.PI * 2) * -6
      if (i.animation === 'pulse') a.scale = 1 + 0.04 * (1 - Math.cos(p * Math.PI * 2))
      if (i.animation === 'shake') a.dx = wave * 6
      if (i.animation === 'fade-in') a.opacity = Math.min(1, (t * 1000) / Math.max(1, i.duration))
    }
    n.children.forEach(visit)
  }
  visit(rootId)
  return out
}

export async function exportVideo(opts: {
  nodeId: string
  duration: number
  fps: number
  width: number
  height: number
  onProgress?: (p: number) => void
  signal?: AbortSignal
}) {
  const { doc } = useS3D.getState()
  const node = doc.nodes[opts.nodeId]
  if (!node) throw new Error('Nothing to export')
  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height
  const ctx = canvas.getContext('2d')!
  const animated = Object.keys(animAt(doc, opts.nodeId, 0)).length > 0
  const pos = absPos(doc, opts.nodeId)
  const root = { ...doc, nodes: { ...doc.nodes, [opts.nodeId]: { ...node, ...pos, parentId: '' } } }
  const draw = async (t: number, cached?: HTMLImageElement) => {
    const img = cached ?? (await svgToImage((await nodeToSvg(root, [opts.nodeId], animAt(doc, opts.nodeId, t))).svg))
    const s = Math.min(opts.width / img.width, opts.height / img.height)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, opts.width, opts.height)
    ctx.drawImage(img, (opts.width - img.width * s) / 2, (opts.height - img.height * s) / 2, img.width * s, img.height * s)
    return img
  }
  const still = animated ? undefined : await draw(0)
  const mime =
    ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
  const stream = canvas.captureStream(opts.fps)
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined)
  const parts: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()))
  await draw(0, still)
  rec.start(250)
  const total = Math.round(opts.duration * opts.fps)
  const start = performance.now()
  for (let f = 0; f < total; f++) {
    if (opts.signal?.aborted) break
    await draw(f / opts.fps, still)
    opts.onProgress?.((f + 1) / total)
    const wait = start + ((f + 1) * 1000) / opts.fps - performance.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  }
  rec.stop()
  await done
  stream.getTracks().forEach((t) => t.stop())
  if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  return new Blob(parts, { type: mime.split(';')[0] || 'video/webm' })
}
