import { useState } from 'react'
import { create } from 'zustand'
import { ArrowUpIcon, CheckIcon } from 'lucide-react'
import senseiLogo from '@/assets/sensei.svg'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Thumb } from '../discover/discover-dialog'

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
const useAsk = create<{ queue: Pending[] }>()(() => ({ queue: [] }))

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

function answer(a: AskAnswer) {
  const p = useAsk.getState().queue[0]
  if (p) settle(p, a)
}

/** Sensei asking the user to pick: a large centred modal with option cards and a box to tell Sensei something else. */
export function SenseiAskModal() {
  const request = useAsk((s) => s.queue[0]?.request ?? null)
  const [picked, setPicked] = useState<string[]>([])
  const [text, setText] = useState('')
  const [shown, setShown] = useState<AskRequest | null>(null)
  if (request !== shown) {
    setShown(request)
    setPicked([])
    setText('')
  }
  if (!request) return null
  const withImages = request.options.some((o) => o.image)

  const pick = (id: string) => {
    if (!request.multiple) return answer({ chosen: [id], ...(text.trim() && { message: text.trim() }) })
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  const send = () => {
    if (!picked.length && !text.trim()) return
    answer({ chosen: picked, ...(text.trim() && { message: text.trim() }) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && answer({ dismissed: true })}>
      <DialogContent className="flex h-[88vh] w-[min(1100px,94vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <div className="flex items-start gap-3 border-b px-6 py-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10">
            <img src={senseiLogo} alt="" className="size-5 brightness-0 dark:invert" />
          </div>
          <div className="min-w-0 pr-8">
            <DialogTitle className="text-base">Sensei asks</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-foreground">{request.question}</DialogDescription>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className={cn('grid gap-3 p-6', withImages ? 'grid-cols-[repeat(auto-fill,minmax(190px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(260px,1fr))]')}>
            {request.options.map((o) => {
              const on = picked.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(o.id)}
                  className={cn('group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary hover:shadow-md', on && 'border-primary ring-2 ring-primary/40')}
                >
                  {withImages && (
                    <div className="aspect-square bg-muted">
                      <Thumb src={o.image} />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-medium">{o.label}</div>
                    {o.description && <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">{o.description}</div>}
                  </div>
                  {on && <CheckIcon className="absolute top-2 right-2 size-5 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                </button>
              )
            })}
          </div>
        </ScrollArea>
        <form className="flex items-center gap-2 border-t px-6 py-4" onSubmit={(e) => { e.preventDefault(); send() }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={request.multiple ? 'Pick any, and/or tell Sensei something…' : 'None of these? Tell Sensei what you want…'} className="flex-1" />
          {request.multiple && picked.length > 0 && <span className="text-xs text-muted-foreground">{picked.length} selected</span>}
          <Button type="submit" disabled={!picked.length && !text.trim()}><ArrowUpIcon /> Send</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
