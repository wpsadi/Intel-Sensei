import { TimerIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

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
