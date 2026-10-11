import { cn } from '@/lib/utils'

/** Three bouncing dots, shown while a chat is generating. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span role="status" aria-label="Generating" className={cn('inline-flex items-end gap-0.5', className)}>
      {[0, 150, 300].map((delay) => <span key={delay} className="size-1 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${delay}ms` }} />)}
    </span>
  )
}
