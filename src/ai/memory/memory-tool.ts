import { tool } from 'ai'
import { z } from 'zod'

import { episodicMemory } from './episodic/episodic'
import { proceduralMemory } from './procedural/procedural'
import { semanticMemory } from './semantic/semantic'
import { sessionMemory } from './session/session'
import { ASK_SCOPE, type MemoryScope } from './types'

const memoryInput = z.object({
  command: z
    .enum([
      'remember_fact',
      'update_fact',
      'forget_fact',
      'search_facts',
      'remember_event',
      'search_events',
      'save_procedure',
      'forget_procedure',
      'search_procedures',
      'note_session',
      'forget_session_note',
    ])
    .describe(
      'Semantic: remember_fact, update_fact, forget_fact, search_facts. Episodic: remember_event, search_events. Procedural: save_procedure, forget_procedure, search_procedures. Session: note_session, forget_session_note.',
    ),
  text: z.string().optional().describe('The fact, event, procedure instructions or session note to save.'),
  name: z.string().optional().describe('Short name of the procedure, for save_procedure.'),
  id: z
    .string()
    .optional()
    .describe('The id in brackets of the item, for update_fact, forget_fact, forget_procedure and forget_session_note.'),
  query: z.string().optional().describe('Short search terms (1-4 words) for the search commands.'),
  pinned: z
    .boolean()
    .optional()
    .describe(
      'For remember_fact: true (default) for a short fact that is always relevant, false for longer knowledge that is only found by searching.',
    ),
})

const day = (time: number) => new Date(time).toISOString().slice(0, 10)

/**
 * The memory tool over semantic, episodic, procedural and session memory. Structured actions only: the
 * model can do what is listed here and nothing else. Session commands always use `chatId`, never an id
 * the model gives, so they can only reach this chat's notes.
 */
export function createMemoryTool({ chatId, scope = ASK_SCOPE }: { chatId?: string; scope?: MemoryScope } = {}) {
  const run = async ({ command, text, name, id, query, pinned }: z.infer<typeof memoryInput>) => {
    const need = (value: string | undefined, label: string) => {
      if (!value?.trim()) throw new Error(`${label} is required`)
      return value
    }
    const session = () => {
      if (!chatId) throw new Error('There is no chat for session memory.')
      return chatId
    }
    switch (command) {
      case 'remember_fact':
        await semanticMemory.add(need(text, 'text'), pinned ?? true, scope)
        return 'Saved to semantic memory.'
      case 'update_fact':
        return (await semanticMemory.update(need(id, 'id'), need(text, 'text'), scope)) ? 'Fact updated.' : `No fact with id ${id}.`
      case 'forget_fact':
        await semanticMemory.remove(need(id, 'id'), scope)
        return 'Fact removed.'
      case 'search_facts': {
        const hits = await semanticMemory.search(need(query, 'query'), 5, scope)
        return hits.length ? hits.map(({ item }) => `[${item.id}] ${item.text}`).join('\n') : 'No matching facts.'
      }
      case 'remember_event':
        await episodicMemory.append({ scope, chatId, role: 'event', content: need(text, 'text') })
        return 'Event saved to episodic memory.'
      case 'search_events': {
        const hits = await episodicMemory.search(need(query, 'query'), 5, scope)
        if (!hits.length) return 'No matching episodes.'
        // Each hit says whether it happened in this chat, which the model already has in front of it.
        return JSON.stringify(
          hits.map(({ item }) => ({
            date: day(item.createdAt),
            role: item.role,
            content: item.content,
            belongsToThisChat: !!chatId && item.chatId === chatId,
          })),
        )
      }
      case 'save_procedure':
        await proceduralMemory.save(need(name, 'name'), need(text, 'text'), scope)
        return 'Procedure saved.'
      case 'forget_procedure':
        await proceduralMemory.remove(need(id, 'id'), scope)
        return 'Procedure removed.'
      case 'search_procedures': {
        const hits = await proceduralMemory.search(need(query, 'query'), 5, scope)
        return hits.length
          ? hits.map(({ item }) => `[${item.id}] ${item.name}: ${item.instructions}`).join('\n')
          : 'No matching procedures.'
      }
      case 'note_session':
        await sessionMemory.add(session(), need(text, 'text'))
        return 'Noted for this chat.'
      case 'forget_session_note':
        return (await sessionMemory.remove(session(), need(id, 'id'))) ? 'Session note removed.' : `No note with id ${id} in this chat.`
    }
  }

  return tool({
    description: `Read and maintain long-term memory: semantic facts, episodic events, procedures, and notes for this chat.

Use it only when the user asks you to remember or forget something, tells you something durable worth keeping, or refers to something from an earlier chat. Do not use it for anything already in this chat or already shown in your instructions, and do not search when the memory overview says there is nothing to find.
- Keep searches short and focused (1-4 words).
- Pinned facts, procedures and this chat's notes are already shown to you, so never search for those.
- Past conversations are saved automatically; do not copy them into memory.
- Each search_events result has belongsToThisChat: true when it was said in this chat, false when it comes from another chat.`,
    inputSchema: memoryInput,
    execute: async (input) => {
      try {
        return { output: await run(input) }
      } catch (error) {
        return { output: `Memory action failed: ${error instanceof Error ? error.message : 'unknown error'}` }
      }
    },
  })
}
