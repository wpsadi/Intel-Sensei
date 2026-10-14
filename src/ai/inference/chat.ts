import type { GoogleLanguageModelOptions } from '@ai-sdk/google'
import { type LanguageModelUsage, ToolLoopAgent } from 'ai'

import {
  MEMORY_INSTRUCTIONS,
  SCRATCHPAD_INSTRUCTIONS,
  createMemoryTool,
  createScratchpad,
  createScratchpadTool,
  disposeScratchpad,
  memoryPrompt,
} from '@/ai/memory'
import { AI_MODELS } from '@/ai/providers'
import { SANDBOX_INSTRUCTIONS, createSandboxTools } from '@/ai/sandbox/tools'
import { ASK_INSTRUCTIONS, createAskTools } from '@/ai/tools/ask'
import { PLAN_INSTRUCTIONS, createPlanTools } from '@/ai/tools/plan'
import { createScrapeTool } from '@/ai/tools/scrape'
import { createSearchTool, upsertSearch } from '@/ai/tools/search'
import { TODO_INSTRUCTIONS, createTodoTools } from '@/ai/tools/todo'
import { recordSdkUsage } from '@/ai/usage'
import { currentTimePrompt } from '@/ai/utils/current-time'
import { type ChatTurn, toModelMessage } from '@/ai/utils/messages'
import { thinkingOnly } from '@/ai/utils/thinking'
import type { ChatAnswers, ChatPlan, ChatQuestion, ChatSearch, ChatTodoList, ChatUsage } from '@/features/note/db/types'

/**
 * Sensei's persona for chat. It says nothing about how to think: asking for a thinking style made
 * flash-lite copy that style into the reply, so the reply opened with its plan ("I should…").
 */
export const SENSEI_SYSTEM_PROMPT = `You are Sensei, a patient, friendly study helper. Address the user directly as "you" and keep replies clear.`

/**
 * Streams a conversation through the AI SDK with the provider picked for chat in Settings. `onText`
 * receives the reply as it grows, and `onReasoning` receives Gemini's thought summary as it grows.
 * Resolves with the full reply.
 */
export async function chatWithSensei(
  messages: ChatTurn[],
  onText: (soFar: string) => void,
  onReasoning?: (soFar: string) => void,
  /** Aborting stops the reply; the call then resolves with the text received so far. */
  abortSignal?: AbortSignal,
  /** Receives Sensei's plan card when it makes one. */
  onPlan?: (plan: ChatPlan | undefined) => void,
  /** Receives Sensei's to-do list each time it makes or updates one. */
  onTodos?: (todos: ChatTodoList | null) => void,
  /** Receives every web search of this reply each time one starts or finishes. */
  onSearches?: (searches: ChatSearch[]) => void,
  /** The chat and the reply being written. Session memory is filtered by the chat, the scratchpad is tied to both. */
  scope?: {
    chatId: string
    messageId: string
    /** Receives the token counts Gemini reported once the reply is done. */ onUsage?: (usage: ChatUsage) => void
    /** The to-do list earlier replies left, for this reply to carry on. */ todos?: ChatTodoList
    /** Shows Sensei's questions and resolves with the user's answers. */ onAsk?: (questions: ChatQuestion[]) => Promise<ChatAnswers>
    /** Called before each step; returns the messages the user sent meanwhile, which join the conversation from that step on. */
    takeSteers?: () => Promise<ChatTurn[]>
  },
) {
  const scratchpad = scope ? createScratchpad(scope.chatId, scope.messageId) : undefined
  const { provider, key, model } = AI_MODELS.chat
  if (!key) throw new Error('Add a key for the chat provider in Settings → AI providers.')
  let searches: ChatSearch[] = []
  const webSearch = createSearchTool((search) => {
    searches = upsertSearch(searches, search)
    onSearches?.(searches)
  })
  const agent = new ToolLoopAgent({
    model: AI_MODELS.chatModel,
    instructions: SENSEI_SYSTEM_PROMPT,
    tools: {
      webSearch,
      scrape: createScrapeTool(),
      // terminal and python: files attached to this conversation are in the sandbox's home folder.
      ...createSandboxTools({ attachments: () => messages.flatMap((turn) => turn.attachments ?? []) }),
      memory: createMemoryTool({ chatId: scope?.chatId }),
      ...(scratchpad && { scratchpad: createScratchpadTool(scratchpad) }),
      ...createPlanTools(onPlan),
      ...createTodoTools(onTodos, scope?.todos),
      ...createAskTools(scope?.onAsk),
    },
    // Memory is read again before every step, so a fact saved or a scratchpad note written in one step is seen by the next.
    prepareStep: async ({ messages: stepMessages }) => {
      const steered = (await scope?.takeSteers?.()) ?? []
      return {
        // Steering messages join the history here and stay in it for the steps after.
        ...(steered.length && {
          messages: [
            ...stepMessages,
            ...(await Promise.all(steered.map((turn) => toModelMessage(provider === 'google' ? key : undefined, turn, false)))),
          ],
        }),
        instructions: [
          SENSEI_SYSTEM_PROMPT,
          currentTimePrompt(),
          await memoryPrompt({ chatId: scope?.chatId, scratchpad }),
          MEMORY_INSTRUCTIONS,
          SCRATCHPAD_INSTRUCTIONS,
          PLAN_INSTRUCTIONS,
          TODO_INSTRUCTIONS,
          ASK_INSTRUCTIONS,
          SANDBOX_INSTRUCTIONS,
        ]
          .filter(Boolean)
          .join('\n\n'),
      }
    },
    // Gemini leaves out its thought summaries unless asked for them.
    providerOptions:
      provider === 'google'
        ? { google: { thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } } satisfies GoogleLanguageModelOptions }
        : undefined,
  })
  try {
    const result = await agent.stream({
      // Only the newest question carries its YouTube link, since Gemini takes one video link per request.
      messages: await Promise.all(
        messages.map((turn, index) => toModelMessage(provider === 'google' ? key : undefined, turn, index === messages.length - 1)),
      ),
      abortSignal,
    })
    // Provider errors arrive as error parts in the stream, so keep the real error to throw afterwards.
    let streamError: unknown
    let reply = ''
    let thoughts = ''
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        reply += part.text
        onText(reply)
      } else if (part.type === 'reasoning-delta') {
        thoughts += part.text
        onReasoning?.(thinkingOnly(thoughts))
      } else if (part.type === 'error' && !abortSignal?.aborted) {
        streamError = part.error
      }
    }
    if (streamError) throw streamError
    const steps = await Promise.resolve(result.steps).catch(() => [])
    // Every step is a billed call, even when the caller does not ask for the totals.
    for (const step of steps) void recordSdkUsage({ provider, model }, step.usage)
    if (scope?.onUsage) {
      const last = steps.at(-1)?.usage
      if (last) {
        const sum = (pick: (usage: LanguageModelUsage) => number | undefined) =>
          steps.reduce((total: number, step) => total + (pick(step.usage) ?? 0), 0)
        scope.onUsage({
          contextTokens: (last.inputTokens ?? 0) + (last.outputTokens ?? 0),
          inputTokens: sum((usage) => usage.inputTokens),
          outputTokens: sum((usage) => usage.outputTokens),
          reasoningTokens: sum((usage) => usage.outputTokenDetails.reasoningTokens) || undefined,
          cachedTokens: sum((usage) => usage.inputTokenDetails.cacheReadTokens) || undefined,
        })
      }
    }
    return reply.trim()
  } finally {
    // The scratchpad is only for this loop.
    if (scratchpad) disposeScratchpad(scratchpad)
  }
}
