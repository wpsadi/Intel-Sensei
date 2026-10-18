import { useEffect, useRef, useState } from 'react'

import type { ChatAttachment, ChatToolStep } from '@/features/note/db/types'

/** One side's words in the call so far, under the id of the chat message that holds them. */
export interface TranscriptTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Files attached to a typed message. */
  attachments?: ChatAttachment[]
  /** Sensei's thinking before and during this reply, when the model sends it. */
  reasoning?: string
  /** The tool calls Sensei made in this reply, in order. */
  steps?: ChatToolStep[]
}

/** The fields of a turn that are not its words, ready to spread into a saved message: only those that are there. */
export const turnExtras = (turn: TranscriptTurn) => ({
  ...(turn.reasoning && { reasoning: turn.reasoning }),
  ...(turn.steps && { steps: turn.steps }),
})

/**
 * Turns the call's stream of spoken pieces into messages. Each turn keeps its whole text in memory, so the host only has
 * to save "message `id` now says this", with no read-modify-write of the stored chat per piece. Saves run one at a time
 * and a busy save skips to the latest text, so a fast stream can neither reorder nor pile up.
 */
export function createLiveTranscript(write: (turn: TranscriptTurn) => void | Promise<void>) {
  let current: TranscriptTurn | null = null
  let latest: TranscriptTurn | null = null
  let flushing = false

  const flush = async () => {
    if (flushing) return
    flushing = true
    try {
      while (latest) {
        const turn = latest
        latest = null
        try {
          // The thinking is kept as it came; it is saved trimmed, and a step's position counts from its trimmed start.
          await write({ ...turn, ...(turn.reasoning && { reasoning: turn.reasoning.trim() }) })
        } catch (error) {
          console.warn('Could not save the live transcript', error)
        }
      }
    } finally {
      flushing = false
    }
  }

  return {
    /**
     * Adds a piece. `whole` marks a complete message, such as typed text, so it never merges into the turn around it.
     * Thinking belongs to Sensei's reply, so it joins the reply that is being written, or starts one.
     */
    push(kind: 'user' | 'assistant' | 'thought', piece: string, whole = false, attachments?: ChatAttachment[]) {
      const role = kind === 'thought' ? 'assistant' : kind
      if (whole) current = null
      // Blank transcription, such as the mic hearing silence, must not cut the other side's turn in two.
      if (!piece.trim() && !attachments?.length && current?.role !== role) return
      const turn: TranscriptTurn = current?.role === role ? current : { id: crypto.randomUUID(), role, text: '' }
      current = {
        ...turn,
        ...(kind === 'thought' ? { reasoning: `${turn.reasoning ?? ''}${piece}` } : { text: `${turn.text}${piece}` }),
        ...(attachments?.length && { attachments }),
      }
      latest = current
      void flush()
      if (whole) current = null
    },
    /** A tool call began or ended. It is part of Sensei's reply, and the call is placed where it fell in the thinking. */
    tool(step: ChatToolStep) {
      const turn: TranscriptTurn = current?.role === 'assistant' ? current : { id: crypto.randomUUID(), role: 'assistant', text: '' }
      const known = turn.steps?.find((item) => item.id === step.id)
      const placed = { ...step, at: known?.at ?? turn.reasoning?.trimStart().length ?? 0 }
      current = {
        ...turn,
        steps: known ? turn.steps!.map((item) => (item.id === step.id ? placed : item)) : [...(turn.steps ?? []), placed],
      }
      latest = current
      void flush()
    },
    /** Starts the next piece as a new message, for a new chat or a new call. */
    reset() {
      current = null
    },
  }
}

/** A transcript that keeps its identity across renders but always saves through the latest `write`. */
export function useLiveTranscript(write: (turn: TranscriptTurn) => void | Promise<void>) {
  const writeRef = useRef(write)
  useEffect(() => {
    writeRef.current = write
  })
  const [transcript] = useState(() => createLiveTranscript((turn) => writeRef.current(turn)))
  return transcript
}

/**
 * The scope a widget gives its live call. A call that starts with no chat creates one as soon as it is spoken to, and the
 * chat id then enters the widget's state. Calling that a new scope would end the call that made it, so a chat the call
 * adopted keeps the scope it started with until the call ends.
 */
export function useLiveChatScope(chatId: string | null) {
  const adopted = useRef<string | null>(null)
  return {
    chat: chatId && chatId === adopted.current ? 'new' : (chatId ?? 'new'),
    adopt: (id: string) => void (adopted.current = id),
    release: () => void (adopted.current = null),
  }
}
