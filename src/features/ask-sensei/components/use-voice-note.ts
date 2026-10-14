import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { transcribeAudio } from '@/ai/inference/transcribe'

/** `text` is typing, `voice` is a recording, `transcribing` is a recording being sent to Gemini. */
type ComposerMode = 'text' | 'voice' | 'transcribing'

/** One microphone session: the recorder that keeps the audio, and the analyser that drives the waveform. */
interface VoiceSession {
  stream: MediaStream
  recorder: MediaRecorder
  context: AudioContext
  timer: number
  discard: boolean
}

/** Elapsed time as m:ss, used by the recording bar. */
export const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * Voice typing for a message box: records from the microphone with a live waveform, then sends the audio to
 * Gemini for transcription and appends the text to the draft. Used by the Ask Sensei composer and the S-Note widget.
 */
export function useVoiceNote(draft: string, setDraft: (text: string) => void) {
  const [mode, setMode] = useState<ComposerMode>('text')
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const session = useRef<VoiceSession | null>(null)
  const draftBeforeVoice = useRef('')

  // Counts up while a voice note is recording.
  useEffect(() => {
    if (mode !== 'voice') return
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [mode])

  /** Stops the microphone, the level sampler and the audio context. The recorder is stopped by the caller. */
  const release = (current: VoiceSession) => {
    window.clearInterval(current.timer)
    current.stream.getTracks().forEach((track) => track.stop())
    void current.context.close()
    if (session.current === current) session.current = null
  }

  // Release the microphone if the composer goes away mid-recording.
  useEffect(
    () => () => {
      const current = session.current
      if (!current) return
      current.discard = true
      if (current.recorder.state !== 'inactive') current.recorder.stop()
      release(current)
    },
    [],
  )

  const startVoice = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return toast('This browser cannot record voice notes')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return toast('Microphone access is needed for voice typing')
    }

    const recorder = new MediaRecorder(stream)
    const context = new AudioContext()
    // Browsers can start an AudioContext suspended, which leaves the waveform flat.
    void context.resume()
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const chunks: Blob[] = []

    const current: VoiceSession = {
      stream,
      recorder,
      context,
      discard: false,
      // Samples the microphone every 120ms and turns its loudness into a bar height.
      timer: window.setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2
        const loudness = Math.sqrt(sum / samples.length)
        setLevels((prev) => [...prev.slice(-299), Math.min(24, 2 + loudness * 60)])
      }, 120),
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = async () => {
      release(current)
      if (current.discard) return
      setMode('transcribing')
      try {
        const text = await transcribeAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
        const base = draftBeforeVoice.current.trim()
        setDraft([base, text].filter(Boolean).join(' '))
      } catch (error) {
        setDraft(draftBeforeVoice.current)
        toast(error instanceof Error ? error.message : 'Voice typing failed')
      } finally {
        setMode('text')
      }
    }

    session.current = current
    draftBeforeVoice.current = draft
    setLevels([])
    setSeconds(0)
    setMode('voice')
    // Hand over audio every 250ms, so a recording is never empty even if stop is slow.
    recorder.start(250)
  }

  // Finish sends the recording for transcription. Cancel throws it away and restores the draft.
  const finishVoice = () => {
    const current = session.current
    if (current && current.recorder.state !== 'inactive') current.recorder.stop()
  }

  const cancelVoice = () => {
    const current = session.current
    if (current) {
      current.discard = true
      if (current.recorder.state !== 'inactive') current.recorder.stop()
      release(current)
    }
    setDraft(draftBeforeVoice.current)
    setMode('text')
  }

  return { mode, seconds, levels, startVoice, finishVoice, cancelVoice }
}
