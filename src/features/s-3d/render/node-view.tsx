import { Suspense, createContext, lazy, memo, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Doc, Fill, ImageAdjust, SNode } from '../types'
import { shapePath, translatePath } from '../model'
import { useFileUrl } from './use-file-url'

const ThreeView = lazy(() => import('./three-view'))

export interface RenderCtx {
  doc: Doc
  play: boolean
  editingTextId?: string | null
  /** Play mode: node id -> active state id. */
  states?: Record<string, string>
  /** Play mode: node id -> running animation name. */
  anims?: Record<string, string>
  hidden?: Record<string, boolean>
  onTrigger?: (node: SNode, trigger: 'click' | 'hover') => void
  onTextCommit?: (id: string, content: string) => void
  onTextMeasure?: (id: string, w: number, h: number) => void
}

export const RenderContext = createContext<RenderCtx>({ doc: { id: '', name: '', pages: [], nodes: {}, createdAt: 0, updatedAt: 0 }, play: false })

export const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = parseInt(full || '0', 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function gradientCss(f: Extract<Fill, { kind: 'linear' | 'radial' }>) {
  const stops = f.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')
  return f.kind === 'linear' ? `linear-gradient(${f.angle}deg, ${stops})` : `radial-gradient(circle, ${stops})`
}

function FillLayer({ fill }: { fill: Fill }) {
  const url = useFileUrl(fill.kind === 'image' || fill.kind === 'video' ? fill.src : '')
  const { doc } = useContext(RenderContext)
  const base: CSSProperties = { position: 'absolute', inset: 0, opacity: fill.opacity }
  if (fill.kind === 'solid') return <div style={{ ...base, background: fill.color }} />
  if (fill.kind === 'linear' || fill.kind === 'radial') return <div style={{ ...base, background: gradientCss(fill) }} />
  if (fill.kind === 'image') return url ? <img src={url} alt="" draggable={false} style={{ ...base, width: '100%', height: '100%', objectFit: fill.fit }} /> : null
  if (fill.kind === 'video') return url ? <video src={url} autoPlay muted loop playsInline style={{ ...base, width: '100%', height: '100%', objectFit: fill.fit }} /> : null
  if (fill.kind !== 'frame') return null
  // Frame fill: paint the referenced frame scaled into this box.
  const frame = doc.nodes[fill.frameId]
  if (!frame) return null
  return (
    <div style={{ ...base, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: frame.w, height: frame.h, transformOrigin: '0 0', pointerEvents: 'none' }} ref={(el) => {
        const parent = el?.parentElement
        if (el && parent) el.style.transform = `scale(${parent.clientWidth / frame.w}, ${parent.clientHeight / frame.h})`
      }}>
        <NodeView id={frame.id} asFill />
      </div>
    </div>
  )
}

const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`

const isPathShape = (n: SNode) => ['ellipse', 'polygon', 'star', 'vector'].includes(n.type)

export function effectStyles(n: SNode) {
  const filters: string[] = []
  const shadows: string[] = []
  let backdrop = ''
  let transform = ''
  for (const e of n.effects) {
    if (!e.visible) continue
    if (e.kind === 'drop-shadow') {
      if (isPathShape(n) || n.type === 'text' || n.type === 'boolean') filters.push(`drop-shadow(${e.x}px ${e.y}px ${e.blur / 2}px ${e.color})`)
      else shadows.push(`${e.x}px ${e.y}px ${e.blur}px ${e.spread}px ${e.color}`)
    } else if (e.kind === 'inner-shadow') shadows.push(`inset ${e.x}px ${e.y}px ${e.blur}px ${e.spread}px ${e.color}`)
    else if (e.kind === 'layer-blur') filters.push(`blur(${e.radius}px)`)
    else if (e.kind === 'background-blur') backdrop += ` blur(${e.radius}px)`
    else if (e.kind === 'glass') backdrop += ` blur(${e.blur}px) saturate(160%)`
    else if (e.kind === 'projection') transform = `perspective(${e.perspective}px) rotateX(${e.rotateX}deg) rotateY(${e.rotateY}deg)`
  }
  return { filter: filters.join(' ') || undefined, boxShadow: shadows.join(', ') || undefined, backdropFilter: backdrop.trim() || undefined, projection: transform }
}

function strokeShadows(n: SNode) {
  return n.strokes.filter((s) => s.visible && !s.dash).map((s) => {
    const c = hexA(s.color, s.opacity)
    if (s.align === 'inside') return `inset 0 0 0 ${s.width}px ${c}`
    if (s.align === 'outside') return `0 0 0 ${s.width}px ${c}`
    return `inset 0 0 0 ${s.width / 2}px ${c}, 0 0 0 ${s.width / 2}px ${c}`
  })
}

function PathStrokes({ n, d }: { n: SNode; d: string }) {
  const strokes = n.strokes.filter((s) => s.visible)
  if (!strokes.length) return null
  const clipId = `clip-${n.id}`
  return (
    <svg width={n.w} height={n.h} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <defs><clipPath id={clipId}><path d={d} /></clipPath></defs>
      {strokes.map((s) => (
        <path key={s.id} d={d} fill="none" stroke={s.color} strokeOpacity={s.opacity} strokeLinejoin="round" strokeLinecap="round"
          strokeWidth={s.align === 'center' ? s.width : s.width * 2} strokeDasharray={s.dash ? `${s.dash} ${s.dash}` : undefined}
          clipPath={s.align === 'inside' ? `url(#${clipId})` : undefined} />
      ))}
    </svg>
  )
}

function BooleanShape({ n }: { n: SNode }) {
  const { doc } = useContext(RenderContext)
  const kids = n.children.map((c) => doc.nodes[c]).filter((k) => k && k.visible)
  const paths = kids.map((k) => translatePath(shapePath(k.type === 'vector' ? k : { ...k }), 0, 0)).map((p, i) => ({ d: p, x: kids[i].x, y: kids[i].y }))
  const fill = n.fills.find((f) => f.visible) ?? kids[0]?.fills.find((f) => f.visible)
  const gid = `g-${n.id}`
  const paint = !fill ? '#d9d9d9' : fill.kind === 'solid' ? fill.color : fill.kind === 'linear' || fill.kind === 'radial' ? `url(#${gid})` : '#d9d9d9'
  const opacity = fill?.opacity ?? 1
  const shapes = (ps: typeof paths) => ps.map((p, i) => <path key={i} d={p.d} transform={`translate(${p.x} ${p.y})`} />)
  const [first, ...rest] = paths
  return (
    <svg width={n.w} height={n.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <defs>
        {fill && (fill.kind === 'linear' || fill.kind === 'radial') && (
          <linearGradient id={gid} gradientTransform={`rotate(${fill.angle - 90} .5 .5)`}>
            {fill.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
          </linearGradient>
        )}
        <mask id={`m-${n.id}`}><rect x={-1e4} y={-1e4} width={2e4} height={2e4} fill="white" /><g fill="black">{shapes(rest)}</g></mask>
        {rest.map((_, i) => <clipPath key={i} id={`c-${n.id}-${i}`} clipPath={i ? `url(#c-${n.id}-${i - 1})` : undefined}>{shapes([rest[i]])}</clipPath>)}
      </defs>
      <g fill={paint} fillOpacity={opacity}>
        {n.booleanOp === 'union' && shapes(paths)}
        {n.booleanOp === 'exclude' && <path fillRule="evenodd" d={paths.map((p) => translatePath(p.d, p.x, p.y)).join(' ')} />}
        {n.booleanOp === 'subtract' && first && <g mask={`url(#m-${n.id})`}>{shapes([first])}</g>}
        {n.booleanOp === 'intersect' && first && <g clipPath={rest.length ? `url(#c-${n.id}-${rest.length - 1})` : undefined}>{shapes([first])}</g>}
      </g>
    </svg>
  )
}

function TextContent({ n }: { n: SNode }) {
  const ctx = useContext(RenderContext)
  const t = n.text!
  const editing = ctx.editingTextId === n.id
  const ref = useRef<HTMLDivElement>(null)
  const fill = n.fills.find((f) => f.visible)
  const colorStyle: CSSProperties = !fill ? { color: 'transparent' }
    : fill.kind === 'solid' ? { color: hexA(fill.color, fill.opacity) }
      : fill.kind === 'linear' || fill.kind === 'radial' ? { backgroundImage: gradientCss(fill), WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : {}

  useEffect(() => {
    const el = ref.current
    if (!editing || !el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
  }, [editing])

  // Auto-sized text reports its measured box so selection handles match.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || ctx.play || !ctx.onTextMeasure || t.autoSize === 'fixed') return
    const ro = new ResizeObserver(() => {
      const w = Math.ceil(el.scrollWidth)
      const h = Math.ceil(el.scrollHeight)
      if ((t.autoSize === 'width' && Math.abs(w - n.w) > 0.5) || Math.abs(h - n.h) > 0.5) ctx.onTextMeasure?.(n.id, t.autoSize === 'width' ? w : n.w, h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ctx, n.id, n.w, n.h, t.autoSize])

  const style: CSSProperties = {
    position: t.autoSize === 'width' ? 'absolute' : 'relative',
    width: t.autoSize === 'width' ? 'max-content' : '100%',
    minHeight: t.autoSize === 'fixed' ? '100%' : undefined,
    fontFamily: t.fontFamily, fontSize: t.fontSize, fontWeight: t.fontWeight, fontStyle: t.italic ? 'italic' : undefined,
    textDecoration: [t.underline && 'underline', t.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
    lineHeight: t.lineHeight, letterSpacing: `${t.letterSpacing}px`, textAlign: t.align, textTransform: t.transform, writingMode: t.vertical ? 'vertical-rl' : undefined,
    whiteSpace: t.autoSize === 'width' ? 'pre' : 'pre-wrap', wordBreak: 'break-word', outline: 'none',
    display: 'flex', flexDirection: 'column', justifyContent: t.verticalAlign === 'middle' ? 'center' : t.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
    cursor: editing ? 'text' : undefined, userSelect: editing ? 'text' : 'none', ...colorStyle,
  }
  return (
    <div
      ref={ref}
      style={style}
      contentEditable={editing}
      suppressContentEditableWarning
      onBlur={(e) => editing && ctx.onTextCommit?.(n.id, e.currentTarget.innerText)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
    >
      {t.content}
    </div>
  )
}

/** CSS filter string for an image adjustment; undefined when neutral. */
export function adjustFilter(a?: ImageAdjust) {
  if (!a) return undefined
  const f: string[] = []
  if (a.brightness) f.push(`brightness(${1 + a.brightness / 100})`)
  if (a.contrast) f.push(`contrast(${1 + a.contrast / 100})`)
  if (a.saturation) f.push(`saturate(${1 + a.saturation / 100})`)
  if (a.temperature) f.push(`sepia(${Math.abs(a.temperature) / 250}) hue-rotate(${a.temperature > 0 ? -10 : 170}deg)`)
  if (a.hue) f.push(`hue-rotate(${a.hue}deg)`)
  if (a.grayscale) f.push(`grayscale(${a.grayscale / 100})`)
  if (a.sepia) f.push(`sepia(${a.sepia / 100})`)
  if (a.invert) f.push('invert(1)')
  if (a.blur) f.push(`blur(${a.blur}px)`)
  return f.join(' ') || undefined
}

function MediaContent({ n }: { n: SNode }) {
  const url = useFileUrl(n.src)
  const maskUrl = useFileUrl(n.layerMask ?? '')
  if (!url) return <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, color: '#888', background: '#eee' }}>{n.type}</div>
  // The layer mask's alpha decides what shows; it is stretched to the node like the image itself.
  const mask = maskUrl ? { maskImage: `url("${maskUrl}")`, maskSize: '100% 100%', WebkitMaskImage: `url("${maskUrl}")`, WebkitMaskSize: '100% 100%' } : undefined
  return n.type === 'image'
    ? <img src={url} alt={n.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: adjustFilter(n.adjust), ...mask }} />
    : <video src={url} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: adjustFilter(n.adjust) }} />
}

const ANIMATIONS = `
@keyframes s3d-spin { to { transform: rotate(360deg) } }
@keyframes s3d-float { 0%,100% { translate: 0 0 } 50% { translate: 0 -12px } }
@keyframes s3d-pulse { 0%,100% { scale: 1 } 50% { scale: 1.08 } }
@keyframes s3d-shake { 0%,100% { translate: 0 } 25% { translate: -6px } 75% { translate: 6px } }
@keyframes s3d-fade-in { from { opacity: 0 } to { opacity: 1 } }
`
export const AnimationStyles = () => <style>{ANIMATIONS}</style>

/** Renders one node and its subtree, absolutely positioned inside its parent. */
export const NodeView = memo(function NodeView({ id, asFill }: { id: string; asFill?: boolean }) {
  const ctx = useContext(RenderContext)
  let n = ctx.doc.nodes[id]
  if (!n) return null
  if (ctx.play && ctx.states?.[id]) {
    const st = n.states.find((s) => s.id === ctx.states![id])
    if (st) n = { ...n, ...st.overrides }
  }
  const hidden = ctx.hidden?.[id] ?? !n.visible
  if (hidden) return null
  if (n.type === 'comment' && ctx.play) return null

  const fx = effectStyles(n)
  const pathShape = isPathShape(n)
  const d = pathShape ? shapePath(n) : ''
  const radius = n.radius.map((r) => `${r}px`).join(' ')
  const container = n.type === 'frame' || n.type === 'section' || n.type === 'group'
  const anim = ctx.anims?.[id]
  const animDef = anim ? n.interactions.find((i) => i.animation === anim) : undefined
  const glass = n.effects.find((e) => e.kind === 'glass' && e.visible) as Extract<SNode['effects'][number], { kind: 'glass' }> | undefined
  const noise = n.effects.find((e) => e.kind === 'noise' && e.visible) as Extract<SNode['effects'][number], { kind: 'noise' }> | undefined
  const hasClick = ctx.play && n.interactions.some((i) => i.trigger === 'click')

  const wrapper: CSSProperties = {
    position: 'absolute', left: asFill ? 0 : n.x, top: asFill ? 0 : n.y, width: n.w, height: n.h,
    transform: [n.rotation && !asFill ? `rotate(${n.rotation}deg)` : '', fx.projection].filter(Boolean).join(' ') || undefined,
    opacity: n.opacity, mixBlendMode: n.blend as CSSProperties['mixBlendMode'], filter: fx.filter,
    animation: anim && animDef ? `s3d-${anim} ${animDef.duration}ms ${animDef.easing === 'spring' ? 'cubic-bezier(.34,1.56,.64,1)' : animDef.easing} ${anim === 'fade-in' ? '1 both' : 'infinite'}` : undefined,
    cursor: hasClick ? 'pointer' : undefined,
  }
  const paint: CSSProperties = {
    position: 'absolute', inset: 0, overflow: 'hidden',
    borderRadius: pathShape ? undefined : radius,
    clipPath: pathShape && d ? `path('${d}')` : undefined,
    boxShadow: [...(pathShape ? [] : strokeShadows(n)), ...(fx.boxShadow ? [fx.boxShadow] : [])].join(', ') || undefined,
    backdropFilter: fx.backdropFilter, WebkitBackdropFilter: fx.backdropFilter,
    background: glass ? hexA(glass.tint, 0.18) : undefined,
    border: glass ? '1px solid rgba(255,255,255,.35)' : undefined,
  }
  const dashed = !pathShape && n.strokes.find((s) => s.visible && s.dash)

  let content: ReactNode = null
  let kids = n.children
  let kidsClip: string | undefined
  if (n.type === 'group' && n.mask && kids.length > 1) {
    const m = ctx.doc.nodes[kids[0]]
    if (m) kidsClip = `path('${translatePath(shapePath(m), m.x, m.y)}')`
    kids = kids.slice(1)
  }
  if (n.type === 'text') content = <TextContent n={n} />
  else if (n.type === 'image' || n.type === 'video') content = <MediaContent n={n} />
  else if (n.type === 'shape3d' || n.type === 'model3d')
    content = (
      <Suspense fallback={null}>
        <ThreeView kind={n.shape3d} color={n.modelColor} src={n.type === 'model3d' ? n.src : undefined} interactive={ctx.play} spin={ctx.play && n.interactions.some((i) => i.animation === 'spin' && i.trigger === 'load')} rotation={0} scene={n.type === 'shape3d' ? n.scene : undefined} />
      </Suspense>
    )
  else if (n.type === 'boolean') content = <BooleanShape n={n} />
  else if (n.type === 'comment')
    content = <div style={{ width: 28, height: 28, borderRadius: '14px 14px 14px 2px', background: n.resolved ? '#a3a3a3' : '#6366f1', color: 'white', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>{(n.author ?? '?')[0]}</div>

  return (
    <div
      data-node-id={asFill ? undefined : id}
      style={wrapper}
      onClick={ctx.play ? (e) => { e.stopPropagation(); ctx.onTrigger?.(n, 'click') } : undefined}
      onMouseEnter={ctx.play ? () => ctx.onTrigger?.(n, 'hover') : undefined}
    >
      {n.type !== 'boolean' && n.type !== 'comment' && (
        <div style={paint}>
          {n.fills.filter((f) => f.visible && n.type !== 'text').map((f) => <FillLayer key={f.id} fill={f} />)}
          {noise && <div style={{ position: 'absolute', inset: 0, backgroundImage: NOISE, opacity: noise.amount, mixBlendMode: 'overlay' }} />}
        </div>
      )}
      {dashed && <div style={{ position: 'absolute', inset: 0, borderRadius: radius, outline: `${dashed.width}px dashed ${hexA(dashed.color, dashed.opacity)}`, outlineOffset: dashed.align === 'inside' ? -dashed.width : dashed.align === 'center' ? -dashed.width / 2 : 0, pointerEvents: 'none' }} />}
      {pathShape && <PathStrokes n={n} d={d} />}
      {/* Media and 3D draw edge to edge, so they need the corner radius as a clip too. */}
      {['image', 'video', 'shape3d', 'model3d'].includes(n.type) ? <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: radius }}>{content}</div> : content}
      {container && kids.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, overflow: n.clip ? 'hidden' : 'visible', borderRadius: n.clip ? radius : undefined, clipPath: kidsClip }}>
          {kids.map((c) => <NodeView key={c} id={c} />)}
        </div>
      )}
      {n.type === 'section' && !ctx.play && (
        <div style={{ position: 'absolute', left: 0, top: -22, fontSize: 12, padding: '2px 8px', borderRadius: 6, background: '#e5e5e5', color: '#333', whiteSpace: 'nowrap' }}>{n.name}</div>
      )}
    </div>
  )
})
