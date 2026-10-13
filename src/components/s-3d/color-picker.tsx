import { useEffect, useState } from 'react'
import { PipetteIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SWATCHES } from '@/features/s-3d/agent/tools-impl'
import { useS3D } from '@/features/s-3d/store'
import { cn } from '@/lib/utils'

const HEX = /^#[0-9a-f]{6}$/i

/** A colour swatch that opens a picker: colour area, hex field, swatches and the eyedropper. */
export function ColorPicker({ label, value, onChange, className }: { label: string; value: string; onChange: (hex: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (hex: string) => {
    if (HEX.test(hex)) onChange(hex.toLowerCase())
    else setDraft(value)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" aria-label={label} title={label} className={cn('size-6 rounded-sm border border-border shadow-sm', className)} style={{ backgroundColor: value }} />} />
      <PopoverContent side="top" className="w-60 gap-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{label}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              useS3D.getState().set({ tool: 'eyedropper' })
              setOpen(false)
            }}
          >
            <PipetteIcon style={{ color: value }} />
            Pick from canvas
          </Button>
        </div>
        <input
          type="color"
          aria-label={`${label} colour area`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-24 w-full cursor-pointer rounded-md border border-border bg-transparent p-0"
        />
        <Input
          aria-label={`${label} hex`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
          className="h-8 font-mono text-xs uppercase"
        />
        <div className="grid grid-cols-6 gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Swatch ${c}`}
              title={c}
              onClick={() => onChange(c)}
              className={cn('aspect-square rounded-sm border border-border', c === value && 'ring-2 ring-ring ring-offset-1')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
