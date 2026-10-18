import { toast } from 'sonner'
import { create } from 'zustand'

import { chatWithSensei } from '@/ai/inference/chat'
import type { ChatProfile } from '@/ai/inference/chat-profile'
import { generateChatTitle } from '@/ai/inference/title'
import { episodicMemory, sessionMemory } from '@/ai/memory'
import { AI_MODELS } from '@/ai/providers'
import { type PendingMessage, demoteSteering, removePending, submitWhileBusy, takeNextPending } from '@/ai/send-queue'
import { currentTodos, messageText } from '@/ai/utils/messages'
import type { ChatTurn } from '@/ai/utils/messages'
import { artifactKind, useArtifacts } from '@/features/ask-sensei/artifact/artifact.store'
import { useTerminals } from '@/features/ask-sensei/terminal/terminal.store'
import { uid } from '@/features/note/db/changes'
import { deleteMedia } from '@/features/note/db/media'
import { chatMessagesRepo, chatsRepo } from '@/features/note/db/repo'
import type { Chat, ChatAnswers, ChatAttachment, ChatMessage } from '@/features/note/db/types'

/** Chats and their messages. IndexedDB is the source of truth; this store is the in-memory copy the UI reads. */
interface AskSenseiState {
  /** False until the first load from IndexedDB finishes. */
  ready: boolean
  chats: Chat[]
  messages: Record<string, ChatMessage[]>
  /** Id of the Sensei reply still streaming in each chat, by chat id. Chats reply independently of each other. */
  streaming: Record<string, string>
  /** Stops the streaming reply of a chat. What arrived so far is kept and marked as interrupted. */
  stopReply(chatId: string | null | undefined): void
  /** Sends the user's answers to the questions Sensei is waiting on, so the reply carries on. */
  answerQuestions(chatId: string, messageId: string, answers: ChatAnswers): void

  load(): Promise<void>
  createChat(): Promise<Chat>
  /** Saves the user's message and starts Sensei's reply. With no chat id, a new chat is created. Returns the chat id. */
  sendMessage(chatId: string | null, content: string, attachments?: ChatAttachment[], profile?: ChatProfile): Promise<string | null>
  /** Drops Sensei's last reply and streams a new one for the same question. */
  retryReply(chatId: string): Promise<void>
  /** Saves one message from a live call. Called again with the same id as the transcript grows. */
  saveCallMessage(
    chatId: string,
    id: string,
    role: ChatMessage['role'],
    content: string,
    reasoning?: string,
    extras?: Pick<ChatMessage, 'parts' | 'todos' | 'attachments'>,
  ): Promise<void>
  renameChat(id: string, title: string): Promise<void>
  setTodosCollapsed(id: string, collapsed: boolean): Promise<void>
  regenerateTitle(id: string): Promise<void>
  deleteChat(id: string): Promise<void>
}

const NO_KEY_REPLY = 'Add a key for your chat provider in Settings → AI providers to chat with Sensei.'
const DEFAULT_TITLE = 'New chat'

const historyOf = (messages: ChatMessage[]): ChatTurn[] =>
  messages
    .map((message) => ({ role: message.role, content: messageText(message), attachments: message.attachments }))
    .filter((turn) => turn.content || turn.attachments?.length)

export const useAskSenseiStore = create<AskSenseiState>()((set, get) => {
  /** Changes fields of one message in memory. */
  const patchMessage = (chatId: string, messageId: string, patch: Partial<ChatMessage>) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] ?? []).map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
      },
    }))

  /** Adds a message in memory and saves it to IndexedDB. */
  const addMessage = async (message: ChatMessage) => {
    await chatMessagesRepo.put(message)
    set((state) => ({ messages: { ...state.messages, [message.chatId]: [...(state.messages[message.chatId] ?? []), message] } }))
  }

  /** Moves a chat to the top of the list and saves it. */
  const touchChat = async (chatId: string, patch: Partial<Chat> = {}) => {
    const chat = get().chats.find((item) => item.id === chatId)
    if (!chat) return
    const updated: Chat = { ...chat, ...patch, updatedAt: Date.now() }
    await chatsRepo.put(updated)
    set((state) => ({ chats: state.chats.map((item) => (item.id === chatId ? updated : item)) }))
  }

  /** What each chat's streaming reply needs: a way to stop it, the steering messages it has not taken yet, and its pending questions. */
  interface Run {
    abort: AbortController
    steerBox: PendingMessage[]
    pendingAnswers: ((answers: ChatAnswers) => void) | null
  }
  const runs = new Map<string, Run>()

  /** Streams Sensei's reply to the conversation so far, then saves it. */
  const chatProfiles = new Map<string, ChatProfile>()
  const streamReply = async (chatId: string) => {
    const history = historyOf(get().messages[chatId] ?? [])
    const todos = currentTodos(get().messages[chatId] ?? [])
    const reply: ChatMessage = { id: uid(), chatId, role: 'assistant', content: '', createdAt: Date.now() }
    set((state) => ({
      streaming: { ...state.streaming, [chatId]: reply.id },
      messages: { ...state.messages, [chatId]: [...(state.messages[chatId] ?? []), reply] },
    }))

    const controller = new AbortController()
    const run: Run = { abort: controller, steerBox: [], pendingAnswers: null }
    runs.set(chatId, run)
    const current = () => get().messages[chatId]?.find((message) => message.id === reply.id)
    // Thinking runs from the request until the first words of the reply.
    const startedAt = Date.now()
    let reasoningSeconds: number | undefined
    const endThinking = () => {
      if (reasoningSeconds === undefined && current()?.reasoning) {
        reasoningSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
        patchMessage(chatId, reply.id, { reasoningSeconds })
      }
    }

    let finalText = ''
    try {
      if (!AI_MODELS.chat.key) {
        finalText = NO_KEY_REPLY
      } else {
        finalText = await chatWithSensei(
          history,
          (soFar) => {
            endThinking()
            patchMessage(chatId, reply.id, { content: soFar })
          },
          (soFar) => patchMessage(chatId, reply.id, { reasoning: soFar }),
          controller.signal,
          (plan) => patchMessage(chatId, reply.id, { plan }),
          (todos) => patchMessage(chatId, reply.id, { todos }),
          (searches) => patchMessage(chatId, reply.id, { searches }),
          {
            chatId,
            messageId: reply.id,
            todos,
            profile: chatProfiles.get(chatId),
            takeSteers: async () => {
              const taken = run.steerBox.splice(0)
              const turns: ChatTurn[] = []
              for (const pending of taken) {
                removePending(chatId, pending.id)
                const message: ChatMessage = {
                  id: uid(),
                  chatId,
                  role: 'user',
                  content: pending.text,
                  attachments: pending.attachments,
                  createdAt: Date.now(),
                }
                await addMessage(message)
                void episodicMemory.append({ id: message.id, chatId, role: 'user', content: pending.text })
                turns.push({ role: 'user', content: pending.text, attachments: pending.attachments })
              }
              if (taken.length) await touchChat(chatId)
              return turns
            },
            onUsage: (usage) => patchMessage(chatId, reply.id, { usage }),
            onSteps: (steps) => patchMessage(chatId, reply.id, { steps }),
            onFile: (file, callId) => {
              const have = current()?.attachments ?? []
              // A document written again under the same title is the same file: it keeps its one card.
              patchMessage(chatId, reply.id, {
                attachments: have.some((item) => item.src === file.src)
                  ? have.map((item) => (item.src === file.src ? file : item))
                  : [...have, file],
              })
              useArtifacts.getState().endDraft(callId)
              // A document Sensei made opens beside the chat; a picture stays under the reply.
              const kind = artifactKind(file)
              if (kind && kind !== 'image') useArtifacts.getState().show(file, chatId)
            },
            onArtifactDraft: (draft) =>
              draft.done
                ? useArtifacts.getState().endDraft(draft.id)
                : useArtifacts.getState().writeDraft({ ...draft, chatId, messageId: reply.id }),
            onAsk: (questions) =>
              new Promise<ChatAnswers>((resolve, reject) => {
                patchMessage(chatId, reply.id, { questions: { questions } })
                run.pendingAnswers = resolve
                // Stopping the reply while it waits gives up on the questions.
                controller.signal.addEventListener('abort', () => reject(new Error('Stopped')), { once: true })
              }),
          },
        )
      }
    } catch (error) {
      finalText = controller.signal.aborted
        ? (current()?.content ?? '')
        : `Sorry, Sensei could not reply: ${error instanceof Error ? error.message : 'unknown error'}`
    }

    // A document cut off half way (the reply was stopped) is not shown as still being written.
    useArtifacts.getState().endDraftsOf(reply.id)
    // Stopped while still thinking: the thinking time ends at the stop.
    endThinking()
    const thoughts = current()?.reasoning || undefined
    const plan = current()?.plan
    const replyTodos = current()?.todos
    const usage = current()?.usage
    const searches = current()?.searches
    const questions = current()?.questions
    const files = current()?.attachments
    // A call still running when the reply ended was cut off (the reply was stopped).
    const steps = current()?.steps?.map((step) =>
      step.status === 'running' ? { ...step, status: 'failed' as const, detail: 'Stopped' } : step,
    )
    const workedSeconds = steps?.length ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : undefined
    run.pendingAnswers = null
    const interrupted = controller.signal.aborted || undefined
    patchMessage(chatId, reply.id, { content: finalText, reasoning: thoughts, reasoningSeconds, interrupted, workedSeconds, steps })
    runs.delete(chatId)
    set((state) => {
      const { [chatId]: _done, ...rest } = state.streaming
      return { streaming: rest }
    })
    await chatMessagesRepo.put({
      ...reply,
      content: finalText,
      reasoning: thoughts,
      reasoningSeconds,
      interrupted,
      plan,
      todos: replyTodos,
      usage,
      searches,
      questions,
      attachments: files,
      steps,
      workedSeconds,
    })
    await touchChat(chatId)
    if (!interrupted) void episodicMemory.append({ id: reply.id, chatId, role: 'assistant', content: finalText })

    // The next message sent to this chat meanwhile goes now; steering messages the reply never took are sent like queued ones.
    demoteSteering(chatId)
    const next = takeNextPending(chatId)
    if (next) void get().sendMessage(next.chatId, next.message.text, next.message.attachments)
  }

  /** Names the chat with the title provider from its first few messages. Does nothing without a key or messages. */
  async function nameChat(id: string) {
    const transcript = (get().messages[id] ?? [])
      .slice(0, 6)
      .map(
        (message) =>
          `${message.role === 'user' ? 'User' : 'Sensei'}: ${message.content || message.attachments?.map((file) => file.name).join(', ') || ''}`,
      )
      .join('\n')
    if (!AI_MODELS.title.key || !transcript.trim()) return
    const title = await generateChatTitle(transcript)
    if (title) await get().renameChat(id, title)
  }

  return {
    ready: false,
    chats: [],
    messages: {},
    streaming: {},

    stopReply(chatId) {
      if (chatId) runs.get(chatId)?.abort.abort()
    },

    answerQuestions(chatId, messageId, answers) {
      const message = get().messages[chatId]?.find((item) => item.id === messageId)
      const run = runs.get(chatId)
      if (!message?.questions || !run?.pendingAnswers) return
      patchMessage(chatId, messageId, { questions: { ...message.questions, answers } })
      run.pendingAnswers(answers)
      run.pendingAnswers = null
    },

    async load() {
      if (get().ready) return
      const [chats, rows] = await Promise.all([chatsRepo.all(), chatMessagesRepo.all()])
      const messages: Record<string, ChatMessage[]> = {}
      for (const chat of chats) messages[chat.id] = []
      for (const row of rows.sort((a, b) => a.createdAt - b.createdAt)) (messages[row.chatId] ??= []).push(row)
      set({ chats, messages, ready: true })
    },

    async createChat() {
      const now = Date.now()
      const chat: Chat = { id: crypto.randomUUID(), title: DEFAULT_TITLE, createdAt: now, updatedAt: now }
      await chatsRepo.put(chat)
      set((state) => ({ chats: [chat, ...state.chats], messages: { ...state.messages, [chat.id]: [] } }))
      return chat
    },

    async sendMessage(chatId, content, attachments, profile) {
      const text = content.trim()
      if (!text && !attachments?.length) return null
      const chat = get().chats.find((item) => item.id === chatId) ?? (await get().createChat())
      // An app that limits Sensei to its own tools sets that on every message; replies, retries and queued messages reuse it.
      if (profile) chatProfiles.set(chat.id, profile)
      // A reply is running: the message waits for it, or steers it when it belongs to this chat.
      // Only a reply in this same chat makes it wait; other chats may be replying at the same time.
      const busy = runs.get(chat.id)
      if (busy) {
        submitWhileBusy(chat.id, { text, attachments }, (pending) => busy.steerBox.push(pending))
        return chat.id
      }
      const isFirstMessage = (get().messages[chat.id] ?? []).length === 0
      const userMessage: ChatMessage = { id: uid(), chatId: chat.id, role: 'user', content: text, attachments, createdAt: Date.now() }
      await addMessage(userMessage)
      void episodicMemory.append({ id: userMessage.id, chatId: chat.id, role: 'user', content: text })
      await touchChat(chat.id)
      // The chat keeps the default title until Gemini has named it from the first message.
      if (isFirstMessage) void nameChat(chat.id).catch(() => {})
      // The reply streams in the background, so the caller can open the chat straight away.
      void streamReply(chat.id)
      return chat.id
    },

    async retryReply(chatId) {
      if (runs.has(chatId)) return
      const messages = get().messages[chatId] ?? []
      const last = messages.at(-1)
      if (last?.role === 'assistant') {
        await chatMessagesRepo.remove(last.id)
        set((state) => ({ messages: { ...state.messages, [chatId]: messages.slice(0, -1) } }))
      }
      await streamReply(chatId)
    },

    async saveCallMessage(chatId, id, role, content, reasoning, extras) {
      const existing = get().messages[chatId]?.find((message) => message.id === id)
      if (existing) {
        patchMessage(chatId, id, { content, reasoning, ...extras })
        await chatMessagesRepo.put({ ...existing, content, reasoning, ...extras })
      } else {
        const isFirstMessage = (get().messages[chatId] ?? []).length === 0
        const message: ChatMessage = { id, chatId, role, content, reasoning, ...extras, createdAt: Date.now() }
        // Publish before awaiting storage: the next transcript chunk must update this same message.
        set((state) => ({ messages: { ...state.messages, [chatId]: [...(state.messages[chatId] ?? []), message] } }))
        await chatMessagesRepo.put(message)
        await touchChat(chatId)
        if (isFirstMessage && role === 'user') void nameChat(chatId).catch(() => {})
      }
    },

    async renameChat(id, title) {
      const chat = get().chats.find((item) => item.id === id)
      if (!chat) return
      const updated = { ...chat, title }
      await chatsRepo.put(updated)
      set((state) => ({ chats: state.chats.map((item) => (item.id === id ? updated : item)) }))
    },

    async setTodosCollapsed(id, collapsed) {
      const chat = get().chats.find((item) => item.id === id)
      if (!chat) return
      const updated = { ...chat, todosCollapsed: collapsed }
      set((state) => ({ chats: state.chats.map((item) => (item.id === id ? updated : item)) }))
      await chatsRepo.put(updated)
    },

    async regenerateTitle(id) {
      if (!AI_MODELS.title.key) {
        toast('Add a key for the title provider in Settings → AI providers to name chats')
        return
      }
      try {
        await nameChat(id)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not regenerate the title')
      }
    },

    async deleteChat(id) {
      runs.get(id)?.abort.abort()
      // Attachments live in Cache Storage, outside IndexedDB, so they are removed separately.
      const files = (get().messages[id] ?? []).flatMap((message) => message.attachments ?? [])
      await Promise.all(files.map((file) => deleteMedia(file.src)))
      await chatMessagesRepo.removeByChat(id)
      void episodicMemory.removeChat(id)
      void sessionMemory.clear(id)
      await chatsRepo.remove(id)
      // Its terminals and Python environment go with it.
      void useTerminals.getState().removeChat(id)
      set((state) => {
        const { [id]: _removed, ...rest } = state.messages
        return { chats: state.chats.filter((chat) => chat.id !== id), messages: rest }
      })
    },
  }
})
