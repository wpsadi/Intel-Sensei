import { type LanguageModelUsage, type Tool, ToolLoopAgent, parsePartialJson } from 'ai'

import type { ChatProfile } from '@/ai/inference/chat-profile'
import {
  MEMORY_INSTRUCTIONS,
  SCRATCHPAD_INSTRUCTIONS,
  createMemoryTool,
  createScratchpad,
  createScratchpadTool,
  disposeScratchpad,
  memoryPrompt,
} from '@/ai/memory'
import { AI_MODELS, thinkingSummary } from '@/ai/providers'
import { warmForFiles } from '@/ai/sandbox/attachments'
import { holdSandbox } from '@/ai/sandbox/client'
import { SANDBOX_INSTRUCTIONS, createSandboxTools } from '@/ai/sandbox/tools'
import { applySkillCommand } from '@/ai/skills/invoke'
import { SKILLS_INSTRUCTIONS, createSkillTools, skillsPrompt } from '@/ai/skills/tools'
import { ASK_INSTRUCTIONS, createAskTools } from '@/ai/tools/ask'
import { EXPORT_INSTRUCTIONS, createExportFileTool, documentName } from '@/ai/tools/export-file'
import { PLAN_INSTRUCTIONS, createPlanTools } from '@/ai/tools/plan'
import { createScrapeTool } from '@/ai/tools/scrape'
import { createSearchTool, upsertSearch } from '@/ai/tools/search'
import { catalogOf, createToolSelector, lastUserText } from '@/ai/tools/selector'
import { TODO_INSTRUCTIONS, createTodoTools } from '@/ai/tools/todo'
import { recordSdkUsage } from '@/ai/usage'
import { currentTimePrompt } from '@/ai/utils/current-time'
import { withFileMentions } from '@/ai/utils/file-mentions'
import { type ChatTurn, toModelMessage } from '@/ai/utils/messages'
import { thinkingOnly } from '@/ai/utils/thinking'
import { describeToolCall, hasOwnUi, resultFailed } from '@/ai/utils/tool-steps'
import type {
  ChatAnswers,
  ChatAttachment,
  ChatPlan,
  ChatQuestion,
  ChatSearch,
  ChatTodoList,
  ChatToolStep,
  ChatUsage,
} from '@/features/note/db/types'

/**
 * Sensei's persona for chat. It says nothing about how to think: asking for a thinking style made
 * flash-lite copy that style into the reply, so the reply opened with its plan ("I should…").
 */
export const SENSEI_SYSTEM_PROMPT = `You are Sensei, a friendly, general-purpose assistant. Address the user directly as "you" and keep replies clear. Help with the user's request across topics, including everyday questions, creative work, entertainment, and technical tasks. Do not steer the conversation toward studying unless the user asks for study help.

The chat can display photos and play video and audio inside your replies. When asked to show media, include a real media URL using these supported Markdown formats:
- Image: ![Short description](https://example.com/photo.jpg)
- Video: [Video title](https://example.com/video.mp4)
- Audio: [Audio title](https://example.com/audio.mp3)
Video and audio URLs must point directly to media files with a file extension (query strings are allowed). Web pages such as YouTube watch pages remain links, not embedded players. Use Markdown rather than HTML tags or fenced code for media. Put each media item in its own paragraph.

For a random image, use ![Random photo](https://picsum.photos/800/600). The photo is random, so do not claim to know what it depicts.
For a random or sample video, you can show [Big Buck Bunny — sample video](https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4).
For random or sample audio, you can show [SoundHelix — sample music](https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3).
These are externally hosted samples, not media you generated. For specific media, use a URL provided by the user or found with your web tools; do not invent URLs or claim to have viewed or verified media unless you actually have. Do not say this chat cannot display images or play video or audio. Playback starts when the user presses play.`

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
    /** Receives each file Sensei hands to the user, and the tool call that made it; it shows with the reply. */
    onFile?: (file: ChatAttachment, callId: string) => void
    /** Receives a document as Sensei writes it, so it can be shown while it streams. `done` ends the draft. */
    onArtifactDraft?: (draft: { id: string; name: string; content: string; format: 'markdown' | 'html'; done?: boolean }) => void
    /** Receives the tool calls of this reply, in order, each time one starts or ends. */
    onSteps?: (steps: ChatToolStep[]) => void
    /** Limits the agent to one app's tools and instructions. */
    profile?: ChatProfile
  },
) {
  // Files the model reads through Python: start the environment while the reply gets going.
  warmForFiles(
    messages.flatMap((turn) => turn.attachments ?? []),
    scope?.chatId,
  )
  const scratchpad = scope ? createScratchpad(scope.chatId, scope.messageId) : undefined
  const { provider, key, model } = AI_MODELS.chat
  if (!key) throw new Error('Add a key for the chat provider in Settings → AI providers.')
  let searches: ChatSearch[] = []
  const webSearch = createSearchTool((search) => {
    searches = upsertSearch(searches, search)
    onSearches?.(searches)
  })
  const allTools = {
    webSearch,
    scrape: createScrapeTool(scope?.chatId),
    // terminal and python: files attached to this conversation are in the sandbox's home folder.
    ...createSandboxTools({ attachments: () => messages.flatMap((turn) => turn.attachments ?? []), session: scope?.chatId }),
    memory: createMemoryTool({ chatId: scope?.chatId }),
    ...(scratchpad && { scratchpad: createScratchpadTool(scratchpad) }),
    ...createPlanTools(onPlan),
    ...createTodoTools(onTodos, scope?.todos),
    ...createAskTools(scope?.onAsk),
    ...createExportFileTool(
      (file, callId) => scope?.onFile?.(file, callId),
      scope?.chatId,
      () => messages.flatMap((turn) => turn.attachments ?? []),
    ),
    ...createSkillTools(),
  }
  const profile = scope?.profile
  const tools: Record<string, Tool> = profile
    ? {
        ...Object.fromEntries(Object.entries(allTools).filter(([name]) => profile.allow.includes(name))),
        ...profile.tools,
      }
    : allTools
  // What the model reads of a user message: a /skill-name message carries the skill's instructions, and @file mentions
  // are explained. The chat keeps showing what was typed.
  const fileNames = messages.flatMap((turn) => turn.attachments ?? []).map((file) => file.name)
  const forModel = async (turn: ChatTurn): Promise<ChatTurn> =>
    turn.role === 'user' ? { ...turn, content: withFileMentions(await applySkillCommand(turn.content), fileNames) } : turn
  // Dynamic tool selection: the chat model picks the tools the request needs before the first step.
  const selector = createToolSelector({
    model: AI_MODELS.chatModel,
    catalog: catalogOf(tools),
    alwaysInclude: ['memory', 'scratchpad', 'askUser', 'use_skill'],
    max: 8,
    signal: abortSignal,
    onUsage: (usage) => void recordSdkUsage({ provider, model }, usage),
  })
  const agent = new ToolLoopAgent({
    model: AI_MODELS.chatModel,
    instructions: SENSEI_SYSTEM_PROMPT,
    tools: selector.enabled ? { ...tools, request_tools: selector.requestTool } : tools,
    // Memory is read again before every step, so a fact saved or a scratchpad note written in one step is seen by the next.
    prepareStep: async ({ messages: stepMessages }) => {
      const steered = (await scope?.takeSteers?.()) ?? []
      const activeTools = await selector.activeTools(
        // The request as typed, not with a skill's whole instructions in front of it.
        steered.length
          ? steered.map((turn) => turn.content).join('\n')
          : (messages.findLast((turn) => turn.role === 'user')?.content ?? lastUserText(stepMessages)),
        steered.length > 0,
      )
      return {
        ...(activeTools && { activeTools: activeTools as never }),
        // Steering messages join the history here and stay in it for the steps after.
        ...(steered.length && {
          messages: [
            ...stepMessages,
            ...(await Promise.all(
              steered.map(async (turn) => toModelMessage(provider === 'google' ? key : undefined, await forModel(turn), false, true)),
            )),
          ],
        }),
        instructions: (profile
          ? [
              SENSEI_SYSTEM_PROMPT,
              currentTimePrompt(),
              SANDBOX_INSTRUCTIONS,
              SKILLS_INSTRUCTIONS,
              await skillsPrompt(),
              profile.instructions,
            ]
          : [
              SENSEI_SYSTEM_PROMPT,
              currentTimePrompt(),
              await memoryPrompt({ chatId: scope?.chatId, scratchpad }),
              MEMORY_INSTRUCTIONS,
              SCRATCHPAD_INSTRUCTIONS,
              PLAN_INSTRUCTIONS,
              TODO_INSTRUCTIONS,
              ASK_INSTRUCTIONS,
              SANDBOX_INSTRUCTIONS,
              EXPORT_INSTRUCTIONS,
              SKILLS_INSTRUCTIONS,
              await skillsPrompt(),
            ]
        )
          .filter(Boolean)
          .join('\n\n'),
      }
    },
    // Claude and Gemini leave out their thought summaries unless asked for them.
    providerOptions: thinkingSummary(provider) as never,
  })
  // A reply that is being written keeps its Python environment alive; it stops a minute after the last use.
  const releaseSandbox = holdSandbox(scope?.chatId)
  try {
    const result = await agent.stream({
      // Only the newest question carries its YouTube link, since Gemini takes one video link per request.
      messages: await Promise.all(
        messages.map(async (turn, index) =>
          toModelMessage(provider === 'google' ? key : undefined, await forModel(turn), index === messages.length - 1, true),
        ),
      ),
      abortSignal,
    })
    // Provider errors arrive as error parts in the stream, so keep the real error to throw afterwards.
    let streamError: unknown
    let reply = ''
    let thoughts = ''
    let toolSteps: ChatToolStep[] = []
    const setStep = (id: string, patch: Partial<ChatToolStep>, created?: Pick<ChatToolStep, 'name' | 'label' | 'detail'>) => {
      const known = toolSteps.find((step) => step.id === id)
      if (!known && !created) return
      toolSteps = known
        ? toolSteps.map((step) => (step.id === id ? { ...step, ...patch } : step))
        : [...toolSteps, { id, status: 'running', at: thinkingOnly(thoughts).length, ...created!, ...patch }]
      scope?.onSteps?.(toolSteps)
    }
    // create_document writes its text inside the tool call, so it is read from the call's input as that streams in.
    const documents = new Map<string, { input: string; shownAt: number }>()
    const showDraft = async (id: string, input: string, done = false) => {
      const draft = ((await parsePartialJson(input)).value ?? {}) as { title?: string; format?: string; content?: string }
      if (typeof draft.content !== 'string') return
      scope?.onArtifactDraft?.({
        id,
        name: documentName(draft.title ?? 'Document', draft.format === 'html' ? 'html' : 'markdown'),
        content: draft.content,
        format: draft.format === 'html' ? 'html' : 'markdown',
        done,
      })
    }
    for await (const part of result.fullStream) {
      if (part.type === 'tool-input-start' && part.toolName === 'create_document') {
        documents.set(part.id, { input: '', shownAt: 0 })
      } else if (part.type === 'tool-input-delta' && documents.has(part.id)) {
        const document = documents.get(part.id)!
        document.input += part.delta
        // Reading the JSON again for every few characters would cost more than the text it shows.
        if (Date.now() - document.shownAt > 120) {
          document.shownAt = Date.now()
          await showDraft(part.id, document.input)
        }
      } else if (part.type === 'tool-input-end' && documents.has(part.id)) {
        await showDraft(part.id, documents.get(part.id)!.input)
      } else if (part.type === 'text-delta') {
        reply += part.text
        onText(reply)
      } else if (part.type === 'reasoning-delta') {
        thoughts += part.text
        onReasoning?.(thinkingOnly(thoughts))
      } else if (part.type === 'tool-call') {
        if (!hasOwnUi(part.toolName))
          setStep(
            part.toolCallId,
            {},
            { name: part.toolName, ...describeToolCall(part.toolName, (part.input ?? {}) as Record<string, unknown>) },
          )
      } else if (part.type === 'tool-result') {
        setStep(part.toolCallId, { status: resultFailed(part.toolName, part.output) ? 'failed' : 'done' })
      } else if (part.type === 'tool-error') {
        const draft = documents.get(part.toolCallId)
        if (draft) scope?.onArtifactDraft?.({ id: part.toolCallId, name: '', content: '', format: 'markdown', done: true })
        setStep(part.toolCallId, { status: 'failed', detail: part.error instanceof Error ? part.error.message : String(part.error) })
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
    releaseSandbox()
    // The scratchpad is only for this loop.
    if (scratchpad) disposeScratchpad(scratchpad)
  }
}
