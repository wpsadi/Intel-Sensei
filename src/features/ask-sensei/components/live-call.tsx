import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { type CallToolEvent, LiveCall } from '@/ai/inference/call'
import {
  MEMORY_INSTRUCTIONS,
  SCRATCHPAD_INSTRUCTIONS,
  type Scratchpad,
  createMemoryTool,
  createScratchpad,
  createScratchpadTool,
  disposeScratchpad,
  episodicMemory,
  memoryPrompt,
} from '@/ai/memory'
import { holdSandbox, warmSandbox } from '@/ai/sandbox/client'
import { SKILLS_INSTRUCTIONS, createSkillTools, skillsPrompt } from '@/ai/skills/tools'
import { DEEP_ANSWER_INSTRUCTIONS, createDeepAnswerTool } from '@/ai/tools/deep-answer'
import { GENERAL_INSTRUCTIONS, createGeneralTools } from '@/ai/tools/general'
import { PLAN_INSTRUCTIONS, createPlanTools } from '@/ai/tools/plan'
import { createSearchTool, upsertSearch } from '@/ai/tools/search'
import { TODO_INSTRUCTIONS, createTodoTools } from '@/ai/tools/todo'
import { currentTodos, messageText } from '@/ai/utils/messages'
import { describeToolCall } from '@/ai/utils/tool-steps'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import { uid } from '@/features/note/db/changes'
import type { ChatPart, ChatTodoList } from '@/features/note/db/types'

/** Replaces the item with the same id, or adds it at the end. */
const upsertById = <T extends { id: string }>(items: T[], item: T) =>
  items.some((other) => other.id === item.id) ? items.map((other) => (other.id === item.id ? item : other)) : [...items, item]

/** idle: no call. connecting: mic and Gemini Live are being set up. live: talking with Sensei. */
export type CallState = 'idle' | 'connecting' | 'live'

/** The message currently being transcribed: who is speaking, its id, the words so far, and Sensei's thinking. */
interface CallTurn {
  role: 'user' | 'assistant'
  id: string
  text: string
  thoughts: string
  /** Everything in the reply in the order it happened: speech, searches, tool calls and the plan card. */
  parts: ChatPart[]
  /** The to-do list Sensei made during this reply. It is pinned above the input rather than shown in the reply. */
  todos?: ChatTodoList
}

/** CSS variable on <html> holding how loud the call is (0 to 1). The page's aurora scales with it. */
export const CALL_LEVEL_VAR = '--call-level'

/**
 * A live voice call with Sensei, straight from the browser with the saved Gemini key.
 * The call knows the open chat, and both sides are transcribed into it as they speak.
 * With no chat open, starting a call creates one and `onChatOpened` moves to it.
 */
export function useLiveCall(chatId: string | null, onChatOpened: (id: string) => void) {
  const [state, setState] = useState<CallState>('idle')
  const [muted, setMutedState] = useState(false)
  const callRef = useRef<LiveCall | null>(null)
  /** The scratchpad of the running call, tied to its chat and to an id for the call. */
  const padRef = useRef<Scratchpad | null>(null)
  const chatRef = useRef<string | null>(null)
  const turnRef = useRef<CallTurn | null>(null)

  // Leaving the page ends the call.
  useEffect(() => () => void callRef.current?.stop(), [])

  // While the call runs, write its loudness to a CSS variable every frame. A variable avoids re-rendering React 60 times a second.
  useEffect(() => {
    if (state !== 'live') return
    const root = document.documentElement
    let smoothed = 0
    let frame = requestAnimationFrame(function tick() {
      // Rise fast, fall slowly, so the aurora breathes instead of flickering.
      const level = callRef.current?.level() ?? 0
      smoothed = level > smoothed ? level : smoothed * 0.9 + level * 0.1
      root.style.setProperty(CALL_LEVEL_VAR, smoothed.toFixed(3))
      frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      root.style.removeProperty(CALL_LEVEL_VAR)
    }
  }, [state])

  /** The words of a turn for copy and memory: the written answers when there are any, since the narration only summarises them. */
  const contentOf = (turn: CallTurn | null) => {
    if (!turn) return ''
    const answers = turn.parts.flatMap((part) => (part.type === 'answer' ? [part.text] : []))
    return (answers.length ? answers.join('\n\n') : turn.text).trim()
  }

  /** A finished turn goes into episodic memory, so the call can be found later like any other part of the chat. */
  const finishTurn = () => {
    const turn = turnRef.current
    const chat = chatRef.current
    turnRef.current = null
    const content = contentOf(turn)
    if (turn && chat && content) void episodicMemory.append({ id: turn.id, chatId: chat, role: turn.role, content })
  }

  /** Saves the turn as one message. A reply keeps its parts, so speech and tool calls stay together in order. */
  const saveTurn = (turn: CallTurn) => {
    const chat = chatRef.current
    if (!chat) return
    const text = contentOf(turn)
    const thoughts = turn.thoughts.trim() || undefined
    const extras = turn.role === 'assistant' ? { parts: turn.parts, todos: turn.todos } : undefined
    if (text || thoughts || turn.parts.length)
      void useAskSenseiStore.getState().saveCallMessage(chat, turn.id, turn.role, text, thoughts, extras)
  }

  /** The message being written by this speaker. It carries on until the other side speaks, so one reply is one message. */
  const turnOf = (role: CallTurn['role']) => {
    let turn = turnRef.current
    if (turn && turn.role !== role) {
      finishTurn()
      turn = null
    }
    turn ??= { role, id: uid(), text: '', thoughts: '', parts: [] }
    turnRef.current = turn
    return turn
  }

  /** Adds a piece of speech to the current message, or starts a new message when the speaker changes. Thinking goes into the reasoning of Sensei's message. */
  const addPiece = (kind: CallTurn['role'] | 'thought', piece: string) => {
    if (!chatRef.current) return
    const role = kind === 'thought' ? 'assistant' : kind
    // Blank transcription, such as the mic hearing silence or Sensei's own voice, must not cut Sensei's reply in two.
    if (!piece.trim() && turnRef.current?.role !== role) return
    const turn = turnOf(role)
    if (kind === 'thought') {
      turn.thoughts += piece
    } else {
      const last = turn.parts.at(-1)
      if (last?.type === 'text') {
        turn.parts = [...turn.parts.slice(0, -1), { type: 'text', text: last.text + piece }]
      } else {
        // Words after a search or tool call start a new paragraph of the same reply.
        if (turn.text.trim()) turn.text += '\n\n'
        turn.parts = [...turn.parts, { type: 'text', text: piece }]
      }
      turn.text += piece
    }
    saveTurn(turn)
  }

  /** Changes Sensei's current message, and starts one when the user was speaking. */
  const changeReply = (change: (turn: CallTurn) => void) => {
    if (!chatRef.current) return
    const turn = turnOf('assistant')
    change(turn)
    saveTurn(turn)
  }

  /** Shows each tool call as a step while it runs, grouped with the calls right before it. */
  const showTool = (event: CallToolEvent) => {
    // Web searches and plans show as their own parts, through their tools' callbacks, so they are not repeated as steps.
    if (event.name === 'webSearch' || event.name === 'createPlan') return
    const { label, detail } = describeToolCall(event.name, event.args)
    changeReply((turn) => {
      // Where the call fell in the thinking (as saved, trimmed), so the reasoning block shows thoughts and calls in order.
      const previous = turn.parts.flatMap((part) => (part.type === 'steps' ? part.steps : [])).find((s) => s.id === event.id)
      const at = previous?.at ?? turn.thoughts.trimStart().length
      const step = {
        id: event.id,
        name: event.name,
        label,
        status: event.status,
        detail: event.status === 'failed' ? event.error : (event.result ?? detail),
        at,
      }
      const last = turn.parts.at(-1)
      turn.parts =
        last?.type === 'steps'
          ? [...turn.parts.slice(0, -1), { type: 'steps', steps: upsertById(last.steps, step) }]
          : [...turn.parts, { type: 'steps', steps: [step] }]
    })
  }

  const start = async () => {
    if (callRef.current) return
    setState('connecting')
    setMutedState(false)
    const store = useAskSenseiStore.getState()
    const chat = chatId ?? (await store.createChat()).id
    if (chat !== chatId) onChatOpened(chat)
    chatRef.current = chat
    turnRef.current = null
    const history = (useAskSenseiStore.getState().messages[chat] ?? [])
      .map((message) => ({ role: message.role, text: messageText(message) }))
      .filter((turn) => turn.text)
      .map((turn) => `${turn.role === 'user' ? 'User' : 'Sensei'}: ${turn.text}`)
      .join('\n')

    const pad = createScratchpad(chat, uid())
    padRef.current = pad
    let releaseSandbox: (() => void) | undefined
    const call = new LiveCall({
      onChange: (next, error) => {
        if (next === 'idle') {
          releaseSandbox?.()
          finishTurn()
          if (padRef.current) disposeScratchpad(padRef.current)
          padRef.current = null
          callRef.current = null
          chatRef.current = null
          setState('idle')
          if (error) toast.error(error)
        } else {
          setState('live')
        }
      },
      onTranscript: addPiece,
      history,
      tools: {
        ...createGeneralTools({
          session: chat,
          attachments: () => (useAskSenseiStore.getState().messages[chat] ?? []).flatMap((message) => message.attachments ?? []),
        }),
        webSearch: createSearchTool((search) =>
          changeReply((turn) => {
            const last = turn.parts.at(-1)
            turn.parts =
              last?.type === 'searches'
                ? [...turn.parts.slice(0, -1), { type: 'searches', searches: upsertSearch(last.searches, search) }]
                : [...turn.parts, { type: 'searches', searches: [search] }]
          }),
        ),
        memory: createMemoryTool({ chatId: chat }),
        scratchpad: createScratchpadTool(pad),
        ...createPlanTools((plan) =>
          changeReply((turn) => {
            const rest = turn.parts.filter((part) => part.type !== 'plan')
            turn.parts = plan ? [...rest, { type: 'plan', plan }] : rest
          }),
        ),
        ...createTodoTools(
          (todos) => changeReply((turn) => void (turn.todos = todos ?? undefined)),
          currentTodos(useAskSenseiStore.getState().messages[chat] ?? []),
        ),
        ...createSkillTools(),
        deepAnswer: createDeepAnswerTool({
          chatId: chat,
          onProgress: (id, progress) => callRef.current?.reportToolProgress(id, progress),
          history: () =>
            (useAskSenseiStore.getState().messages[chat] ?? [])
              .map((message) => ({ role: message.role, content: messageText(message) }))
              .filter((turn) => turn.content),
          // The deep model's answer fills one answer part as it is written, next to what the voice says.
          onAnswer: (id, soFar) =>
            changeReply((turn) => {
              const exists = turn.parts.some((part) => part.type === 'answer' && part.id === id)
              turn.parts = exists
                ? turn.parts.map((part) => (part.type === 'answer' && part.id === id ? { ...part, text: soFar } : part))
                : [...turn.parts, { type: 'answer', id, text: soFar }]
            }),
          onTodos: (todos) => changeReply((turn) => void (turn.todos = todos ?? undefined)),
          todos: () => currentTodos(useAskSenseiStore.getState().messages[chat] ?? []),
          // The deep model's own web searches show as one group of searches before its answer.
          onSearches: (searches) =>
            changeReply((turn) => {
              const last = turn.parts.at(-1)
              turn.parts =
                last?.type === 'searches'
                  ? [...turn.parts.slice(0, -1), { type: 'searches', searches }]
                  : [...turn.parts, { type: 'searches', searches }]
            }),
        }),
      },
      // The deep answer runs in the background, so the voice keeps talking meanwhile.
      nonBlocking: ['deepAnswer'],
      instructions: [
        `You handle the spoken conversation during this live call. Delegate research and substantive tasks to deepAnswer, which runs the normal chat agent and feeds you progress and findings while it works. For direct requests to operate the user's active SBrowse iframe, use the browser tools and explain what you are doing. Never claim work happened unless a tool result or progress update confirms it.`,
        GENERAL_INSTRUCTIONS,
        SKILLS_INSTRUCTIONS,
        await skillsPrompt(),
        await memoryPrompt({ chatId: chat }),
        MEMORY_INSTRUCTIONS,
        SCRATCHPAD_INSTRUCTIONS,
        PLAN_INSTRUCTIONS,
        TODO_INSTRUCTIONS,
        DEEP_ANSWER_INSTRUCTIONS,
      ]
        .filter(Boolean)
        .join('\n\n'),
      onTool: showTool,
    })
    callRef.current = call
    try {
      releaseSandbox = holdSandbox(chat)
      warmSandbox(chat)
      await call.start()
    } catch (error) {
      await call.stop()
      toast.error(error instanceof Error ? error.message : 'Could not start the call.')
    }
  }

  const end = () => void callRef.current?.stop()

  const setMuted = (next: boolean) => {
    callRef.current?.setMuted(next)
    setMutedState(next)
  }

  /** Typed text goes into the call and into the chat as its own message. */
  const sendText = (text: string) => {
    callRef.current?.sendText(text)
    finishTurn()
    addPiece('user', text)
    finishTurn()
  }

  return { state, muted, start, end, setMuted, sendText }
}
