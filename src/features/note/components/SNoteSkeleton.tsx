import { Skeleton } from '@/components/ui/skeleton'

/** Indent and width of each row in the page list, so it reads like a tree of pages. */
const ROWS = [
  { depth: 0, width: 'w-28' },
  { depth: 1, width: 'w-36' },
  { depth: 1, width: 'w-24' },
  { depth: 2, width: 'w-32' },
  { depth: 0, width: 'w-40' },
  { depth: 0, width: 'w-20' },
  { depth: 1, width: 'w-28' },
  { depth: 0, width: 'w-32' },
]

/** Placeholder with the S-Note layout (page list, header and an editor page) while the notes load. */
export function SNoteSkeleton() {
  return (
    <div role="status" aria-label="Loading S-Note" className="flex h-svh w-full overflow-hidden">
      <aside className="hidden w-72 shrink-0 flex-col gap-3 border-r p-3 md:flex">
        <div className="flex items-center gap-2 px-1 pt-1">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mt-2 space-y-2.5">
          {ROWS.map((row, i) => (
            <div key={i} className="flex items-center gap-2 px-1" style={{ paddingLeft: row.depth * 14 }}>
              <Skeleton className="size-3.5 shrink-0 rounded" />
              <Skeleton className={`h-3.5 ${row.width}`} />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <Skeleton className="size-6 rounded" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto hidden h-4 w-28 sm:block" />
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Skeleton className="h-44 w-full rounded-none" />
          <div className="mx-auto w-full max-w-3xl space-y-5 px-12 pt-6">
            <Skeleton className="size-16 rounded-xl" />
            <Skeleton className="h-10 w-2/3" />
            <div className="space-y-2.5 pt-4">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
