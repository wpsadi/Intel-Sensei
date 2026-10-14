import { LoaderCircleIcon, TimerIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { AgentMessage } from '@/features/s-3d/types'

const format = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`)

/**
 * How long a reply took. OpenAI often does not share its thinking, so a long run can look idle; a live
 * "Working for …" timer shows it is busy, and "Worked for …" stays on the reply once it is done.
 */
export function WorkedFor({ startedAt, seconds, running }: { startedAt: number; seconds?: number; running: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  const value = running ? Math.max(0, Math.round((now - startedAt) / 1000)) : seconds
  if (value === undefined) return null
  return (
    <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
      <TimerIcon className="size-3.5" />
      <span className={running ? 'animate-pulse' : undefined}>
        {running ? 'Working for' : 'Worked for'} {format(value)}
      </span>
    </div>
  )
}

/**
 * What the agent is doing right now, at the end of the reply it is writing: the tool that is running, or thinking when
 * none is. It stays until the whole run ends, so the gaps between steps never look like the agent has stopped.
 */
export function WorkingNow({ message }: { message: Pick<AgentMessage, 'steps' | 'reasoning' | 'text'> }) {
  const running = message.steps?.findLast((step) => step.status === 'running')
  const label = running
    ? `${running.label}${running.detail ? ` · ${running.detail}` : ''}…`
    : message.steps?.length
      ? 'Deciding the next step…'
      : message.reasoning
        ? 'Thinking…'
        : message.text
          ? 'Writing…'
          : 'Starting…'
  return (
    <div role="status" className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}
