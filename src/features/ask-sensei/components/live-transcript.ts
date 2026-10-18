import { useEffect, useRef, useState } from 'react'

/** One side's words in the call so far, under the id of the chat message that holds them. */
export interface TranscriptTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
}

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
          await write(turn)
        } catch (error) {
          console.warn('Could not save the live transcript', error)
        }
      }
    } finally {
      flushing = false
    }
  }

  return {
    /** Adds a piece. `whole` marks a complete message, such as typed text, so it never merges into the turn around it. */
    push(kind: 'user' | 'assistant' | 'thought', piece: string, whole = false) {
      // Thinking is not part of what was said.
      if (kind === 'thought') return
      if (whole) current = null
      // Blank transcription, such as the mic hearing silence, must not cut the other side's turn in two.
      if (!piece.trim() && current?.role !== kind) return
      current = {
        id: current?.role === kind ? current.id : crypto.randomUUID(),
        role: kind,
        text: `${current?.role === kind ? current.text : ''}${piece}`,
      }
      latest = current
      void flush()
      if (whole) current = null
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
