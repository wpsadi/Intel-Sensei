import type { Tool } from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { LiveCall } from '@/ai/inference/call'
import { createGeneralTools } from '@/ai/tools/general'
import type { AgentProgress } from '@/ai/tools/progress'
import { withAttachmentNote } from '@/ai/utils/file-mentions'
import { describeToolCall } from '@/ai/utils/tool-steps'
import type { ChatAttachment, ChatToolStep } from '@/features/note/db/types'

type DedicatedLiveState = 'idle' | 'connecting' | 'live'

/** Where a running call listens for progress from a background tool, by the session of the widget it runs in. */
const progressSinks = new Map<string, (id: string, progress: AgentProgress) => void>()

/**
 * Hands a progress update from a background tool (the deep answer) to the live call of `session`, so the voice model can
 * say what is happening while the work goes on. Does nothing when no call is running there.
 */
export const reportLiveProgress = (session: string, id: string, progress: AgentProgress) => progressSinks.get(session)?.(id, progress)

export interface DedicatedLiveOptions {
  /** The sandbox and progress channel of this widget. Defaults to the scope. */
  session?: string
  /** The chat so far, as "User:/Sensei:" lines. */
  history?: string
  /** What is said in the call. `whole` marks a complete message, such as typed text. */
  onTranscript?: (role: 'user' | 'assistant' | 'thought', text: string, whole?: boolean, attachments?: ChatAttachment[]) => void
  /** A tool call began or ended, so the chat can show what the call is doing. */
  onTool?: (step: ChatToolStep) => void
  tools?: Record<string, Tool>
  instructions?: string
  /** The files attached to this chat so far; they are put in the sandbox before each command. */
  attachments?: () => ChatAttachment[]
}

/**
 * A small, scoped Gemini Live call for embedded widgets. Its audio lifecycle belongs to `scope`; changing the
 * document, page or chat calls stop before the old scope can leak into the next one. The widget's composer shows it:
 * the controls live there and the panel's aurora follows `level()`.
 */
export function useDedicatedLiveCall(scope: string | null, options: DedicatedLiveOptions = {}) {
  const { history = '', tools, instructions, attachments } = options
  const session = options.session ?? scope ?? 'widget'
  const [state, setState] = useState<DedicatedLiveState>('idle')
  const [muted, setMuted] = useState(false)
  const call = useRef<LiveCall | null>(null)
  const activeScope = useRef<string | null>(null)
  // The call outlives the render that started it, so the transcript handler is read from here, not captured at start.
  const transcript = useRef(options.onTranscript)
  const toolSteps = useRef(options.onTool)
  useEffect(() => {
    transcript.current = options.onTranscript
    toolSteps.current = options.onTool
  })
  useEffect(() => {
    progressSinks.set(session, (id, progress) => call.current?.reportToolProgress(id, progress))
    return () => void progressSinks.delete(session)
  }, [session])

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
      tools: { ...createGeneralTools({ session, attachments }), ...tools },
      onTranscript: (role, piece) => transcript.current?.(role, piece),
      onTool: (event) => {
        const { label, detail } = describeToolCall(event.name, event.args)
        toolSteps.current?.({
          id: event.id,
          name: event.name,
          label,
          status: event.status,
          detail: event.status === 'failed' ? event.error : (event.result ?? detail),
        })
      },
      // The deep answer runs in the background, so the voice keeps talking and hears its progress.
      nonBlocking: ['deepAnswer'],
      // Tasks need exact tool use, so these calls think harder than a chat call before they act.
      thinkingLevel: 'high',
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
  const sendText = (text: string, files: ChatAttachment[] = []) => {
    call.current?.sendText(withAttachmentNote(text || 'I attached some files.', files))
    transcript.current?.('user', text, true, files)
  }
  /** How loud Sensei's voice is, 0 to 1. */
  const level = useCallback(() => call.current?.level() ?? 0, [])
  return { state, muted, start, end, toggleMute, sendText, level }
}
