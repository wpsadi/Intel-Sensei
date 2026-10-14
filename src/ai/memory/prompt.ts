import { getMemoryDb } from './db'
import { PROCEDURE_PROMPT_LIMIT, proceduralMemory } from './procedural/procedural'
import type { Scratchpad } from './scratchpad/scratchpad'
import { semanticMemory } from './semantic/semantic'
import { sessionMemory } from './session/session'
import { ASK_SCOPE, type MemoryScope } from './types'

/** Added to the agent's instructions so it knows which memory is which, and when to leave memory alone. */
export const MEMORY_INSTRUCTIONS = `You have five kinds of memory. Use the memory tool for the first four and keep its use invisible: never mention the tool or its commands to the user.
- Semantic: facts about the user and the world. Pinned facts are shown to you below.
- Episodic: what happened, saved automatically from every chat. Search results say belongsToThisChat.
- Procedural: how the user wants things done. The latest are shown below, follow them.
- Session: notes for this chat only, such as its goal or what was decided. Shown below.
- Scratchpad: working notes for this reply only, through the scratchpad tool. Forgotten when the reply ends.

Most messages need no memory call. Everything said in this chat and everything shown below is already in front of you, so answer from it directly. Call the memory tool only when:
- the user asks you to remember or forget something, or tells you a durable fact, preference or rule worth keeping;
- the user refers to an earlier chat, or to something about them that is not in front of you and the memory overview says could be saved.
Never call it for greetings, general knowledge, questions about this chat, or anything already shown below. Search at most once for one need, and if the overview says nothing is saved there, do not search.`

/** What is saved beyond what is shown in the prompt, so the model knows when a search could find anything. */
async function memoryOverview(scope: MemoryScope, chatId?: string) {
  const db = await getMemoryDb()
  const [facts, episodes, thisChat, procedures] = await Promise.all([
    semanticMemory.list(scope),
    db.countFromIndex('episodes', 'byScope', scope),
    chatId ? db.countFromIndex('episodes', 'byChat', chatId) : 0,
    proceduralMemory.list(scope).then((list) => list.length),
  ])
  const hiddenFacts = facts.filter((fact) => !fact.pinned).length
  const otherEpisodes = episodes - thisChat
  const hiddenProcedures = Math.max(0, procedures - PROCEDURE_PROMPT_LIMIT)
  const lines = [
    `- Facts you can only find by searching: ${hiddenFacts || 'none'}`,
    `- Episodes from other chats you can search: ${otherEpisodes || 'none'}`,
    `- Procedures you can only find by searching: ${hiddenProcedures || 'none'}`,
  ]
  return `Memory overview (what is saved beyond what is shown here):\n${lines.join('\n')}`
}

/** The memory shown to the model before each step: pinned facts, procedures, this chat's notes, the scratchpad, and an overview of the rest. */
export async function memoryPrompt({
  chatId,
  scratchpad,
  scope = ASK_SCOPE,
}: { chatId?: string; scratchpad?: Scratchpad; scope?: MemoryScope } = {}) {
  const blocks = await Promise.all([
    semanticMemory.toPrompt(scope),
    proceduralMemory.toPrompt(scope),
    chatId ? sessionMemory.toPrompt(chatId) : '',
    scratchpad?.toPrompt() ?? '',
    memoryOverview(scope, chatId),
  ])
  return blocks.filter(Boolean).join('\n\n')
}
