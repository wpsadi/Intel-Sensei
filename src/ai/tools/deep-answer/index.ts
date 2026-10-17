import { tool } from 'ai'
import { z } from 'zod'

import { chatWithSensei } from '@/ai/inference/chat'
import { writeNarration } from '@/ai/narration'
import type { AgentProgress } from '@/ai/tools/progress'
import type { ChatTurn } from '@/ai/utils/messages'
import type { ChatPlan, ChatSearch, ChatTodoList } from '@/features/note/db/types'

/** Added to the live call's instructions so the voice model knows when to ask for a deep answer and how to talk around it. */
export const DEEP_ANSWER_INSTRUCTIONS = `For a request that needs research, tools or depth, such as finding places to eat, a comparison, an explanation, a walkthrough or code, call deepAnswer with the user's question and relevant context. It runs the normal chat agent and writes the full answer on the user's screen while you keep talking. Right after calling it, say one short natural line about what you are looking into. The running tool sends structured progress updates and verified findings before its final result. Briefly share useful new information from those updates in natural speech, without repeating earlier narration. A working update only describes activity; never present it as a verified result. Do not read field names aloud, invent progress, repeatedly fill silence, or start another deepAnswer for the same task because an update arrived. When the final result arrives, summarize its script in your own words, focusing on the answer and anything not already covered. Never read code, tables or symbols aloud. For simple questions and small talk, answer directly and do not call deepAnswer.`

/** What the page hands the tool: the chat so far, and where to put what the deep model writes. */
export interface DeepAnswerOptions {
  chatId: string
  /** The conversation so far, as the text model should see it. */
  history: () => ChatTurn[]
  /** The answer as it grows, under the id of the tool call. */
  onAnswer: (id: string, soFar: string) => void
  onPlan?: (plan: ChatPlan | undefined) => void
  onTodos?: (todos: ChatTodoList | null) => void
  /** The chat's current to-do list, so the deep answer can carry it on. */
  todos?: () => ChatTodoList | undefined
  onSearches?: (searches: ChatSearch[]) => void
  onProgress?: (id: string, progress: AgentProgress) => void
}

/**
 * The deep-answer tool for the live call. The text agent, with its memory and web search, writes the
 * full answer for the screen, and a short spoken script comes back for the voice to say. It is meant to
 * run in the background, so the call keeps talking while this works.
 */
export function createDeepAnswerTool({ chatId, history, onAnswer, onPlan, onTodos, todos, onSearches, onProgress }: DeepAnswerOptions) {
  return tool({
    description:
      'Run the normal chat agent for research, finding places, comparisons, explanations, code or other substantive tasks. Streams progress and verified findings while writing the full answer on screen, then returns a spoken summary. Use direct speech for simple questions and small talk.',
    inputSchema: z.object({ question: z.string().describe("The user's question, with the context needed to answer it in depth") }),
    execute: async ({ question }, { toolCallId, abortSignal }) => {
      const seen = new Set<string>()
      const report = (progress: AgentProgress) => {
        if (abortSignal?.aborted) return
        const key = `${progress.stage}:${progress.summary}`
        if (seen.has(key)) return
        seen.add(key)
        onProgress?.(toolCallId, progress)
      }
      const searchStates = new Map<string, string>()
      const answer = await chatWithSensei(
        [
          ...history(),
          {
            role: 'user',
            content: `${question}\n\n(This is a live voice call. Write the complete answer in Markdown: it is shown on the user's screen while a voice reads a short summary of it.)`,
          },
        ],
        (soFar) => {
          if (!abortSignal?.aborted) onAnswer(toolCallId, soFar)
        },
        undefined,
        abortSignal,
        (plan) => {
          if (!abortSignal?.aborted) onPlan?.(plan)
        },
        (nextTodos) => {
          if (!abortSignal?.aborted) onTodos?.(nextTodos)
        },
        (searches) => {
          if (abortSignal?.aborted) return
          onSearches?.(searches)
          for (const search of searches) {
            const key = search.id ?? search.query
            if (searchStates.get(key) === search.status) continue
            searchStates.set(key, search.status)
            const query = search.query.slice(0, 200)
            const count = search.sources?.length ?? 0
            report({
              stage: 'working',
              summary:
                search.status === 'running'
                  ? `Searching the web for ${query}.`
                  : search.status === 'done'
                    ? `The search for ${query} returned ${count} source${count === 1 ? '' : 's'}; the results still need to be evaluated.`
                    : `The search for ${query} failed; no findings are available from it.`,
            })
          }
        },
        { chatId, messageId: toolCallId, todos: todos?.(), onProgress: report },
      )
      abortSignal?.throwIfAborted()
      onAnswer(toolCallId, answer)
      report({ stage: 'working', summary: 'The written answer is ready. Preparing the final spoken summary.' })
      const script = await writeNarration(answer)
      abortSignal?.throwIfAborted()
      return {
        instruction:
          "The full answer is already on the user's screen. Summarize the script naturally, focusing on the recommendations and findings not already spoken during progress updates. Do not repeat your earlier narration or read code, tables or symbols aloud.",
        script,
      }
    },
  })
}
