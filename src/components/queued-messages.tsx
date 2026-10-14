import { ClockIcon, NavigationIcon, XIcon } from 'lucide-react'

import { removePending, useSendQueue } from '@/ai/send-queue'
import { Button } from '@/components/ui/button'

/** Messages sent while a reply runs: queued ones wait for it to end, steering ones are being taken into it. */
export function QueuedMessages({ chatId }: { chatId: string | null }) {
  const items = useSendQueue((state) => (chatId ? state.items[chatId] : undefined))
  if (!chatId || !items?.length) return null
  return (
    <ul className="flex flex-col gap-1" aria-label="Queued messages">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 border bg-muted/40 px-2 py-1 text-xs">
          {item.steer ? <NavigationIcon className="size-3 shrink-0" /> : <ClockIcon className="size-3 shrink-0" />}
          <span className="shrink-0 text-muted-foreground">{item.steer ? 'Steering' : 'Queued'}</span>
          <span className="min-w-0 flex-1 truncate">{item.text || item.attachments?.map((file) => file.name).join(', ')}</span>
          {/* A steering message may already be on its way to the model, so only queued ones can be taken back. */}
          {!item.steer && (
            <Button variant="ghost" size="icon-xs" aria-label="Remove queued message" onClick={() => removePending(chatId, item.id)}>
              <XIcon />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
