import { Skeleton } from '@/components/ui/skeleton'

export function DrawSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading SDraw"
      aria-busy="true"
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
    >
      <span className="sr-only">Loading SDraw…</span>
      <div aria-hidden="true" className="absolute inset-0 [&_[data-slot=skeleton]]:motion-reduce:animate-none">
        <Skeleton className="absolute top-4 left-4 size-10 rounded-lg" />
        <div className="absolute top-4 left-1/2 flex max-w-[calc(100%-8rem)] -translate-x-1/2 gap-2 overflow-hidden rounded-xl border bg-background p-2 shadow-sm">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="size-8 shrink-0 rounded-md" />
          ))}
        </div>
        <div className="absolute top-20 right-4 flex items-center gap-2 rounded-lg border bg-background p-2 shadow-sm lg:top-4">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
        <div className="absolute top-20 left-4 hidden w-44 flex-col gap-4 rounded-xl border bg-background p-4 shadow-sm sm:flex">
          <Skeleton className="h-3 w-20 rounded" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="size-6 rounded-md" />
            ))}
          </div>
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
        <div className="absolute bottom-4 left-4 flex gap-2 rounded-lg border bg-background p-2 shadow-sm">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
        <Skeleton className="absolute right-5 bottom-5 size-12 rounded-full" />
      </div>
    </div>
  )
}
