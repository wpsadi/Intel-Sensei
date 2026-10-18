import type { Tool } from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { LiveCall } from '@/ai/inference/call'
import { createGeneralTools } from '@/ai/tools/general'

type DedicatedLiveState = 'idle' | 'connecting' | 'live'

/**
 * A small, scoped Gemini Live call for embedded widgets. Its audio lifecycle belongs to `scope`; changing the
 * document, page or chat calls stop before the old scope can leak into the next one. The widget's composer shows it:
 * the controls live there and the panel's aurora follows `level()`.
 */
export function useDedicatedLiveCall(
  scope: string | null,
  session = scope ?? 'widget',
  history = '',
  onTranscript?: (role: 'user' | 'assistant' | 'thought', text: string, whole?: boolean) => void,
  tools?: Record<string, Tool>,
  instructions?: string,
) {
  const [state, setState] = useState<DedicatedLiveState>('idle')
  const [muted, setMuted] = useState(false)
  const call = useRef<LiveCall | null>(null)
  const activeScope = useRef<string | null>(null)
  // The call outlives the render that started it, so the transcript handler is read from here, not captured at start.
  const transcript = useRef(onTranscript)
  useEffect(() => {
    transcript.current = onTranscript
  })

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
      onTranscript: (role, piece) => transcript.current?.(role, piece),
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
  /** Typed text goes into the call and into the chat as its own message. */
  const sendText = (text: string) => {
    call.current?.sendText(text)
    transcript.current?.('user', text, true)
  }
  /** How loud Sensei's voice is, 0 to 1. */
  const level = useCallback(() => call.current?.level() ?? 0, [])
  return { state, muted, start, end, toggleMute, sendText, level }
}
