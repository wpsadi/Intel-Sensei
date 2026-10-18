import { type ClipboardEvent, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { warmForFiles } from '@/ai/sandbox/attachments'
import { ComposerAttachmentChip, ComposerAttachments } from '@/components/assistant-ui/elements/composer'
import { deleteMedia, putMedia } from '@/features/note/db/media'
import type { ChatAttachment } from '@/features/note/db/types'

/** Pasted text longer than this many lines, or bigger than this many bytes, goes in as a text attachment instead of filling the box. */
export const PASTE_ATTACH_LINES = 30
export const PASTE_ATTACH_BYTES = 8 * 1024

export const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

export const attachmentKind = (type: string) => (type.startsWith('image/') ? 'image' : type.startsWith('text/') ? 'text' : 'archive')

/**
 * The files waiting to be sent with a message. They are saved to Cache Storage straight away, so sending only has to
 * reference them, and the sandbox has them for Sensei to read. There is no viewer for them yet: they show as names.
 */
const PENDING_PREFIX = 'sensei-pending-files:'

/** The files waiting in a widget, kept across closing it or reloading, since the files themselves are already saved. */
function readPending(key?: string): ChatAttachment[] {
  if (!key) return []
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_PREFIX + key) ?? '[]') as ChatAttachment[]
    return Array.isArray(saved) ? saved.filter((file) => file && typeof file.src === 'string' && typeof file.name === 'string') : []
  } catch {
    return []
  }
}

function writePending(key: string, files: ChatAttachment[]) {
  try {
    if (files.length) localStorage.setItem(PENDING_PREFIX + key, JSON.stringify(files))
    else localStorage.removeItem(PENDING_PREFIX + key)
  } catch {
    // Storage may be blocked; the files still work for this visit.
  }
}

export function useAttachments(session?: string, persistKey?: string) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>(() => readPending(persistKey))
  // Files that were waiting when the widget closed are still waiting when it opens again, and a different key (another
  // file or chat) brings back its own.
  const loadedKey = useRef(persistKey)
  useEffect(() => {
    if (loadedKey.current === persistKey) return
    loadedKey.current = persistKey
    setAttachments(readPending(persistKey))
  }, [persistKey])
  useEffect(() => {
    if (persistKey && loadedKey.current === persistKey) writePending(persistKey, attachments)
  }, [attachments, persistKey])

  const attach = async (files: File[]) => {
    try {
      const saved = await Promise.all(
        files.map(async (file) => ({ src: await putMedia(file, file.name), name: file.name, type: file.type, size: file.size })),
      )
      // Files the model reads through Python start the environment now, so it is ready by the time they are asked about.
      warmForFiles(saved, session)
      setAttachments((prev) => [...prev, ...saved])
    } catch {
      toast('Could not save the attachment')
    }
  }

  const pick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => void attach([...(input.files ?? [])])
    input.click()
  }

  const remove = (src: string) => {
    setAttachments((prev) => prev.filter((item) => item.src !== src))
    void deleteMedia(src)
  }

  /** Empties the list once the files are sent; the saved files stay, since the message refers to them. */
  const clear = () => setAttachments([])

  /**
   * Pasted images and files attach. Pasted text goes into the box, unless it is over 30 lines or 8 KB: then it becomes a
   * text file, so a long log or document stays out of the box.
   */
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>, addToDraft: (text: string) => void) => {
    const files = [...event.clipboardData.items]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file)
      // Screenshots arrive named "image.png"; give them a name that says where they came from.
      .map((file) =>
        file.name === 'image.png' ? new File([file], `Pasted image ${new Date().toLocaleTimeString()}.png`, { type: file.type }) : file,
      )
    const text = event.clipboardData.getData('text/plain')
    const longText = text.split('\n').length > PASTE_ATTACH_LINES || new Blob([text]).size > PASTE_ATTACH_BYTES
    if (files.length || longText) event.preventDefault()
    if (longText) {
      const count = attachments.filter((item) => item.name.startsWith('Pasted text')).length
      files.push(new File([text], `Pasted text${count ? ` ${count + 1}` : ''}.txt`, { type: 'text/plain' }))
    } else if (files.length && text) {
      // The default paste was stopped for the files, so put the short text in by hand.
      addToDraft(text)
    }
    if (files.length) void attach(files)
  }

  return { attachments, attach, pick, remove, clear, onPaste }
}

/** The waiting files as chips with a remove button. */
export function AttachmentChips({ attachments, onRemove }: { attachments: ChatAttachment[]; onRemove: (src: string) => void }) {
  if (!attachments.length) return null
  return (
    <ComposerAttachments className="px-2 pt-2">
      {attachments.map((item) => (
        <ComposerAttachmentChip
          key={item.src}
          attachment={{ name: item.name, meta: formatSize(item.size), state: 'done', kind: attachmentKind(item.type) }}
          onRemove={() => onRemove(item.src)}
        />
      ))}
    </ComposerAttachments>
  )
}

/** A sent message's files as plain names. There is no viewer yet, so this is only a record of what was attached. */
export function SentAttachments({ attachments }: { attachments?: ChatAttachment[] }) {
  if (!attachments?.length) return null
  return <p className="mt-1 max-w-full truncate text-xs text-muted-foreground">📎 {attachments.map((file) => file.name).join(', ')}</p>
}
