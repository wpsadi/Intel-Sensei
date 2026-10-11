import { useState } from 'react'
import { MinusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { uid } from '../db'
import { exportNodes } from '../export/exporter'
import type { ExportSetting, SNode } from '../types'
import { IconBtn, Section, Sel, TextField, update } from './fields'

const newSetting = (): ExportSetting => ({ id: uid(), format: 'png', scale: 1, suffix: '' })

/** Export settings for the selected nodes (stored on the first node), or for the whole page when `nodes` is omitted. */
export function ExportSection({ ids, label, nodes }: { ids: string[]; label: string; nodes?: SNode[] }) {
  const [pageSettings, setPageSettings] = useState<ExportSetting[]>([])
  const [busy, setBusy] = useState(false)
  const settings = nodes ? nodes[0].exports : pageSettings
  const save = (next: ExportSetting[]) => (nodes ? update(nodes.map((n) => n.id), { exports: next }) : setPageSettings(next))
  const set = (i: number, patch: Partial<ExportSetting>) => save(settings.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const run = async () => {
    setBusy(true)
    try {
      await exportNodes(ids, settings.length ? settings : [newSetting()])
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : error}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Export" onAdd={() => save([...settings, newSetting()])}>
      {settings.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <Sel<string> className="w-16 shrink-0" value={String(s.scale)} options={['0.5', '1', '1.5', '2', '3', '4'].map((v) => ({ value: v, label: `${v}x` }))} onChange={(v) => set(i, { scale: Number(v) })} />
          <TextField className="flex-1" value={s.suffix} placeholder="Suffix" onChange={(suffix) => set(i, { suffix })} />
          <Sel<ExportSetting['format']> className="w-16 shrink-0" value={s.format} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'svg', label: 'SVG' }, { value: 'pdf', label: 'PDF' }]} onChange={(format) => set(i, { format })} />
          <IconBtn label="Remove" onClick={() => save(settings.filter((_, j) => j !== i))}><MinusIcon /></IconBtn>
        </div>
      ))}
      <button type="button" disabled={busy || !ids.length} onClick={() => void run()} className="h-7 truncate rounded-md border px-2 text-xs hover:bg-accent disabled:opacity-50">
        {busy ? 'Exporting…' : `Export ${label}`}
      </button>
    </Section>
  )
}
