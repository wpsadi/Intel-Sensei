import {
  AlignCenterIcon, AlignEndHorizontalIcon, AlignEndVerticalIcon, AlignHorizontalDistributeCenterIcon, AlignHorizontalJustifyCenterIcon,
  AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, AlignStartHorizontalIcon, AlignStartVerticalIcon, AlignVerticalDistributeCenterIcon,
  AlignVerticalJustifyCenterIcon, ArrowDownIcon, ArrowRightIcon, BoldIcon, FlipHorizontal2Icon, FlipVertical2Icon, ItalicIcon, LinkIcon,
  MinusIcon, RotateCcwIcon, ScanIcon, SquaresExcludeIcon, SquaresIntersectIcon, SquaresSubtractIcon, SquaresUniteIcon, StrikethroughIcon,
  UnderlineIcon, UnlinkIcon, UploadIcon, WrapTextIcon,
  Rotate3dIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { pickFiles, storeFile } from '@/features/s-3d/files'
import { openSceneEditor } from '@/features/s-3d/scene-editor/edit'
import { FRAME_PRESETS, descendants } from '@/features/s-3d/model'
import { currentPage, useS3D } from '@/features/s-3d/store'
import type { AutoLayout, ConstraintH, ConstraintV, SNode, Shape3D, Sizing, TextStyle } from '@/features/s-3d/types'
import { Check, ColorField, IconBtn, MIXED, type Maybe, NumberField, Section, Sel, TextField, shared, update } from '@/features/s-3d/inspector/fields'
import { EffectsSection, FillSection, StrokeSection } from './paint-sections'
import { ExportSection } from './export-section'
import { ImageSection } from './image-section'

const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']
const FONTS = ['Inter Variable', 'Roboto Variable', 'system-ui', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'monospace', 'serif', 'sans-serif', 'cursive']

function AlignSection({ nodes }: { nodes: SNode[] }) {
  const { align, group } = useS3D.getState()
  const multi = nodes.length > 1
  return (
    <Section title="Align">
      <div className="flex flex-wrap items-center gap-0.5">
        <IconBtn label="Align left" onClick={() => align('left')}><AlignStartVerticalIcon /></IconBtn>
        <IconBtn label="Align horizontal centers" onClick={() => align('hcenter')}><AlignHorizontalJustifyCenterIcon /></IconBtn>
        <IconBtn label="Align right" onClick={() => align('right')}><AlignEndVerticalIcon /></IconBtn>
        <IconBtn label="Align top" onClick={() => align('top')}><AlignStartHorizontalIcon /></IconBtn>
        <IconBtn label="Align vertical centers" onClick={() => align('vcenter')}><AlignVerticalJustifyCenterIcon /></IconBtn>
        <IconBtn label="Align bottom" onClick={() => align('bottom')}><AlignEndHorizontalIcon /></IconBtn>
        {nodes.length > 2 && (
          <>
            <IconBtn label="Distribute horizontally" onClick={() => align('hdistribute')}><AlignHorizontalDistributeCenterIcon /></IconBtn>
            <IconBtn label="Distribute vertically" onClick={() => align('vdistribute')}><AlignVerticalDistributeCenterIcon /></IconBtn>
          </>
        )}
      </div>
      {multi && (
        <div className="flex items-center gap-0.5">
          <IconBtn label="Union" onClick={() => group(undefined, 'boolean', 'union')}><SquaresUniteIcon /></IconBtn>
          <IconBtn label="Subtract" onClick={() => group(undefined, 'boolean', 'subtract')}><SquaresSubtractIcon /></IconBtn>
          <IconBtn label="Intersect" onClick={() => group(undefined, 'boolean', 'intersect')}><SquaresIntersectIcon /></IconBtn>
          <IconBtn label="Exclude" onClick={() => group(undefined, 'boolean', 'exclude')}><SquaresExcludeIcon /></IconBtn>
          <IconBtn label="Use bottom layer as mask" onClick={() => { group(); update(useS3D.getState().selection, { mask: true, name: 'Mask group' }) }}><ScanIcon /></IconBtn>
        </div>
      )}
      {!multi && nodes[0].type === 'group' && <Check label="Mask with first layer" checked={nodes[0].mask} onChange={(mask) => update([nodes[0].id], { mask })} />}
      {!multi && nodes[0].type === 'boolean' && (
        <Sel value={nodes[0].booleanOp} options={['union', 'subtract', 'intersect', 'exclude']} onChange={(booleanOp) => update([nodes[0].id], { booleanOp })} />
      )}
    </Section>
  )
}

/** Sets a dimension on each node, honouring aspect lock. `delta` applies relative changes in multi-select. */
function setSize(nodes: SNode[], key: 'w' | 'h', v: number, delta?: number) {
  update(nodes.map((n) => n.id), (n) => {
    const next = Math.max(1, nodes.length > 1 && delta !== undefined ? n[key] + delta : v)
    if (n.aspectLocked) {
      const ratio = n.w / n.h
      if (key === 'w') n.h = Math.max(1, next / ratio)
      else n.w = Math.max(1, next * ratio)
    }
    n[key] = next
    if (n.text && key === 'w' && n.text.autoSize === 'width') n.text.autoSize = 'height'
    if (n.text && key === 'h') n.text.autoSize = 'fixed'
  })
}

function TransformSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const num = (k: 'x' | 'y' | 'rotation') => (v: number, d?: number) => update(ids, (n) => void (n[k] = nodes.length > 1 && d !== undefined ? n[k] + d : v))
  const locked = shared(nodes, (n) => n.aspectLocked)
  return (
    <Section title="Transform">
      <div className="grid grid-cols-2 gap-1">
        <NumberField label="X" value={shared(nodes, (n) => n.x)} onChange={num('x')} />
        <NumberField label="Y" value={shared(nodes, (n) => n.y)} onChange={num('y')} />
      </div>
      <div className="flex items-center gap-1">
        <NumberField className="flex-1" label="W" value={shared(nodes, (n) => n.w)} min={1} onChange={(v, d) => setSize(nodes, 'w', v, d)} />
        <NumberField className="flex-1" label="H" value={shared(nodes, (n) => n.h)} min={1} onChange={(v, d) => setSize(nodes, 'h', v, d)} />
        <IconBtn label={locked === true ? 'Unlock aspect ratio' : 'Lock aspect ratio'} active={locked === true} onClick={() => update(ids, { aspectLocked: locked !== true })}>
          {locked === true ? <LinkIcon /> : <UnlinkIcon />}
        </IconBtn>
      </div>
      <div className="flex items-center gap-1">
        <NumberField className="flex-1" label="↻" value={shared(nodes, (n) => n.rotation)} suffix="°" onChange={num('rotation')} />
        <IconBtn label="Reset rotation" onClick={() => update(ids, { rotation: 0 })}><RotateCcwIcon /></IconBtn>
        <IconBtn label="Flip horizontal" onClick={() => useS3D.getState().flip('h')}><FlipHorizontal2Icon /></IconBtn>
        <IconBtn label="Flip vertical" onClick={() => useS3D.getState().flip('v')}><FlipVertical2Icon /></IconBtn>
      </div>
    </Section>
  )
}

/** Scales nodes and their subtrees (geometry, radii, strokes, font sizes) by `factor`. */
function scaleNodes(ids: string[], factor: number) {
  useS3D.getState().mutate((d) => {
    const all = new Set<string>()
    for (const id of ids) {
      all.add(id)
      descendants(d, id).forEach((c) => all.add(c))
    }
    for (const id of all) {
      const n = d.nodes[id]
      if (!n) continue
      if (!ids.includes(id)) {
        n.x *= factor
        n.y *= factor
      }
      n.w *= factor
      n.h *= factor
      n.radius = n.radius.map((r) => r * factor) as SNode['radius']
      n.strokes.forEach((s) => (s.width *= factor))
      if (n.text) {
        n.text.fontSize *= factor
        n.text.letterSpacing *= factor
      }
      if (n.path) n.path = n.path.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_, x, y) => `${(Number(x) * factor).toFixed(2)},${(Number(y) * factor).toFixed(2)}`)
      if (n.autoLayout) {
        n.autoLayout.gap *= factor
        n.autoLayout.padding = n.autoLayout.padding.map((p) => p * factor) as AutoLayout['padding']
      }
    }
  })
}

function ShapeSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const one = nodes.length === 1 ? nodes[0] : null
  const isFrame = nodes.every((n) => n.type === 'frame' || n.type === 'section')
  const hasRadius = nodes.every((n) => ['frame', 'section', 'rect', 'image', 'video', 'shape3d', 'model3d'].includes(n.type))
  const radius = shared(nodes, (n) => n.radius)
  const independent = radius !== MIXED && new Set(radius).size > 1
  const polyLike = nodes.every((n) => n.type === 'polygon' || n.type === 'star')
  const setRadius = (i: number | null, v: number) => update(ids, (n) => void (n.radius = (i === null ? [v, v, v, v] : n.radius.map((r, j) => (j === i ? v : r))) as SNode['radius']))
  return (
    <Section title={isFrame ? 'Frame' : 'Layer'}>
      {isFrame && (
        <Sel<string>
          value=""
          options={[{ value: '', label: one ? `${Math.round(one.w)} × ${Math.round(one.h)} — Presets…` : 'Presets…' }, ...FRAME_PRESETS.flatMap((g) => g.items.map((p) => ({ value: `${p.w}x${p.h}`, label: `${g.group} · ${p.name} (${p.w}×${p.h})` })))]}
          onChange={(v) => {
            if (!v) return
            const [w, h] = v.split('x').map(Number)
            update(ids, { w, h })
          }}
        />
      )}
      <div className="grid grid-cols-2 gap-1">
        <NumberField label="◐" title="Opacity" value={shared(nodes, (n) => Math.round(n.opacity * 100))} min={0} max={100} suffix="%" onChange={(v) => update(ids, { opacity: v / 100 })} />
        <Sel title="Blend mode" value={shared(nodes, (n) => n.blend)} options={BLENDS} onChange={(blend) => update(ids, { blend })} />
      </div>
      {hasRadius && (
        <div className="flex items-center gap-1">
          <NumberField className="flex-1" label="◜" title="Corner radius" value={radius === MIXED || independent ? MIXED : radius[0]} min={0} onChange={(v) => setRadius(null, v)} />
          <IconBtn label="Independent corners" active={independent} onClick={() => radius !== MIXED && setRadius(0, independent ? radius[0] : radius[0] + 0.01)}><ScanIcon /></IconBtn>
        </div>
      )}
      {hasRadius && independent && (
        <div className="grid grid-cols-4 gap-1">
          {['TL', 'TR', 'BR', 'BL'].map((l, i) => <NumberField key={l} label={l} value={radius[i]} min={0} onChange={(v) => setRadius(i, v)} />)}
        </div>
      )}
      {polyLike && (
        <div className="grid grid-cols-2 gap-1">
          <NumberField label="#" title={nodes[0].type === 'star' ? 'Points' : 'Sides'} value={shared(nodes, (n) => n.sides)} min={3} max={60} onChange={(sides) => update(ids, { sides })} />
          {nodes.every((n) => n.type === 'star') && <NumberField label="R" title="Inner ratio" value={shared(nodes, (n) => Math.round(n.innerRatio * 100))} min={1} max={100} suffix="%" onChange={(v) => update(ids, { innerRatio: v / 100 })} />}
        </div>
      )}
      <div className="flex items-center gap-1">
        {isFrame && <Check label="Clip content" checked={shared(nodes, (n) => n.clip)} onChange={(clip) => update(ids, { clip })} />}
        <div className="flex-1" />
        <NumberField className="w-24" label="Scale" value={100} min={1} suffix="%" onChange={(v) => v !== 100 && scaleNodes(ids, v / 100)} />
      </div>
    </Section>
  )
}

const DEFAULT_LAYOUT: AutoLayout = { direction: 'vertical', gap: 10, padding: [10, 10, 10, 10], align: 'start', justify: 'start', wrap: false }

function LayoutSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const doc = useS3D((s) => s.doc)
  const containers = nodes.every((n) => n.type === 'frame' || n.type === 'section')
  const layout = containers ? shared(nodes, (n) => n.autoLayout) : MIXED
  const parents = nodes.map((n) => doc.nodes[n.parentId])
  const inAutoLayout = parents.every((p) => p?.autoLayout)
  const inFrame = parents.every((p) => p && !p.autoLayout && (p.type === 'frame' || p.type === 'section'))
  const setLayout = (patch: Partial<AutoLayout>) => update(ids, (n) => void (n.autoLayout = { ...(n.autoLayout ?? DEFAULT_LAYOUT), ...patch }))
  const pad = layout && layout !== MIXED ? layout.padding : null
  const sizingOpts = (canHug: boolean, canFill: boolean) =>
    [{ value: 'fixed' as Sizing, label: 'Fixed' }, ...(canHug ? [{ value: 'hug' as Sizing, label: 'Hug' }] : []), ...(canFill ? [{ value: 'fill' as Sizing, label: 'Fill' }] : [])]
  const showSizing = (containers && layout && layout !== MIXED) || inAutoLayout
  return (
    <>
      {containers && (
        <Section
          title="Auto layout"
          onAdd={layout ? undefined : () => update(ids, { autoLayout: DEFAULT_LAYOUT, sizing: { h: 'hug', v: 'hug' } })}
          actions={layout ? <IconBtn label="Remove auto layout" onClick={() => update(ids, { autoLayout: null, sizing: { h: 'fixed', v: 'fixed' } })}><MinusIcon /></IconBtn> : undefined}
        >
          {layout && layout !== MIXED && (
            <>
              <div className="flex items-center gap-0.5">
                <IconBtn label="Vertical" active={layout.direction === 'vertical'} onClick={() => setLayout({ direction: 'vertical' })}><ArrowDownIcon /></IconBtn>
                <IconBtn label="Horizontal" active={layout.direction === 'horizontal'} onClick={() => setLayout({ direction: 'horizontal' })}><ArrowRightIcon /></IconBtn>
                <IconBtn label="Wrap" active={layout.wrap} onClick={() => setLayout({ wrap: !layout.wrap })}><WrapTextIcon /></IconBtn>
                <div className="flex-1" />
                <NumberField className="w-20" label="Gap" value={layout.gap} min={0} onChange={(gap) => setLayout({ gap, justify: layout.justify === 'space-between' ? 'start' : layout.justify })} />
              </div>
              <div className="flex gap-2">
                <div className="grid grid-cols-3 gap-0.5 rounded-md bg-muted/60 p-1" aria-label="Alignment">
                  {(['start', 'center', 'end'] as const).flatMap((cross) =>
                    (['start', 'center', 'end'] as const).map((main) => {
                      // Rows are vertical position, columns horizontal; map to main/cross axes per direction.
                      const [a, j] = layout.direction === 'horizontal' ? [cross, main] : [main, cross]
                      const active = layout.align === a && layout.justify === j
                      return <button key={`${cross}-${main}`} type="button" aria-label={`Align ${cross} ${main}`} onClick={() => setLayout({ align: a, justify: j })} className={cn('size-4 rounded-sm hover:bg-accent', active ? 'bg-primary' : 'bg-transparent after:mx-auto after:block after:size-1 after:rounded-full after:bg-muted-foreground/50')} />
                    }),
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <Check label="Space between" checked={layout.justify === 'space-between'} onChange={(v) => setLayout({ justify: v ? 'space-between' : 'start' })} />
                  <NumberField label="Pad" title="Uniform padding" value={new Set(pad).size === 1 ? pad![0] : MIXED} min={0} onChange={(v) => setLayout({ padding: [v, v, v, v] })} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {['T', 'R', 'B', 'L'].map((l, i) => (
                  <NumberField key={l} label={l} value={pad![i]} min={0} onChange={(v) => setLayout({ padding: pad!.map((p, j) => (j === i ? v : p)) as AutoLayout['padding'] })} />
                ))}
              </div>
            </>
          )}
        </Section>
      )}
      {showSizing && (
        <Section title="Resizing">
          <div className="grid grid-cols-2 gap-1">
            <Sel title="Horizontal sizing" value={shared(nodes, (n) => n.sizing.h)} options={sizingOpts(containers && !!layout, inAutoLayout)} onChange={(h) => update(ids, (n) => void (n.sizing.h = h))} />
            <Sel title="Vertical sizing" value={shared(nodes, (n) => n.sizing.v)} options={sizingOpts(containers && !!layout, inAutoLayout)} onChange={(v) => update(ids, (n) => void (n.sizing.v = v))} />
          </div>
        </Section>
      )}
      {inFrame && (
        <Section title="Constraints">
          <div className="grid grid-cols-2 gap-1">
            <Sel<ConstraintH> title="Horizontal" value={shared(nodes, (n) => n.constraints.h)} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'left-right', label: 'Left & right' }, { value: 'center', label: 'Center' }, { value: 'scale', label: 'Scale' }]} onChange={(h) => update(ids, (n) => void (n.constraints.h = h))} />
            <Sel<ConstraintV> title="Vertical" value={shared(nodes, (n) => n.constraints.v)} options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'top-bottom', label: 'Top & bottom' }, { value: 'center', label: 'Center' }, { value: 'scale', label: 'Scale' }]} onChange={(v) => update(ids, (n) => void (n.constraints.v = v))} />
          </div>
        </Section>
      )}
    </>
  )
}

function TypographySection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const t = <K extends keyof TextStyle>(k: K): Maybe<TextStyle[K]> => shared(nodes, (n) => n.text![k])
  const set = (patch: Partial<TextStyle>) => update(ids, (n) => void (n.text && Object.assign(n.text, patch)))
  const content = t('content')
  return (
    <Section title="Text">
      <textarea
        className="min-h-14 w-full rounded-md bg-muted/60 p-2 text-xs outline-none focus:ring-1 focus:ring-ring"
        defaultValue={content === MIXED ? '' : content}
        key={content === MIXED ? 'mixed' : content}
        placeholder={content === MIXED ? 'Mixed' : undefined}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) => e.target.value !== content && set({ content: e.target.value })}
      />
      <Sel value={t('fontFamily')} options={FONTS} onChange={(fontFamily) => set({ fontFamily })} />
      <div className="grid grid-cols-2 gap-1">
        <Sel<string> value={(() => { const w = t('fontWeight'); return w === MIXED ? MIXED : String(w) })()} options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'][w / 100 - 1] }))} onChange={(v) => set({ fontWeight: Number(v) })} />
        <NumberField label="Aa" title="Font size" value={t('fontSize')} min={1} onChange={(fontSize) => set({ fontSize })} />
        <NumberField label="LH" title="Line height" value={t('lineHeight')} step={0.05} min={0.5} onChange={(lineHeight) => set({ lineHeight })} />
        <NumberField label="LS" title="Letter spacing" value={t('letterSpacing')} step={0.1} onChange={(letterSpacing) => set({ letterSpacing })} />
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        <IconBtn label="Align left" active={t('align') === 'left'} onClick={() => set({ align: 'left' })}><AlignLeftIcon /></IconBtn>
        <IconBtn label="Align center" active={t('align') === 'center'} onClick={() => set({ align: 'center' })}><AlignCenterIcon /></IconBtn>
        <IconBtn label="Align right" active={t('align') === 'right'} onClick={() => set({ align: 'right' })}><AlignRightIcon /></IconBtn>
        <IconBtn label="Justify" active={t('align') === 'justify'} onClick={() => set({ align: 'justify' })}><AlignJustifyIcon /></IconBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <IconBtn label="Bold" active={(t('fontWeight') as number) >= 600} onClick={() => set({ fontWeight: (t('fontWeight') as number) >= 600 ? 400 : 700 })}><BoldIcon /></IconBtn>
        <IconBtn label="Italic" active={t('italic') === true} onClick={() => set({ italic: t('italic') !== true })}><ItalicIcon /></IconBtn>
        <IconBtn label="Underline" active={t('underline') === true} onClick={() => set({ underline: t('underline') !== true })}><UnderlineIcon /></IconBtn>
        <IconBtn label="Strikethrough" active={t('strike') === true} onClick={() => set({ strike: t('strike') !== true })}><StrikethroughIcon /></IconBtn>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Sel title="Vertical align" value={t('verticalAlign')} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} onChange={(verticalAlign) => set({ verticalAlign })} />
        <Sel title="Case" value={t('transform')} options={[{ value: 'none', label: 'Aa' }, { value: 'uppercase', label: 'AA' }, { value: 'lowercase', label: 'aa' }, { value: 'capitalize', label: 'Ab' }]} onChange={(transform) => set({ transform })} />
        <Sel title="Resizing" value={t('autoSize')} options={[{ value: 'width', label: 'Auto W' }, { value: 'height', label: 'Auto H' }, { value: 'fixed', label: 'Fixed' }]} onChange={(autoSize) => set({ autoSize })} />
      </div>
    </Section>
  )
}

function ThreeSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const replace = async () => {
    const [file] = await pickFiles('.glb,.gltf', false)
    if (!file) return
    const src = await storeFile(file, file.name, useS3D.getState().doc.id)
    update(ids, { type: 'model3d', src, name: file.name.replace(/\.[^.]+$/, '') })
  }
  return (
    <Section title="3D">
      {nodes.length === 1 && (
        <button type="button" onClick={() => openSceneEditor(nodes[0].id)} className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Rotate3dIcon className="size-3.5" /> Edit in 3D
        </button>
      )}
      {nodes.every((n) => n.type === 'shape3d') && (
        <Sel<Shape3D> value={shared(nodes, (n) => n.shape3d)} options={[{ value: 'cube', label: 'Cube' }, { value: 'sphere', label: 'Sphere' }, { value: 'torus', label: 'Torus' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'cone', label: 'Cone' }, { value: 'torusKnot', label: 'Torus knot' }]} onChange={(shape3d) => update(ids, { shape3d })} />
      )}
      {nodes.every((n) => n.type === 'shape3d') && <ColorField color={shared(nodes, (n) => n.modelColor)} onChange={(modelColor) => update(ids, { modelColor })} />}
      <button type="button" onClick={() => void replace()} className="flex h-7 items-center gap-1.5 rounded-md bg-muted/60 px-2 text-xs hover:bg-muted">
        <UploadIcon className="size-3" /> {nodes.every((n) => n.type === 'model3d') ? 'Replace model…' : 'Load GLB/GLTF model…'}
      </button>
      {nodes.every((n) => n.type === 'model3d') && <button type="button" onClick={() => update(ids, { type: 'shape3d', src: '' })} className="h-7 rounded-md bg-muted/60 px-2 text-xs hover:bg-muted">Revert to primitive</button>}
    </Section>
  )
}

function CommentSection({ node }: { node: SNode }) {
  return (
    <Section title="Comment">
      <textarea
        className="min-h-20 w-full rounded-md bg-muted/60 p-2 text-xs outline-none focus:ring-1 focus:ring-ring"
        defaultValue={node.text?.content ?? node.name}
        key={node.id}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) =>
          update([node.id], (n) => {
            if (n.text) n.text.content = e.target.value
            else n.name = e.target.value
          })
        }
      />
      <div className="text-[11px] text-muted-foreground">{node.author ?? 'Unknown'}</div>
      <Check label="Resolved" checked={!!node.resolved} onChange={(resolved) => update([node.id], { resolved })} />
    </Section>
  )
}

function PageSection() {
  const page = useS3D(currentPage)
  const name = useS3D((s) => s.doc.name)
  const setBg = (bg: string) => useS3D.getState().mutate((d) => {
    const p = d.pages.find((x) => x.id === page.id)
    if (p) p.background = bg
  })
  return (
    <>
      <Section title="Document">
        <TextField value={name} onChange={(v) => useS3D.getState().renameDoc(v)} />
      </Section>
      <Section title="Page">
        <TextField value={page.name} onChange={(v) => useS3D.getState().renamePage(page.id, v)} />
        <ColorField color={page.background} onChange={setBg} />
      </Section>
    </>
  )
}

export function DesignPanel() {
  const selection = useS3D((s) => s.selection)
  const nodesMap = useS3D((s) => s.doc.nodes)
  const page = useS3D(currentPage)
  const nodes = selection.map((id) => nodesMap[id]).filter(Boolean)
  if (!nodes.length) {
    return (
      <>
        <PageSection />
        <ExportSection ids={page.children} label={page.name} />
      </>
    )
  }
  if (nodes.length === 1 && nodes[0].type === 'comment') return <CommentSection node={nodes[0]} />
  const all = (types: SNode['type'][]) => nodes.every((n) => types.includes(n.type))
  const paintable = !all(['group', 'shape3d', 'model3d'])
  return (
    <>
      <AlignSection nodes={nodes} />
      <TransformSection nodes={nodes} />
      <LayoutSection nodes={nodes} />
      <ShapeSection nodes={nodes} />
      {all(['text']) && <TypographySection nodes={nodes} />}
      {all(['image', 'video']) && <ImageSection nodes={nodes} />}
      {all(['shape3d', 'model3d']) && <ThreeSection nodes={nodes} />}
      {paintable && <FillSection nodes={nodes} />}
      {paintable && <StrokeSection nodes={nodes} />}
      <EffectsSection nodes={nodes} />
      <ExportSection ids={nodes.map((n) => n.id)} label={nodes.length === 1 ? nodes[0].name : `${nodes.length} layers`} nodes={nodes} />
    </>
  )
}
