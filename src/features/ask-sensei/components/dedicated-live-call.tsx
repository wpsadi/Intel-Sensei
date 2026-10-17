import { AudioLines, Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { LiveCall } from '@/ai/inference/call'
import { createGeneralTools } from '@/ai/tools/general'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type DedicatedLiveState = 'idle' | 'connecting' | 'live'

/**
 * A small, scoped Gemini Live call for embedded widgets. Its audio lifecycle belongs to `scope`; changing the
 * document, page or chat calls stop before the old scope can leak into the next one.
 */
export function useDedicatedLiveCall(scope: string | null, session = scope ?? 'widget') {
  const [state, setState] = useState<DedicatedLiveState>('idle')
  const [muted, setMuted] = useState(false)
  const call = useRef<LiveCall | null>(null)
  const activeScope = useRef<string | null>(null)

  useEffect(() => {
    if (activeScope.current !== null && activeScope.current !== scope) void call.current?.stop()
    activeScope.current = scope
    return () => {
      if (activeScope.current === scope) {
        activeScope.current = null
        void call.current?.stop()
      }
    }
  }, [scope])

  useEffect(() => () => void call.current?.stop(), [])

  const start = async () => {
    if (!scope || call.current) return
    setState('connecting')
    setMuted(false)
    const instance = new LiveCall({
      onChange: (next, error) => {
        if (next === 'idle') {
          if (call.current === instance) call.current = null
          setState('idle')
          if (error) toast.error(error)
        } else setState('live')
      },
      onTranscript: () => {},
      tools: createGeneralTools({ session }),
      instructions:
        'You are the dedicated voice assistant inside an embedded Sensei widget. Keep responses concise and conversational. Stay focused on the document or drawing currently open in this widget. Do not claim an edit happened unless a tool confirms it.',
    })
    call.current = instance
    try {
      await instance.start()
    } catch (error) {
      call.current = null
      setState('idle')
      toast.error(error instanceof Error ? error.message : 'Could not start the live call.')
    }
  }

  const end = () => void call.current?.stop()
  const toggleMute = () => {
    const next = !muted
    call.current?.setMuted(next)
    setMuted(next)
  }
  const level = useCallback(() => call.current?.level() ?? 0, [])
  return { state, muted, start, end, toggleMute, level }
}

/** Compact in-widget Gemini Live control with an audio-reactive aurora, never a page-level overlay. */
export function DedicatedLiveCall({ scope, session }: { scope: string | null; session?: string }) {
  const live = useDedicatedLiveCall(scope, session)
  const aurora = useRef<HTMLDivElement>(null)
  const level = live.level

  useEffect(() => {
    if (live.state !== 'live') return
    let frame = 0
    let smooth = 0
    const tick = () => {
      const volume = level()
      smooth = volume > smooth ? volume : smooth * 0.9 + volume * 0.1
      aurora.current?.style.setProperty('--live-level', smooth.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [live.state, level])

  // A widget without a live scope has no Gemini Live session to attach to.
  // Keep the control out of the toolbar instead of showing a disabled phone button.
  if (!scope) return null

  if (live.state === 'idle')
    return (
      <Button
        variant="secondary"
        size="icon-sm"
        className="rounded-full"
        aria-label="Start Gemini Live call"
        title="Start Gemini Live call"
        onClick={() => void live.start()}
      >
        <AudioLines />
      </Button>
    )

  return (
    <div
      ref={aurora}
      className="relative flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/5 px-0.5 shadow-[0_0_calc(12px+24px*var(--live-level))_hsl(var(--primary)/.35)]"
    >
      <span
        className={cn('pointer-events-none absolute inset-0 rounded-full opacity-70 blur-md', live.state === 'live' && 'animate-pulse')}
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / calc(.15 + .45 * var(--live-level))) 0%, transparent 72%)' }}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={live.muted ? 'Unmute Gemini Live' : 'Mute Gemini Live'}
        title={live.muted ? 'Unmute' : 'Mute'}
        onClick={live.toggleMute}
        disabled={live.state !== 'live'}
      >
        {live.muted ? <MicOff /> : <Mic />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-destructive hover:text-destructive"
        aria-label="End Gemini Live call"
        title="End Gemini Live call"
        onClick={live.end}
      >
        {live.state === 'connecting' ? <Phone /> : <PhoneOff />}
      </Button>
    </div>
  )
}
