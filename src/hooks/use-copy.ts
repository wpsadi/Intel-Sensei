import { useEffect, useRef, useState } from 'react'

import { copyText } from '@/lib/clipboard'

/** Copies text and reports `copied` for a moment afterwards, so a copy button can say "Copied". */
export function useCopy(duration = 1500) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async (text: string) => {
    if (!(await copyText(text))) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), duration)
  }
  return { copied, copy }
}
