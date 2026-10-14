import { GoogleGenAI } from '@google/genai'
import type { ModelMessage } from 'ai'

import { readMedia } from '@/features/note/db/media'
import type { ChatAttachment, ChatMessage } from '@/features/note/db/types'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  attachments?: ChatAttachment[]
}

/**
 * A message as text for the model: its words, plus the plan card and to-do list that were shown with it.
 * Those live outside `content`, so without this a later reply or a live call would not know about them.
 */
export function messageText(message: Pick<ChatMessage, 'content' | 'plan' | 'todos'>) {
  const parts = [message.content]
  if (message.plan) {
    parts.push(
      `[Plan shown to the user: ${message.plan.title}\n${message.plan.steps.map((step, index) => `${index + 1}. ${step.title}`).join('\n')}]`,
    )
  }
  if (message.todos) {
    parts.push(
      `[To-do list shown to the user: ${message.todos.title}\n${message.todos.items.map((item) => `- (${item.status}) ${item.title}`).join('\n')}]`,
    )
  }
  if (message.todos === null) parts.push('[To-do list removed]')
  return parts.filter(Boolean).join('\n\n')
}

/** The chat's to-do list as it stands: the newest reply that touched it decides, and a removed list (null) stays removed. */
export function currentTodos(messages: Pick<ChatMessage, 'todos'>[]) {
  return messages.findLast((message) => message.todos !== undefined)?.todos ?? undefined
}

/** Gemini takes inline files up to 20 MB per request; anything bigger goes through the Files API. */
const INLINE_FILE_LIMIT = 15 * 1024 * 1024

/** One YouTube link per request is allowed; Gemini watches it directly. */
const YOUTUBE_URL = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+[^\s)]*/

/**
 * Uploads a large file to the Gemini Files API and waits until Gemini has processed it.
 * Returns the file's URI, which the AI SDK passes to Gemini as is.
 */
export async function uploadLargeFile(apiKey: string, blob: Blob, attachment: ChatAttachment) {
  const ai = new GoogleGenAI({ apiKey })
  let file = await ai.files.upload({ file: blob, config: { mimeType: attachment.type, displayName: attachment.name } })
  // Video and audio take a moment to process before they can be used.
  while (file.state === 'PROCESSING' && file.name) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    file = await ai.files.get({ name: file.name })
  }
  if (file.state === 'FAILED' || !file.uri) throw new Error(`Gemini could not process ${attachment.name}`)
  return file.uri
}

/**
 * One turn as the AI SDK wants it: the text first, then the files. Text files go in as text, so any
 * text type works. Other files (images, PDFs, audio, video) go in as file parts with their media type,
 * read from Cache Storage. A file missing from the cache is skipped. `withVideoLink` adds the first
 * YouTube link in the text as a video part.
 */
export async function toModelMessage(apiKey: string, turn: ChatTurn, withVideoLink: boolean): Promise<ModelMessage> {
  const videoLink = withVideoLink && turn.role === 'user' ? YOUTUBE_URL.exec(turn.content)?.[0] : undefined
  if (turn.role === 'assistant' || (!turn.attachments?.length && !videoLink)) return { role: turn.role, content: turn.content }
  const parts: Exclude<Extract<ModelMessage, { role: 'user' }>['content'], string> = []
  if (turn.content) parts.push({ type: 'text', text: turn.content })
  if (videoLink) parts.push({ type: 'file', data: videoLink, mediaType: 'video/mp4' })
  for (const attachment of turn.attachments ?? []) {
    const blob = await readMedia(attachment.src)
    if (!blob) continue
    const mediaType = attachment.type || blob.type || 'application/octet-stream'
    if (mediaType.startsWith('text/') || mediaType === 'application/json') {
      parts.push({ type: 'text', text: `Attached file "${attachment.name}":\n${await blob.text()}` })
    } else if (blob.size > INLINE_FILE_LIMIT) {
      parts.push({ type: 'file', data: new URL(await uploadLargeFile(apiKey, blob, attachment)), mediaType, filename: attachment.name })
    } else {
      parts.push({ type: 'file', data: new Uint8Array(await blob.arrayBuffer()), mediaType, filename: attachment.name })
    }
  }
  return { role: 'user', content: parts }
}
