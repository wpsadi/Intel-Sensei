import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Dots behind the S-Design canvas, the same grid the editor draws while the document loads. */
const GRID = {
  backgroundImage: 'radial-gradient(color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 1px)',
  backgroundSize: '16px 16px',
}

/**
 * Placeholder for the centre of S-Design or S3D while the document loads. It matches the editor it stands in for: a
 * dotted artboard with a frame and cards (S-Design) or a 3D viewport with a scene bar (S3D), and the floating tool dock.
 * The sidebars and menubar come from the layout, so only the centre is drawn here.
 */
export function CanvasSkeleton({ variant }: { variant: 'design' | '3d' }) {
  return (
    <div
      role="status"
      aria-label={variant === '3d' ? 'Loading S3D' : 'Loading S-Design'}
      className="relative flex min-h-0 flex-1 overflow-hidden bg-muted/30"
      style={GRID}
    >
      {variant === 'design' ? (
        <div className="absolute left-1/2 top-1/2 flex h-[62%] w-[min(70%,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-md border bg-card p-6 shadow-sm">
          <Skeleton className="h-8 w-1/3" />
          <div className="grid flex-1 grid-cols-3 gap-4">
            <Skeleton className="rounded-lg" />
            <Skeleton className="rounded-lg" />
            <Skeleton className="rounded-lg" />
          </div>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : (
        <div className="absolute inset-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="min-h-0 flex-1 rounded-xl" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div
          className={cn(
            'flex items-center gap-1 rounded-xl border bg-background/80 p-1 shadow-sm backdrop-blur',
            variant === '3d' ? 'w-[min(92%,30rem)]' : 'w-[min(92%,34rem)]',
          )}
        >
          {Array.from({ length: variant === '3d' ? 9 : 13 }, (_, i) => (
            <Skeleton key={i} className="size-7 shrink-0 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
