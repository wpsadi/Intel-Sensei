import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PlusIcon } from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useS3D } from '../store'
import type { SNode } from '../types'

export const MIXED = 'mixed' as const
export type Maybe<T> = T | typeof MIXED

/** The selected nodes, re-rendering when any of them changes. */
export function useSelectedNodes() {
  const selection = useS3D((s) => s.selection)
  const nodes = useS3D((s) => s.doc.nodes)
  return selection.map((id) => nodes[id]).filter(Boolean) as SNode[]
}

/** A shared value across nodes, or MIXED. */
export function shared<T>(nodes: SNode[], pick: (n: SNode) => T): Maybe<T> {
  if (!nodes.length) return MIXED
  const first = JSON.stringify(pick(nodes[0]))
  return nodes.every((n) => JSON.stringify(pick(n)) === first) ? pick(nodes[0]) : MIXED
}

export const update = (ids: string[], patch: Partial<SNode> | ((n: SNode) => void)) => useS3D.getState().updateNodes(ids, patch)

export function Section({ title, onAdd, actions, children }: { title: string; onAdd?: () => void; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b px-3 py-2.5">
      <div className="mb-1.5 flex h-6 items-center gap-1">
        <span className="flex-1 text-[11px] font-semibold">{title}</span>
        {actions}
        {onAdd && <IconBtn label={`Add ${title.toLowerCase()}`} onClick={onAdd}><PlusIcon /></IconBtn>}
      </div>
      {children && <div className="flex flex-col gap-1.5">{children}</div>}
    </div>
  )
}

export function IconBtn({ label, active, onClick, children, className }: { label: string; active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5', active && 'bg-accent text-foreground', className)}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="text-xs">{label}</TooltipContent>
    </Tooltip>
  )
}

const round = (v: number) => Math.round(v * 100) / 100

/** Numeric input with a scrubbable label, arrow-key nudging (shift ×10) and Enter to commit. */
export function NumberField({ label, value, onChange, step = 1, min, max, suffix, className, title }: {
  label: ReactNode
  value: Maybe<number>
  onChange: (v: number, delta?: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  className?: string
  title?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const shown = draft ?? (value === MIXED ? '' : String(round(value)))
  const commit = () => {
    if (draft === null) return
    const expr = draft.trim()
    setDraft(null)
    if (!expr) return
    try {
      // Allows simple math like "100/2".
      const v = /^[-+*/.\d\s()]+$/.test(expr) ? Number(Function(`"use strict";return (${expr})`)()) : Number(expr)
      if (Number.isFinite(v)) onChange(clamp(v), value === MIXED ? undefined : v - value)
    } catch {
      // Invalid expression: keep the old value.
    }
  }
  const scrub = (e: React.PointerEvent) => {
    if (value === MIXED) return
    e.preventDefault()
    const startX = e.clientX
    const start = value
    useS3D.getState().beginGesture()
    const move = (ev: PointerEvent) => {
      const v = clamp(start + Math.round((ev.clientX - startX) / 2) * step * (ev.shiftKey ? 10 : 1))
      onChange(round(v), v - start)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      useS3D.getState().endGesture()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <label title={title} className={cn('flex h-7 min-w-0 items-center gap-1 rounded-md bg-muted/60 px-1.5 text-xs focus-within:ring-1 focus-within:ring-ring', className)}>
      <span onPointerDown={scrub} className="flex shrink-0 cursor-ew-resize items-center text-[10px] text-muted-foreground select-none [&_svg]:size-3">{label}</span>
      <input
        className="w-full min-w-0 bg-transparent outline-none"
        value={shown}
        placeholder={value === MIXED ? 'Mixed' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== MIXED) {
            e.preventDefault()
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            setDraft(null)
            onChange(clamp(round(value + d)), d)
          }
        }}
      />
      {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
    </label>
  )
}

export function TextField({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      className={cn('h-7 w-full min-w-0 rounded-md bg-muted/60 px-2 text-xs outline-none focus:ring-1 focus:ring-ring', className)}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onChange(draft)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

export function Sel<T extends string>({ value, options, onChange, className, title }: { value: Maybe<T>; options: (T | { value: T; label: string })[]; onChange: (v: T) => void; className?: string; title?: string }) {
  return (
    <select
      title={title}
      className={cn('h-7 w-full min-w-0 rounded-md bg-muted/60 px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring', className)}
      value={value === MIXED ? '' : value}
      onChange={(e) => onChange(e.target.value as T)}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {value === MIXED && <option value="">Mixed</option>}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o
        return <option key={opt.value} value={opt.value}>{opt.label}</option>
      })}
    </select>
  )
}

/* ---------- color ---------- */

export const normHex = (hex: string) => {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null
}
const toRgb = (hex: string) => {
  const n = parseInt((normHex(hex) ?? '#000000').slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const fromRgb = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
function toHsl(hex: string) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}
function fromHsl(h: number, s: number, l: number) {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return fromRgb(f(0) * 255, f(8) * 255, f(4) * 255)
}

/** Swatch + hex input; the swatch opens a picker with a saturation/hue picker, HEX, RGB and HSL editors and optional opacity. */
export function ColorField({ color, opacity, onChange, onOpacity }: { color: Maybe<string>; opacity?: Maybe<number>; onChange: (c: string) => void; onOpacity?: (o: number) => void }) {
  const c = color === MIXED ? '#000000' : color
  const [mode, setMode] = useState<'hex' | 'rgb' | 'hsl'>('hex')
  const rgb = toRgb(c)
  const hsl = toHsl(c)
  const gesture = useRef(false)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Popover>
        <PopoverTrigger render={<button type="button" aria-label="Edit color" className="size-6 shrink-0 rounded border" style={{ background: c }} />} />
        <PopoverContent side="left" className="w-56 p-2 text-xs">
          <div className="flex flex-col gap-2">
            {/* One drag is one undo step: the gesture spans pointer down to pointer up. */}
            <div
              className="s3d-color-picker"
              onPointerDown={() => {
                gesture.current = true
                useS3D.getState().beginGesture()
              }}
              onPointerUp={() => {
                if (gesture.current) useS3D.getState().endGesture()
                gesture.current = false
              }}
            >
              <HexColorPicker color={c} onChange={onChange} />
            </div>
            <Sel value={mode} options={[{ value: 'hex', label: 'HEX' }, { value: 'rgb', label: 'RGB' }, { value: 'hsl', label: 'HSL' }]} onChange={setMode} />
            {mode === 'hex' && <TextField value={c} onChange={(v) => { const h = normHex(v); if (h) onChange(h) }} />}
            {mode === 'rgb' && (
              <div className="grid grid-cols-3 gap-1">
                {['R', 'G', 'B'].map((l, i) => (
                  <NumberField key={l} label={l} value={rgb[i]} min={0} max={255} onChange={(v) => { const n = [...rgb]; n[i] = v; onChange(fromRgb(n[0], n[1], n[2])) }} />
                ))}
              </div>
            )}
            {mode === 'hsl' && (
              <div className="grid grid-cols-3 gap-1">
                {['H', 'S', 'L'].map((l, i) => (
                  <NumberField key={l} label={l} value={hsl[i]} min={0} max={i ? 100 : 360} onChange={(v) => { const n = [...hsl]; n[i] = v; onChange(fromHsl(n[0], n[1], n[2])) }} />
                ))}
              </div>
            )}
            {onOpacity && opacity !== undefined && (
              <NumberField label="A" value={opacity === MIXED ? MIXED : Math.round(opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => onOpacity(v / 100)} />
            )}
          </div>
        </PopoverContent>
      </Popover>
      <TextField className="flex-1 font-mono uppercase" value={color === MIXED ? '' : c.replace('#', '')} placeholder="Mixed" onChange={(v) => { const h = normHex(v); if (h) onChange(h) }} />
      {onOpacity && opacity !== undefined && (
        <NumberField className="w-14 shrink-0" label="" value={opacity === MIXED ? MIXED : Math.round(opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => onOpacity(v / 100)} />
      )}
    </div>
  )
}

export function Check({ label, checked, onChange }: { label: string; checked: Maybe<boolean>; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-6 items-center gap-2 text-xs">
      <input
        type="checkbox"
        className="size-3.5 accent-primary"
        checked={checked === true}
        ref={(el) => {
          if (el) el.indeterminate = checked === MIXED
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

/** Moves an item within an array; returns a new array. */
export function moveItem<T>(arr: T[], from: number, to: number) {
  const next = [...arr]
  const [x] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, x)
  return next
}
