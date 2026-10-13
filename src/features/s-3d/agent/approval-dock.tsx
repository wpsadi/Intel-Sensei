import { ShieldQuestionIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { type ApprovalAnswer, settle, useApprovals } from './modes'

const short = (args: unknown) => {
  const text = JSON.stringify(args, null, 1) ?? ''
  return text.length > 400 ? `${text.slice(0, 400)}…` : text
}

/** The agent asking permission (edit mode) for a change, above the chat box. "Always" is remembered for this file. */
export function ApprovalDock({ chatId }: { chatId: string }) {
  const pending = useApprovals((s) => s.queue.find((p) => p.request.chatId === chatId))
  if (!pending) return null
  const { request } = pending
  const answer = (a: ApprovalAnswer) => settle(pending, a)
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 font-medium"><ShieldQuestionIcon className="size-4 text-muted-foreground" />Allow “{request.label}”?</div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Details</summary>
        <ScrollArea className="mt-1 [&>[data-slot=scroll-area-viewport]]:max-h-32">
          <pre className="whitespace-pre-wrap">{short(request.args)}</pre>
        </ScrollArea>
      </details>
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" onClick={() => answer('once')}>Allow once</Button>
        <Button size="xs" variant="outline" onClick={() => answer('file')}>Always for this file</Button>
        <Button size="xs" variant="ghost" onClick={() => answer('deny')}>Deny</Button>
      </div>
    </div>
  )
}
