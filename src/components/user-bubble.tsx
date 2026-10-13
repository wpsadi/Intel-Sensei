import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Markdown } from '@/features/ask-sensei/components/markdown'

const MAX_LINES = 8

/**
 * The user's message in a chat. Long words and URLs wrap instead of overflowing, and a message longer than eight
 * lines is clamped with a bold "See more" so the chat stays readable; the full text is one click away.
 */
export function UserBubble({ text, footer, className, markdown }: { text: string; footer?: ReactNode; className?: string; markdown?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    setLong(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])
  return (
    <div className={cn('ml-8 max-w-full min-w-0 self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground', className)}>
      <div ref={ref} className={cn('[overflow-wrap:anywhere]', markdown ? '[&_a]:underline [&_code]:bg-primary-foreground/15 [&_code]:text-primary-foreground [&_p]:my-0 [&_ul]:marker:text-primary-foreground/70 [&_ol]:marker:text-primary-foreground/70' : 'whitespace-pre-wrap')} style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: MAX_LINES, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {markdown ? <Markdown>{text}</Markdown> : text}
      </div>
      {(long || open) && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-bold underline-offset-2 hover:underline">
          {open ? 'See less' : 'See more'}
        </button>
      )}
      {footer}
    </div>
  )
}
