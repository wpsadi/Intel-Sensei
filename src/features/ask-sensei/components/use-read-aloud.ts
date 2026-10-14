import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { generateReplySpeech } from '@/ai/inference/speech'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'

const HIGHLIGHT = 'tts-word'

/** How long a generated reply's audio is kept for replaying without another request. */
const CACHE_TTL_MS = 10 * 60 * 1000
const audioCache = new Map<string, { url: string; timer: ReturnType<typeof setTimeout> }>()

/** Audio for the text, from the cache while it is fresh. The key is the text itself, so an edited or retried reply is never stale. */
async function speechUrl(apiKey: string, text: string, signal: AbortSignal) {
  const hit = audioCache.get(text)
  if (hit) {
    clearTimeout(hit.timer)
    hit.timer = setTimeout(() => evict(text), CACHE_TTL_MS)
    return hit.url
  }
  const url = URL.createObjectURL(await generateReplySpeech(apiKey, text, signal))
  audioCache.set(text, { url, timer: setTimeout(() => evict(text), CACHE_TTL_MS) })
  return url
}

function evict(text: string) {
  const entry = audioCache.get(text)
  if (!entry) return
  clearTimeout(entry.timer)
  URL.revokeObjectURL(entry.url)
  audioCache.delete(text)
}

/** Stops whichever reply is playing, so starting another reply cuts the first off. */
let stopCurrent: () => void = () => {}

type Word = { start: number; end: number; node: Text; from: number; to: number }

/** Every word in the element's rendered text, with the text node and offsets it sits at. */
function collectWords(root: HTMLElement) {
  const words: Word[] = []
  let text = ''
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (const match of node.data.matchAll(/\S+/g)) {
      const from = match.index
      const to = from + match[0].length
      words.push({ start: text.length, end: text.length + match[0].length, node, from, to })
      text += match[0] + ' '
    }
  }
  return { words, text: text.trim() }
}

/**
 * Reads a message aloud with Gemini speech. One message plays at a time; calling it again for the playing message stops it.
 * Gemini gives no word timings, so the spoken word is estimated from the playback position by how long each word is.
 * The word is marked with the CSS Custom Highlight API, which leaves the rendered markdown untouched.
 */
export function useReadAloud() {
  const [state, setState] = useState<{ id: string; status: 'loading' | 'playing' } | null>(null)
  const stopRef = useRef<() => void>(() => {})

  const clear = () => (CSS as { highlights?: Map<string, unknown> }).highlights?.delete(HIGHLIGHT)

  const stop = useCallback(() => {
    stopRef.current()
    stopRef.current = () => {}
    clear()
    setState(null)
  }, [])

  useEffect(() => stop, [stop])

  const toggle = useCallback(
    async (id: string) => {
      const wasThis = state?.id === id
      stopCurrent()
      if (wasThis) return
      const root = document.getElementById(id)
      if (!root) return
      const apiKey = GEMINI_KEY.value
      if (!apiKey) return void toast('Add your Gemini API key in Settings to read aloud')
      const { words, text } = collectWords(root)
      if (!text) return

      const controller = new AbortController()
      let audio: HTMLAudioElement | null = null
      let frame = 0
      stopRef.current = () => {
        controller.abort()
        cancelAnimationFrame(frame)
        audio?.pause()
      }
      stopCurrent = stop
      setState({ id, status: 'loading' })
      try {
        const url = await speechUrl(apiKey, text, controller.signal)
        if (controller.signal.aborted) return
        audio = new Audio(url)
        audio.onended = stop
        await audio.play()
        setState({ id, status: 'playing' })

        // A word's share of the audio follows its length, with a little extra for the pause after it.
        const weights = words.map((word) => word.end - word.start + 2)
        const total = weights.reduce((sum, weight) => sum + weight, 0)
        const highlights = (CSS as { highlights?: Map<string, unknown> }).highlights
        const tick = () => {
          if (!audio || !audio.duration) return void (frame = requestAnimationFrame(tick))
          let target = (audio.currentTime / audio.duration) * total
          const index = weights.findIndex((weight) => (target -= weight) < 0)
          const word = words[index === -1 ? words.length - 1 : index]
          const range = new Range()
          range.setStart(word.node, word.from)
          range.setEnd(word.node, word.to)
          if (highlights && 'Highlight' in window)
            highlights.set(HIGHLIGHT, new (window as unknown as { Highlight: new (r: Range) => unknown }).Highlight(range))
          frame = requestAnimationFrame(tick)
        }
        tick()
      } catch (error) {
        if (controller.signal.aborted) return
        stop()
        toast(`Could not read aloud${error instanceof Error ? `: ${error.message}` : ''}`)
      }
    },
    [state, stop],
  )

  return { state, toggle }
}
