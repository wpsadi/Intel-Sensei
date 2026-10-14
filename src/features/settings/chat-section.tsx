import { ClockIcon, type LucideIcon, NavigationIcon } from 'lucide-react'
import { useState } from 'react'

import { SEND_MODE, type SendMode } from '@/ai/send-mode'
import { cn } from '@/lib/utils'

const OPTIONS: { id: SendMode; name: string; icon: LucideIcon; text: string }[] = [
  {
    id: 'queue',
    name: 'Queue',
    icon: ClockIcon,
    text: 'A message sent while a reply is running waits in line and is sent when the reply ends.',
  },
  {
    id: 'steer',
    name: 'Steer',
    icon: NavigationIcon,
    text: 'A message sent while a reply is running goes into it at its next step, so the reply changes course right away. If the reply ends first, it is sent like a queued one.',
  },
]

/** What sending a message does while Sensei is still replying. It applies to Ask Sensei, S-Note, S3D and S-Design. */
export function ChatSection() {
  const [mode, setMode] = useState(() => SEND_MODE.value)

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Choose what happens when you send a message while Sensei is still replying. It applies to Ask Sensei, S-Note, S3D and S-Design. Stop
        still cancels the reply.
      </p>
      <section className="flex flex-col gap-2 border p-4" role="radiogroup" aria-label="Send behaviour">
        <h3 className="text-sm font-medium">Sending during a reply</h3>
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            onClick={() => {
              SEND_MODE.value = option.id
              setMode(option.id)
            }}
            className={cn(
              'flex items-start gap-3 border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
              mode === option.id ? 'border-primary bg-muted' : 'hover:bg-muted/50',
            )}
          >
            <option.icon className="mt-0.5 size-4 shrink-0" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{option.name}</span>
              <span className="text-xs text-muted-foreground">{option.text}</span>
            </span>
          </button>
        ))}
      </section>
    </div>
  )
}
