import { tool } from 'ai'
import { z } from 'zod'

/**
 * Scratchpad memory: working notes for one agent loop, the one that writes one message of one chat. It
 * lives in memory only and is tied to that chat id and message id, so whatever the model writes here
 * is forgotten when the loop ends and is never seen by another chat or another reply.
 */
export interface Scratchpad {
  readonly chatId: string
  readonly messageId: string
  set(key: string, value: string): void
  get(key: string): string | undefined
  remove(key: string): void
  clear(): void
  entries(): [string, string][]
  /** The notes as a block for the prompt, or '' when the pad is empty. */
  toPrompt(): string
}

/** The pads of the loops that are running, by `${chatId}:${messageId}`. */
const pads = new Map<string, Scratchpad>()

/** The scratchpad of one message in one chat. Calling it again for the same pair gives back the same pad. */
export function createScratchpad(chatId: string, messageId: string): Scratchpad {
  const id = `${chatId}:${messageId}`
  const existing = pads.get(id)
  if (existing) return existing
  const notes = new Map<string, string>()
  const pad: Scratchpad = {
    chatId,
    messageId,
    set: (key, value) => void notes.set(key, value),
    get: (key) => notes.get(key),
    remove: (key) => void notes.delete(key),
    clear: () => notes.clear(),
    entries: () => [...notes],
    toPrompt: () => (notes.size ? `Scratchpad (your working notes for this reply only):\n${[...notes].map(([key, value]) => `- ${key}: ${value}`).join('\n')}` : ''),
  }
  pads.set(id, pad)
  return pad
}

/** Throws the pad away when its loop ends. */
export function disposeScratchpad(pad: Scratchpad) {
  pad.clear()
  pads.delete(`${pad.chatId}:${pad.messageId}`)
}

/** Added to the agent's instructions so it uses the scratchpad. */
export const SCRATCHPAD_INSTRUCTIONS = `Use the scratchpad tool for working notes inside one reply: partial results, what you tried, what is left. It is forgotten when the reply ends, so put anything worth keeping in memory instead.`

const scratchpadInput = z.object({
  command: z.enum(['write', 'read', 'remove', 'clear']).describe('write saves a note under a key, read returns one note or all of them, remove deletes a note, clear empties the pad.'),
  key: z.string().optional().describe('Short name of the note, for write, remove and read.'),
  value: z.string().optional().describe('The note, for write.'),
})

/** The scratchpad tool over one pad. */
export function createScratchpadTool(pad: Scratchpad) {
  return tool({
    description: 'Working notes for this reply only. Write down partial results and next steps so you can come back to them while you work. Everything is forgotten when the reply ends.',
    inputSchema: scratchpadInput,
    execute: ({ command, key, value }) => {
      switch (command) {
        case 'write':
          if (!key || value === undefined) return { output: 'key and value are required.' }
          pad.set(key, value)
          return { output: `Noted ${key}.` }
        case 'read': {
          if (key) return { output: pad.get(key) ?? `No note named ${key}.` }
          const all = pad.entries()
          return { output: all.length ? all.map(([name, note]) => `${name}: ${note}`).join('\n') : 'The scratchpad is empty.' }
        }
        case 'remove':
          if (!key) return { output: 'key is required.' }
          pad.remove(key)
          return { output: `Removed ${key}.` }
        case 'clear':
          pad.clear()
          return { output: 'The scratchpad is empty.' }
      }
    },
  })
}
