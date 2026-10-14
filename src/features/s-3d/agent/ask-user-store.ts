import { create } from 'zustand'

export interface AskOption {
  id: string
  label: string
  description?: string
  image?: string
}

export interface AskRequest {
  question: string
  options: AskOption[]
  multiple?: boolean
}

/** What the user answered: picked option ids and/or something they typed to Sensei, or dismissed. */
export type AskAnswer = { chosen: string[]; message?: string } | { dismissed: true }

type Pending = { request: AskRequest; resolve: (a: AskAnswer) => void }

/** Questions wait in line: several agent runs can each ask one, and the chooser shows them one at a time. */
export const useAsk = create<{ queue: Pending[] }>()(() => ({ queue: [] }))

const settle = (p: Pending, a: AskAnswer) => {
  useAsk.setState((s) => ({ queue: s.queue.filter((x) => x !== p) }))
  p.resolve(a)
}

/** Opens the chooser (after any questions already waiting) and waits for the user. Aborting `signal` withdraws the question. */
export function askUser(request: AskRequest, signal?: AbortSignal): Promise<AskAnswer> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ dismissed: true })
    const p: Pending = { request, resolve }
    useAsk.setState((s) => ({ queue: [...s.queue, p] }))
    signal?.addEventListener('abort', () => settle(p, { dismissed: true }), { once: true })
  })
}

export function answer(a: AskAnswer) {
  const p = useAsk.getState().queue[0]
  if (p) settle(p, a)
}
