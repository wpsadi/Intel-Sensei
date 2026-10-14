import { tool } from 'ai'
import { z } from 'zod'

import { chatWithSensei } from '@/ai/inference/chat'
import { writeNarration } from '@/ai/narration'
import type { ChatTurn } from '@/ai/utils/messages'
import type { ChatPlan, ChatSearch, ChatTodoList } from '@/features/note/db/types'

/** Added to the live call's instructions so the voice model knows when to ask for a deep answer and how to talk around it. */
export const DEEP_ANSWER_INSTRUCTIONS = `For a question that needs depth, such as an explanation, a walkthrough, code, a comparison, a table or research, call deepAnswer with the user's question. It writes the full answer on the user's screen while you keep talking. Right after calling it, say one short natural line about what you are looking into, then carry on the conversation: do not wait in silence. When the result arrives, say its script in your own words: it already describes every table, code block and diagram in spoken words. Never read code, tables or symbols aloud. For simple questions and small talk, answer directly and do not call deepAnswer.`

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
}

/**
 * The deep-answer tool for the live call. The text agent, with its memory and web search, writes the
 * full answer for the screen, and a short spoken script comes back for the voice to say. It is meant to
 * run in the background, so the call keeps talking while this works.
 */
export function createDeepAnswerTool({ chatId, history, onAnswer, onPlan, onTodos, todos, onSearches }: DeepAnswerOptions) {
  return tool({
    description:
      "Write a detailed answer on the user's screen for a question that needs depth: an explanation, walkthrough, code, comparison, table or research. Use it only for those, not for simple questions or small talk. Returns a short script to say aloud.",
    inputSchema: z.object({ question: z.string().describe("The user's question, with the context needed to answer it in depth") }),
    execute: async ({ question }, { toolCallId, abortSignal }) => {
      const answer = await chatWithSensei(
        [
          ...history(),
          {
            role: 'user',
            content: `${question}\n\n(This is a live voice call. Write the complete answer in Markdown: it is shown on the user's screen while a voice reads a short summary of it.)`,
          },
        ],
        (soFar) => onAnswer(toolCallId, soFar),
        undefined,
        abortSignal,
        onPlan,
        onTodos,
        onSearches,
        { chatId, messageId: toolCallId, todos: todos?.() },
      )
      onAnswer(toolCallId, answer)
      const script = await writeNarration(answer)
      return {
        instruction:
          "The full answer is already on the user's screen. The script below is the answer in spoken form: its text is said as it is, and every table, code block or diagram is already described in words. Say it in your own words, in order, and do not read code, tables or symbols aloud.",
        script,
      }
    },
  })
}
