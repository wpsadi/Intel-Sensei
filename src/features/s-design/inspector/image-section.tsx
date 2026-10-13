import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2Icon, RotateCcwIcon, ScissorsIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { removeBackground, restoreBackground } from '@/features/s-3d/remove-background'
import type { ImageAdjust, SNode } from '@/features/s-3d/types'
import { IconBtn, NumberField, Check, Sel, Section, shared, update } from '@/features/s-3d/inspector/fields'

const PRESETS: Record<string, ImageAdjust> = {
  Original: {},
  Vivid: { saturation: 40, contrast: 15 },
  'Black & white': { grayscale: 100, contrast: 10 },
  Vintage: { sepia: 50, contrast: -10, brightness: 5 },
  Warm: { temperature: 40, saturation: 10 },
  Cool: { temperature: -40 },
  Faded: { contrast: -25, brightness: 10, saturation: -20 },
  Dramatic: { contrast: 40, saturation: -15, brightness: -10 },
}

const SLIDERS: { key: Exclude<keyof ImageAdjust, 'invert'>; label: string; min: number; max: number; suffix?: string }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, suffix: '°' },
  { key: 'blur', label: 'Blur', min: 0, max: 40, suffix: 'px' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, suffix: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, suffix: '%' },
]

/** Non-destructive adjustments for images and video: tone, colour and filters, with one-click presets. */
export function ImageSection({ nodes }: { nodes: SNode[] }) {
  const ids = nodes.map((n) => n.id)
  const [busy, setBusy] = useState(false)
  const images = nodes.filter((n) => n.type === 'image')
  const cut = async () => {
    setBusy(true)
    try {
      await removeBackground(images.map((n) => n.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the background')
    } finally {
      setBusy(false)
    }
  }
  const set = (patch: Partial<ImageAdjust>) => update(ids, (n) => void (n.adjust = { ...n.adjust, ...patch }))
  return (
    <Section title="Adjustments" actions={<IconBtn label="Reset adjustments" onClick={() => update(ids, (n) => void (n.adjust = undefined))}><RotateCcwIcon /></IconBtn>}>
      {images.length > 0 && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={busy} onClick={() => void cut()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <ScissorsIcon />}{busy ? 'Removing…' : 'Remove background'}
          </Button>
          {images.some((n) => n.origSrc) && <IconBtn label="Restore original" onClick={() => restoreBackground(images.map((n) => n.id))}><Undo2Icon /></IconBtn>}
        </div>
      )}
      <Sel<string>
        value=""
        options={[{ value: '', label: 'Presets…' }, ...Object.keys(PRESETS).map((k) => ({ value: k, label: k }))]}
        onChange={(k) => k && update(ids, (n) => void (n.adjust = { ...PRESETS[k] }))}
      />
      <div className="grid grid-cols-2 gap-1">
        {SLIDERS.map((s) => (
          <NumberField key={s.key} label={s.label.slice(0, 3)} title={s.label} value={shared(nodes, (n) => n.adjust?.[s.key] ?? 0)} min={s.min} max={s.max} suffix={s.suffix} onChange={(v) => set({ [s.key]: v })} />
        ))}
      </div>
      <Check label="Invert" checked={shared(nodes, (n) => !!n.adjust?.invert)} onChange={(invert) => set({ invert })} />
    </Section>
  )
}
