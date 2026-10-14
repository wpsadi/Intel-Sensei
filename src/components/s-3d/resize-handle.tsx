import { cn } from '@/lib/utils'

/**
 * A thin vertical bar that resizes a panel by dragging. `onResize` gets the pointer's x movement since the
 * drag started; `onDragChange` reports when a drag starts and ends so the host can pause its width animation.
 */
export function ResizeHandle({
  onResize,
  onDragChange,
  className,
}: {
  onResize: (dx: number) => void
  onDragChange?: (dragging: boolean) => void
  className?: string
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        'absolute inset-y-0 z-20 w-2 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 hover:after:w-0.5 hover:after:bg-primary/60',
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault()
        const startX = e.clientX
        const el = e.currentTarget
        el.setPointerCapture(e.pointerId)
        onDragChange?.(true)
        const move = (ev: PointerEvent) => onResize(ev.clientX - startX)
        const up = () => {
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerup', up)
          el.removeEventListener('pointercancel', up)
          onDragChange?.(false)
        }
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerup', up)
        el.addEventListener('pointercancel', up)
      }}
    />
  )
}
