import { tool } from 'ai'
import { z } from 'zod'

import type { ChatMessage } from '@/features/note/db/types'

/** Added to a live call's instructions. The voice model only hears short summaries, so it reads the rest on demand. */
export const READ_CHAT_INSTRUCTIONS = `Earlier answers, research and their sources are in the chat, not in your memory of the call. Before you answer a question about something said or written earlier, such as what a source said, a comparison, a figure or a detail of a past answer, call readChat first. Say one short line like "let me check" before you do. Never invent details of a past answer.`

/** One chat message as the voice model reads it: its words and the pages its searches found. */
export interface ChatSnapshot {
  role: 'user' | 'assistant'
  text: string
  sources?: { url: string; title?: string }[]
}

const MAX_TEXT = 12000
const MAX_SOURCES = 20

/** The readable form of saved messages. A live reply's searches sit in its parts, a text reply's in `searches`. */
export const snapshotOf = (messages: Pick<ChatMessage, 'role' | 'content' | 'searches' | 'parts'>[]): ChatSnapshot[] =>
  messages.map((message) => {
    const searches = [
      ...(message.searches ?? []),
      ...(message.parts ?? []).flatMap((part) => (part.type === 'searches' ? part.searches : [])),
    ]
    const sources = searches.flatMap((search) => search.sources ?? [])
    return { role: message.role, text: message.content, ...(sources.length && { sources }) }
  })

/** The last few turns as lines for the start of a call. The rest is one `readChat` away. */
export const historyTail = (turns: ChatSnapshot[], count = 6, limit = 400) =>
  turns
    .filter((turn) => turn.text)
    .slice(-count)
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Sensei'}: ${turn.text.length > limit ? `${turn.text.slice(0, limit)}…` : turn.text}`)
    .join('\n')

/**
 * Lets the live voice model read what the chat holds. The call starts with only a short tail of the chat, so this is
 * how it gets a full answer or the sources of a search later, when the user actually asks about them.
 */
export function createReadChatTool(read: () => ChatSnapshot[] | Promise<ChatSnapshot[]>) {
  return tool({
    description:
      'Read the most recent messages of this chat in full, with the web sources their searches found. Use it before answering about an earlier answer, research or source.',
    inputSchema: z.object({
      last: z.number().int().min(1).max(20).optional().describe('How many of the latest messages to read. Defaults to 4.'),
    }),
    execute: async ({ last = 4 }) => {
      const turns = (await read())
        .filter((turn) => turn.text)
        .slice(-last)
      if (!turns.length) return { messages: [], note: 'The chat has no messages yet.' }
      return {
        messages: turns.map((turn) => {
          const sources = [...new Map((turn.sources ?? []).map((source) => [source.url, source])).values()].slice(0, MAX_SOURCES)
          return { role: turn.role, text: turn.text.slice(0, MAX_TEXT), ...(sources.length && { sources }) }
        }),
      }
    },
  })
}
