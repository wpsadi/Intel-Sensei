import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Bubble, Marker, MarkerContent, Message, MessageContent } from "@/components/ui/chat"
import { ScrollArea } from "@/components/ui/scroll-area"
import { chatWithGemini } from "@/ai/inference/chat"
import type { ChatTurn } from "@/ai/utils/messages"

const QUESTIONS = ["hello", "What's the age of the universe?"]

type Entry = { role: "user" | "assistant" | "error"; content: string }

/** Plays a short two-question conversation with the key passed in, so the key can be checked before saving. */
export function GeminiTestDialog({ apiKey, open, onOpenChange }: { apiKey: string; open: boolean; onOpenChange: (open: boolean) => void }) {
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
        history.push({ role: "user", content: question })
        // Add the question and an empty reply bubble; the reply fills in as chunks arrive.
        setEntries((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }])
        try {
          const reply = await chatWithGemini(apiKey, history, (soFar) => {
            if (alive) setEntries((prev) => prev.map((entry, index) => (index === prev.length - 1 ? { ...entry, content: soFar } : entry)))
          })
          if (!alive) return
          history.push({ role: "assistant", content: reply })
        } catch (error) {
          if (!alive) return
          setEntries((prev) => [...prev.slice(0, -1), { role: "error", content: (error as Error).message }])
          break
        }
      }
      if (alive) setBusy(false)
    }

    run()
    return () => {
      alive = false
    }
  }, [open, apiKey])

  // Show the typing marker until the first chunk of the reply arrives.
  const last = entries.at(-1)
  const awaitingReply = busy && last?.role === "assistant" && last.content === ""

  // Keep the newest message in view as the conversation grows.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [entries, awaitingReply])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{busy ? "Testing Gemini" : "Test Done"}</DialogTitle>
          <DialogDescription>Model: gemini-3.5-flash-lite</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-80 pr-3">
          <div className="flex flex-col gap-3 py-2">
            {entries.map((entry, index) =>
              entry.role === "assistant" && !entry.content ? null : (
              <Message key={index} align={entry.role === "user" ? "end" : "start"}>
                <MessageContent>
                  <Bubble variant={entry.role === "user" ? "default" : entry.role === "error" ? "destructive" : "muted"}>
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
                <MarkerContent>Gemini is typing…</MarkerContent>
              </Marker>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <DialogFooter className="items-center sm:justify-between">
          <Button variant="outline" size="sm" disabled className="font-mono">
            status: {busy ? "running" : "done"}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
