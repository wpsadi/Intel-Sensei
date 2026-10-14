import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { ChatTurn } from '@/ai/utils/messages'
import { Button } from '@/components/ui/button'
import { Bubble, Marker, MarkerContent, Message, MessageContent } from '@/components/ui/chat'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

const QUESTIONS = ['hello', "What's the age of the universe?"]

type Entry = { role: 'user' | 'assistant' | 'error'; content: string }

/** Plays a short two-question conversation with the key passed in, so the key can be checked before saving. */
export function ProviderTestDialog({
  provider,
  model,
  chat,
  open,
  onOpenChange,
}: {
  provider: string
  model: string
  /** Streams a reply to the conversation so far, calling `onText` as it grows. */
  chat: (history: ChatTurn[], onText: (soFar: string) => void) => Promise<string>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true

    const run = async () => {
      setEntries([])
      setBusy(true)
      const history: ChatTurn[] = []
      for (const question of QUESTIONS) {
        history.push({ role: 'user', content: question })
        // Add the question and an empty reply bubble; the reply fills in as chunks arrive.
        setEntries((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '' }])
        try {
          const reply = await chat(history, (soFar) => {
            if (alive) setEntries((prev) => prev.map((entry, index) => (index === prev.length - 1 ? { ...entry, content: soFar } : entry)))
          })
          if (!alive) return
          history.push({ role: 'assistant', content: reply })
        } catch (error) {
          if (!alive) return
          setEntries((prev) => [...prev.slice(0, -1), { role: 'error', content: (error as Error).message }])
          break
        }
      }
      if (alive) setBusy(false)
    }

    run()
    return () => {
      alive = false
    }
    // oxlint-disable-next-line react/exhaustive-deps -- `chat` is a new closure every render; a run starts only when the dialog opens
  }, [open])

  // Show the typing marker until the first chunk of the reply arrives.
  const last = entries.at(-1)
  const awaitingReply = busy && last?.role === 'assistant' && last.content === ''

  // Keep the newest message in view as the conversation grows.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries, awaitingReply])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{busy ? `Testing ${provider}` : 'Test Done'}</DialogTitle>
          <DialogDescription>Model: {model}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-80 pr-3">
          <div className="flex flex-col gap-3 py-2">
            {entries.map((entry, index) =>
              entry.role === 'assistant' && !entry.content ? null : (
                <Message key={index} align={entry.role === 'user' ? 'end' : 'start'}>
                  <MessageContent>
                    <Bubble variant={entry.role === 'user' ? 'default' : entry.role === 'error' ? 'destructive' : 'muted'}>
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
                      </div>
                    </Bubble>
                  </MessageContent>
                </Message>
              ),
            )}
            {awaitingReply && (
              <Marker>
                <MarkerContent>{provider} is typing…</MarkerContent>
              </Marker>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <DialogFooter className="items-center sm:justify-between">
          <Button variant="outline" size="sm" disabled className="font-mono">
            status: {busy ? 'running' : 'done'}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
