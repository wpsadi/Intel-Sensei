import { AudioLines, Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { LiveCall } from '@/ai/inference/call'
import { createGeneralTools } from '@/ai/tools/general'
import type { Tool } from 'ai'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type DedicatedLiveState = 'idle' | 'connecting' | 'live'

/**
 * A small, scoped Gemini Live call for embedded widgets. Its audio lifecycle belongs to `scope`; changing the
 * document, page or chat calls stop before the old scope can leak into the next one.
 */
export function useDedicatedLiveCall(
  scope: string | null,
  session = scope ?? 'widget',
  history = '',
  onTranscript?: (role: 'user' | 'assistant' | 'thought', text: string) => void,
  tools?: Record<string, Tool>,
  instructions?: string,
) {
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
      history,
      // Embedded Live must see the same app-specific tools as the text agent. The generic
      // sandbox tools remain available everywhere; callers can add page controls (for example
      // SBrowse's computer tool) through `tools`.
      tools: { ...createGeneralTools({ session }), ...tools },
      onTranscript: (role, piece) => {
        onTranscript?.(role, piece)
      },
      instructions: [
        'You are the dedicated voice assistant inside an embedded Sensei widget. Keep responses concise and conversational. Stay focused on the document or drawing currently open in this widget. Do not claim an edit happened unless a tool confirms it.',
        instructions,
      ]
        .filter(Boolean)
        .join('\n\n'),
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
export function DedicatedLiveCall({
  scope,
  session,
  history,
  onTranscript,
  tools,
  instructions,
}: {
  scope: string | null
  session?: string
  history?: string
  onTranscript?: (role: 'user' | 'assistant' | 'thought', text: string) => void
  /** App-specific tools and live page instructions, kept in parity with the text agent. */
  tools?: Record<string, Tool>
  instructions?: string
}) {
  const live = useDedicatedLiveCall(scope, session, history, onTranscript, tools, instructions)
  const aurora = useRef<HTMLDivElement>(null)
  const level = live.level

  useEffect(() => {
    if (live.state !== 'live') return
    const root = document.documentElement
    let frame = 0
    let smooth = 0
    const tick = () => {
      const volume = level()
      smooth = volume > smooth ? volume : smooth * 0.9 + volume * 0.1
      aurora.current?.style.setProperty('--live-level', smooth.toFixed(3))
      root.style.setProperty('--call-level', smooth.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      root.style.removeProperty('--call-level')
    }
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
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[38vh] opacity-[calc(.18+.5*var(--call-level))] blur-2xl"
        style={{ background: 'radial-gradient(ellipse 70% 80% at 50% 100%, #dbeafe 0%, #60a5fa 32%, #2563eb 62%, transparent 100%)' }}
      />
      <div
        ref={aurora}
        className="relative z-50 flex items-center gap-0.5 rounded-full border border-blue-400/40 bg-blue-500/10 px-0.5 shadow-[0_0_calc(12px+24px*var(--live-level))_rgb(37_99_235_/_0.42)] [--live-level:0]"
      >
      <span
        className={cn('pointer-events-none absolute inset-0 rounded-full opacity-70 blur-md', live.state === 'live' && 'animate-pulse')}
        style={{ background: 'radial-gradient(circle, rgb(59 130 246 / calc(.18 + .52 * var(--live-level))) 0%, rgb(37 99 235 / .08) 45%, transparent 72%)' }}
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
    </>
  )
}
