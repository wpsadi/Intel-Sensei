import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Context, ContextContent, ContextContentBody, ContextContentHeader, ContextTrigger } from '@/components/ai-elements/context'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact' })

/** How full an agent's context window is, as the ring and percentage used in Ask Sensei, with compactions noted. */
export function ContextRing({ used, max, modelId, compactions = 0, onCompact, compactDisabled }: { used: number; max: number; modelId?: string; compactions?: number; onCompact?: () => Promise<unknown>; compactDisabled?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Context usedTokens={used} maxTokens={max} modelId={modelId as never}>
      <ContextTrigger size="sm" className="h-8 px-2" aria-label="Context usage" />
      <ContextContent align="start" side="top" className="w-64">
        <ContextContentHeader />
        <ContextContentBody className="space-y-1 text-xs text-muted-foreground">
          <p>{compact.format(used)} of {compact.format(max)} tokens in the last model call.</p>
          <p>Older messages are summarized automatically at 80% so long runs keep going{compactions ? ` (compacted ${compactions}×)` : ''}.</p>
          {onCompact && (
            <Button size="xs" variant="outline" className="mt-2 w-full" disabled={busy || !!compactDisabled} title={compactDisabled} onClick={async () => {
              setBusy(true)
              try {
                await onCompact()
                toast.success('Conversation compacted')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e))
              } finally {
                setBusy(false)
              }
            }}>{busy ? 'Compacting…' : compactDisabled ?? 'Compact'}</Button>
          )}
        </ContextContentBody>
      </ContextContent>
    </Context>
  )
}
