import { type KeyboardEvent, useState } from 'react'

import { useSendQueue } from '@/ai/send-queue'

export function useInputHistory({
  history,
  chatId,
  scope = chatId,
  draft,
  setDraft,
}: {
  history: readonly string[]
  chatId?: string | null
  scope?: string | null
  draft: string
  setDraft: (text: string) => void
}) {
  const pending = useSendQueue((state) => (chatId ? state.items[chatId] : undefined))
  const texts = [...history, ...(pending ?? []).map((message) => message.text)].filter((text) => text.trim())
  const [position, setPosition] = useState<{ scope: typeof scope; index: number; stash: string } | null>(null)
  const recalled = position?.scope === scope ? position : null
  const reset = () => setPosition(null)

  return {
    active: recalled !== null,
    reset,
    onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (event.nativeEvent.isComposing || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false
      const input = event.currentTarget
      if (input.selectionStart !== input.selectionEnd) return false
      const show = (text: string) => {
        setDraft(text)
        requestAnimationFrame(() => input.setSelectionRange(text.length, text.length))
      }
      if (event.key === 'ArrowUp' && texts.length && (!draft.slice(0, input.selectionStart).includes('\n') || recalled)) {
        event.preventDefault()
        const index = recalled ? Math.max(0, Math.min(recalled.index - 1, texts.length - 1)) : texts.length - 1
        setPosition({ scope, index, stash: recalled?.stash ?? draft })
        show(texts[index])
        return true
      }
      if (event.key === 'ArrowDown' && recalled && input.selectionStart === draft.length) {
        event.preventDefault()
        if (recalled.index >= texts.length - 1) {
          show(recalled.stash)
          reset()
        } else {
          setPosition({ ...recalled, index: recalled.index + 1 })
          show(texts[recalled.index + 1])
        }
        return true
      }
      return false
    },
  }
}
