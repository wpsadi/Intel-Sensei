import { ChevronDownIcon, ChevronUpIcon, EyeIcon, EyeOffIcon, MinusIcon, UploadIcon } from 'lucide-react'

import { uid } from '@/features/s-3d/db'
import { pickFiles, storeFile } from '@/features/s-3d/files'
import { moveItem, update } from '@/features/s-3d/inspector/field-utils'
import { ColorField, IconBtn, NumberField, Section, Sel } from '@/features/s-3d/inspector/fields'
import { solid, stroke } from '@/features/s-3d/model'
import { useS3D } from '@/features/s-3d/store'
import type { Effect, Fill, SNode } from '@/features/s-3d/types'

type FillKind = Fill['kind']

function convertFill(f: Fill, kind: FillKind): Fill {
  const base = { id: f.id, opacity: f.opacity, visible: f.visible }
  const color = f.kind === 'solid' ? f.color : f.kind === 'linear' || f.kind === 'radial' ? f.stops[0].color : '#d9d9d9'
  switch (kind) {
    case 'solid':
      return { ...base, kind, color }
    case 'linear':
    case 'radial':
      return {
        ...base,
        kind,
        angle: f.kind === 'linear' || f.kind === 'radial' ? f.angle : 90,
        stops:
          f.kind === 'linear' || f.kind === 'radial'
            ? f.stops
            : [
                { offset: 0, color },
                { offset: 1, color: '#ffffff' },
              ],
      }
    case 'image':
    case 'video':
      return { ...base, kind, src: f.kind === 'image' || f.kind === 'video' ? f.src : '', fit: 'cover' }
    case 'frame':
      return { ...base, kind, frameId: '' }
  }
}

function FillRow({ fill, index, count, ids, frames }: { fill: Fill; index: number; count: number; ids: string[]; frames: SNode[] }) {
  const set = (patch: Partial<Fill> | ((f: Fill) => Fill)) =>
    update(ids, (n) => {
      n.fills = n.fills.map((f, i) => (i === index ? (typeof patch === 'function' ? patch(f) : ({ ...f, ...patch } as Fill)) : f))
    })
  const upload = async () => {
    const [file] = await pickFiles(fill.kind === 'video' ? 'video/*' : 'image/*', false)
    if (!file) return
    const src = await storeFile(file, file.name, useS3D.getState().doc.id)
    set({ src } as Partial<Fill>)
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border border-transparent hover:border-border">
      <div className="flex items-center gap-1">
        <Sel<FillKind>
          className="w-20 shrink-0"
          value={fill.kind}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'linear', label: 'Linear' },
            { value: 'radial', label: 'Radial' },
            { value: 'image', label: 'Image' },
            { value: 'video', label: 'Video' },
            { value: 'frame', label: 'Frame' },
          ]}
          onChange={(k) => set((f) => convertFill(f, k))}
        />
        <div className="flex-1" />
        <IconBtn label="Move up" onClick={() => index > 0 && update(ids, (n) => void (n.fills = moveItem(n.fills, index, index - 1)))}>
          <ChevronUpIcon />
        </IconBtn>
        <IconBtn
          label="Move down"
          onClick={() => index < count - 1 && update(ids, (n) => void (n.fills = moveItem(n.fills, index, index + 1)))}
        >
          <ChevronDownIcon />
        </IconBtn>
        <IconBtn label={fill.visible ? 'Hide' : 'Show'} onClick={() => set({ visible: !fill.visible })}>
          {fill.visible ? <EyeIcon /> : <EyeOffIcon />}
        </IconBtn>
        <IconBtn label="Remove" onClick={() => update(ids, (n) => void (n.fills = n.fills.filter((_, i) => i !== index)))}>
          <MinusIcon />
        </IconBtn>
      </div>
      {fill.kind === 'solid' && (
        <ColorField
          color={fill.color}
          opacity={fill.opacity}
          onChange={(color) => set({ color } as Partial<Fill>)}
          onOpacity={(opacity) => set({ opacity })}
        />
      )}
      {(fill.kind === 'linear' || fill.kind === 'radial') && (
        <>
          <div className="flex gap-1">
            {fill.kind === 'linear' && (
              <NumberField
                className="flex-1"
                label="∠"
                value={fill.angle}
                suffix="°"
                onChange={(angle) => set({ angle } as Partial<Fill>)}
              />
            )}
            <NumberField
              className="flex-1"
              label="A"
              value={Math.round(fill.opacity * 100)}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) => set({ opacity: v / 100 })}
            />
            <IconBtn label="Add stop" onClick={() => set({ stops: [...fill.stops, { offset: 1, color: '#000000' }] } as Partial<Fill>)}>
              <span className="text-sm">+</span>
            </IconBtn>
          </div>
          {fill.stops.map((s, si) => (
            <div key={si} className="flex items-center gap-1">
              <NumberField
                className="w-16 shrink-0"
                label=""
                value={Math.round(s.offset * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => set({ stops: fill.stops.map((x, j) => (j === si ? { ...x, offset: v / 100 } : x)) } as Partial<Fill>)}
              />
              <ColorField
                color={s.color}
                onChange={(color) => set({ stops: fill.stops.map((x, j) => (j === si ? { ...x, color } : x)) } as Partial<Fill>)}
              />
              {fill.stops.length > 2 && (
                <IconBtn label="Remove stop" onClick={() => set({ stops: fill.stops.filter((_, j) => j !== si) } as Partial<Fill>)}>
                  <MinusIcon />
                </IconBtn>
              )}
            </div>
          ))}
        </>
      )}
      {(fill.kind === 'image' || fill.kind === 'video') && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void upload()}
            className="flex h-7 flex-1 items-center gap-1.5 rounded-md bg-muted/60 px-2 text-xs hover:bg-muted"
          >
            <UploadIcon className="size-3" /> {fill.src ? 'Replace…' : `Upload ${fill.kind}…`}
          </button>
          <Sel
            className="w-20 shrink-0"
            value={fill.fit}
            options={['cover', 'contain', 'fill']}
            onChange={(fit) => set({ fit } as Partial<Fill>)}
          />
        </div>
      )}
      {fill.kind === 'frame' && (
        <Sel
          value={fill.frameId || ('' as string)}
          options={[
            { value: '', label: 'Choose a frame…' },
            ...frames.filter((f) => !ids.includes(f.id)).map((f) => ({ value: f.id, label: f.name })),
          ]}
          onChange={(frameId) => set({ frameId } as Partial<Fill>)}
        />
      )}
    </div>
  )
}

export function FillSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const allNodes = useS3D((s) => s.doc.nodes)
  const frames = Object.values(allNodes).filter((n) => n.type === 'frame')
  const same = nodes.every((n) => JSON.stringify(n.fills) === JSON.stringify(nodes[0].fills))
  const fills = nodes[0].fills
  return (
    <Section
      title="Fill"
      onAdd={() => update(ids, (n) => void n.fills.push(solid(n.fills.length ? '#000000' : '#d9d9d9', n.fills.length ? 0.2 : 1)))}
    >
      {!same ? (
        <button
          type="button"
          className="h-7 rounded-md bg-muted/60 text-xs text-muted-foreground"
          onClick={() => update(ids, (n) => void (n.fills = structuredClone(fills)))}
        >
          Mixed — click to unify
        </button>
      ) : (
        fills.map((f, i) => <FillRow key={f.id} fill={f} index={i} count={fills.length} ids={ids} frames={frames} />)
      )}
    </Section>
  )
}

export function StrokeSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const same = nodes.every((n) => JSON.stringify(n.strokes) === JSON.stringify(nodes[0].strokes))
  const strokes = nodes[0].strokes
  const set = (i: number, patch: Partial<SNode['strokes'][number]>) =>
    update(ids, (n) => void (n.strokes = n.strokes.map((s, j) => (j === i ? { ...s, ...patch } : s))))
  return (
    <Section title="Stroke" onAdd={() => update(ids, (n) => void n.strokes.push(stroke()))}>
      {!same ? (
        <button
          type="button"
          className="h-7 rounded-md bg-muted/60 text-xs text-muted-foreground"
          onClick={() => update(ids, (n) => void (n.strokes = structuredClone(strokes)))}
        >
          Mixed — click to unify
        </button>
      ) : (
        strokes.map((s, i) => (
          <div key={s.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <ColorField
                color={s.color}
                opacity={s.opacity}
                onChange={(color) => set(i, { color })}
                onOpacity={(opacity) => set(i, { opacity })}
              />
              <IconBtn label={s.visible ? 'Hide' : 'Show'} onClick={() => set(i, { visible: !s.visible })}>
                {s.visible ? <EyeIcon /> : <EyeOffIcon />}
              </IconBtn>
              <IconBtn label="Remove" onClick={() => update(ids, (n) => void (n.strokes = n.strokes.filter((_, j) => j !== i)))}>
                <MinusIcon />
              </IconBtn>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <Sel
                value={s.align}
                options={[
                  { value: 'inside', label: 'Inside' },
                  { value: 'center', label: 'Center' },
                  { value: 'outside', label: 'Outside' },
                ]}
                onChange={(align) => set(i, { align })}
              />
              <NumberField label="W" value={s.width} min={0} step={0.5} onChange={(width) => set(i, { width })} />
              <NumberField label="- -" title="Dash length (0 = solid)" value={s.dash} min={0} onChange={(dash) => set(i, { dash })} />
            </div>
          </div>
        ))
      )}
    </Section>
  )
}

const EFFECT_LABELS: Record<Effect['kind'], string> = {
  'drop-shadow': 'Drop shadow',
  'inner-shadow': 'Inner shadow',
  'layer-blur': 'Layer blur',
  'background-blur': 'Background blur',
  glass: 'Glass',
  noise: 'Noise',
  projection: '3D projection',
}

function newEffect(kind: Effect['kind']): Effect {
  const id = uid()
  switch (kind) {
    case 'drop-shadow':
    case 'inner-shadow':
      return { id, kind, x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.25)', visible: true }
    case 'layer-blur':
    case 'background-blur':
      return { id, kind, radius: 8, visible: true }
    case 'glass':
      return { id, kind, blur: 16, tint: '#ffffff', visible: true }
    case 'noise':
      return { id, kind, amount: 0.25, visible: true }
    case 'projection':
      return { id, kind, rotateX: 15, rotateY: -20, perspective: 800, visible: true }
  }
}

/** Shadow colors are stored as rgba(); the editor works on hex + alpha. */
function parseRgba(c: string): [string, number] {
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) return [c.startsWith('#') ? c.slice(0, 7) : '#000000', 1]
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim())
  return [`#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`, Number(a)]
}
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function EffectsSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const effects = nodes[0].effects
  const same = nodes.every((n) => JSON.stringify(n.effects) === JSON.stringify(effects))
  const set = (i: number, patch: Record<string, unknown>) =>
    update(ids, (n) => void (n.effects = n.effects.map((e, j) => (j === i ? ({ ...e, ...patch } as Effect) : e))))
  return (
    <Section
      title="Effects"
      actions={
        <Sel<Effect['kind'] | ''>
          className="h-6 w-24"
          value=""
          options={[
            { value: '', label: '+ Add…' },
            ...(Object.keys(EFFECT_LABELS) as Effect['kind'][]).map((k) => ({ value: k, label: EFFECT_LABELS[k] })),
          ]}
          onChange={(k) => k && update(ids, (n) => void n.effects.push(newEffect(k)))}
        />
      }
    >
      {!same ? (
        <button
          type="button"
          className="h-7 rounded-md bg-muted/60 text-xs text-muted-foreground"
          onClick={() => update(ids, (n) => void (n.effects = structuredClone(effects)))}
        >
          Mixed — click to unify
        </button>
      ) : (
        effects.map((e, i) => (
          <div key={e.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs">{EFFECT_LABELS[e.kind]}</span>
              <IconBtn label={e.visible ? 'Hide' : 'Show'} onClick={() => set(i, { visible: !e.visible })}>
                {e.visible ? <EyeIcon /> : <EyeOffIcon />}
              </IconBtn>
              <IconBtn label="Remove" onClick={() => update(ids, (n) => void (n.effects = n.effects.filter((_, j) => j !== i)))}>
                <MinusIcon />
              </IconBtn>
            </div>
            {(e.kind === 'drop-shadow' || e.kind === 'inner-shadow') && (
              <>
                <div className="grid grid-cols-4 gap-1">
                  <NumberField label="X" value={e.x} onChange={(x) => set(i, { x })} />
                  <NumberField label="Y" value={e.y} onChange={(y) => set(i, { y })} />
                  <NumberField label="B" title="Blur" value={e.blur} min={0} onChange={(blur) => set(i, { blur })} />
                  <NumberField label="S" title="Spread" value={e.spread} onChange={(spread) => set(i, { spread })} />
                </div>
                {(() => {
                  const [hex, a] = parseRgba(e.color)
                  return (
                    <ColorField
                      color={hex}
                      opacity={a}
                      onChange={(c) => set(i, { color: rgba(c, a) })}
                      onOpacity={(o) => set(i, { color: rgba(hex, o) })}
                    />
                  )
                })()}
              </>
            )}
            {(e.kind === 'layer-blur' || e.kind === 'background-blur') && (
              <NumberField label="Blur" value={e.radius} min={0} onChange={(radius) => set(i, { radius })} />
            )}
            {e.kind === 'glass' && (
              <div className="flex gap-1">
                <NumberField className="w-20 shrink-0" label="Blur" value={e.blur} min={0} onChange={(blur) => set(i, { blur })} />
                <ColorField color={e.tint} onChange={(tint) => set(i, { tint })} />
              </div>
            )}
            {e.kind === 'noise' && (
              <NumberField
                label="Amount"
                value={Math.round(e.amount * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => set(i, { amount: v / 100 })}
              />
            )}
            {e.kind === 'projection' && (
              <div className="grid grid-cols-3 gap-1">
                <NumberField label="RX" value={e.rotateX} onChange={(rotateX) => set(i, { rotateX })} />
                <NumberField label="RY" value={e.rotateY} onChange={(rotateY) => set(i, { rotateY })} />
                <NumberField
                  label="P"
                  title="Perspective"
                  value={e.perspective}
                  min={50}
                  onChange={(perspective) => set(i, { perspective })}
                />
              </div>
            )}
          </div>
        ))
      )}
    </Section>
  )
}
