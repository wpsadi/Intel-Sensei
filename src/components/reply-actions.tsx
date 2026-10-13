import { Check, Copy, Loader2, Square, Volume2 } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useReadAloud } from '@/features/ask-sensei/components/use-read-aloud'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

/** One icon button with a tooltip, for the row under a reply. */
export function ReplyAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** How long the green tick stays after copying before the copy icon comes back. */
const COPIED_MS = 800

/** A copy button that turns into a green tick for a moment after copying, instead of showing a toast. A failed copy still says so. */
function CopyAction({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    if (!(await copyText(text))) return void toast('Could not copy')
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <ReplyAction label={copied ? 'Copied' : label} onClick={() => void copy()}>
      <span className="relative grid size-4 place-items-center">
        <Copy className={cn('col-start-1 row-start-1 transition-all duration-200', copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100')} />
        <Check className={cn('col-start-1 row-start-1 text-green-500 transition-all duration-200', copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} />
      </span>
    </ReplyAction>
  )
}

/**
 * Copy and read aloud for a Sensei reply, in a row under it. `speakId` is the id of the element that holds the
 * reply's rendered text: that text is what is read, and the word being spoken is highlighted inside it.
 * `children` adds more buttons to the row, such as trying again.
 */
export function ReplyActions({ text, speakId, hideCopyAndSpeech, children }: { text: string; speakId: string; hideCopyAndSpeech?: boolean; children?: ReactNode }) {
  const { state, toggle } = useReadAloud()
  const reading = state?.id === speakId ? state.status : null

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 text-muted-foreground">
        {!hideCopyAndSpeech && (
          <>
            <CopyAction label="Copy response" text={text} />
            <ReplyAction label={reading ? 'Stop reading' : 'Read aloud'} onClick={() => void toggle(speakId)}>
              {reading === 'loading' ? <Loader2 className="animate-spin" /> : reading ? <Square /> : <Volume2 />}
            </ReplyAction>
          </>
        )}
        {children}
      </div>
    </TooltipProvider>
  )
}

/** Just a copy button, in a row under the user's own message. It shows while the pointer is over the message (a parent with the `group/user` class) or the button has focus. */
export function CopyMessage({ text, className }: { text: string; className?: string }) {
  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100', className)}>
        <CopyAction label="Copy message" text={text} />
      </div>
    </TooltipProvider>
  )
}
