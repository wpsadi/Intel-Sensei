import type { Editor } from '@tiptap/react'
import { SendIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'

import { useCloseOnOutsidePress } from '../nodes/block-utils'
import { type BlockComment, commentsOf } from './comments'

interface BlockCommentsPanelProps {
  editor: Editor
  /** Document position of the commented block. */
  start: number
  top: number
  onClose: () => void
}

const timeLabel = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** Comment thread for one block: read, add and delete comments. */
export function BlockCommentsPanel({ editor, start, top, onClose }: BlockCommentsPanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  useCloseOnOutsidePress(ref, onClose)
  const [draft, setDraft] = useState('')
  const [comments, setComments] = useState(() => commentsOf(editor.state.doc.nodeAt(start)?.attrs))

  const save = (next: BlockComment[]) => {
    if (!editor.state.doc.nodeAt(start)) return
    editor.view.dispatch(editor.state.tr.setNodeAttribute(start, 'comments', next))
    setComments(next)
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    save([...comments, { id: crypto.randomUUID(), text, createdAt: Date.now() }])
    setDraft('')
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 z-50 w-80 rounded-md border bg-popover text-popover-foreground shadow-lg"
      style={{ top }}
      contentEditable={false}
    >
      <div className="border-b px-3 py-2 text-sm font-medium">Comments</div>
      {comments.length > 0 && (
        <ScrollArea className="max-h-64">
          <div className="space-y-1 p-2">
            {comments.map((comment) => (
              <div key={comment.id} className="group rounded px-2 py-1.5 hover:bg-muted">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{timeLabel(comment.createdAt)}</span>
                  <button
                    type="button"
                    title="Delete comment"
                    onClick={() => save(comments.filter((c) => c.id !== comment.id))}
                    className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      <div className="flex items-end gap-1 border-t p-2">
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
            else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              add()
            }
          }}
          placeholder="Add a comment…"
          className="min-h-9 flex-1 resize-none bg-transparent px-1 text-sm outline-none"
        />
        <button
          type="button"
          title="Comment"
          onClick={add}
          disabled={!draft.trim()}
          className="rounded p-1.5 text-blue-500 hover:bg-muted disabled:opacity-40"
        >
          <SendIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
