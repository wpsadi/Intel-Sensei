import { currentTodos, messageText } from '@/ai/utils/messages'
import { episodicMemory, sessionMemory } from '@/ai/memory'
import { toast } from 'sonner'
import { create } from 'zustand'
import type { Chat, ChatAnswers, ChatAttachment, ChatMessage } from '@/features/note/db/types'
import { deleteMedia } from '@/features/note/db/media'
import { chatMessagesRepo, chatsRepo } from '@/features/note/db/repo'
import { uid } from '@/features/note/db/idb'
import { chatWithGemini } from '@/ai/inference/chat'
import { generateChatTitle } from '@/ai/inference/title'
import type { ChatTurn } from '@/ai/utils/messages'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'

/** Chats and their messages. IndexedDB is the source of truth; this store is the in-memory copy the UI reads. */
interface AskSenseiState {
  /** False until the first load from IndexedDB finishes. */
  ready: boolean
  chats: Chat[]
  messages: Record<string, ChatMessage[]>
  /** Id of the Sensei reply that is still streaming, if any. */
  streamingId: string | null
  /** Stops the streaming reply. What arrived so far is kept and marked as interrupted. */
  stopReply(): void
  /** Sends the user's answers to the questions Sensei is waiting on, so the reply carries on. */
  answerQuestions(chatId: string, messageId: string, answers: ChatAnswers): void

  load(): Promise<void>
  createChat(): Promise<Chat>
  /** Saves the user's message and starts Sensei's reply. With no chat id, a new chat is created. Returns the chat id. */
  sendMessage(chatId: string | null, content: string, attachments?: ChatAttachment[]): Promise<string | null>
  /** Drops Sensei's last reply and streams a new one for the same question. */
  retryReply(chatId: string): Promise<void>
  /** Saves one message from a live call. Called again with the same id as the transcript grows. */
  saveCallMessage(chatId: string, id: string, role: ChatMessage['role'], content: string, reasoning?: string, extras?: Pick<ChatMessage, 'parts' | 'todos'>): Promise<void>
  renameChat(id: string, title: string): Promise<void>
  setTodosCollapsed(id: string, collapsed: boolean): Promise<void>
  regenerateTitle(id: string): Promise<void>
  deleteChat(id: string): Promise<void>
}

const NO_KEY_REPLY = 'Add your Gemini API key in Settings → AI features to chat with Sensei.'
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

  /** Aborts the reply that is streaming now. */
  let abort: AbortController | null = null
  /** Resolves the questions the streaming reply is waiting on. */
  let pendingAnswers: ((answers: ChatAnswers) => void) | null = null

  /** Streams Sensei's reply to the conversation so far, then saves it. */
  const streamReply = async (chatId: string) => {
    const history = historyOf(get().messages[chatId] ?? [])
    const todos = currentTodos(get().messages[chatId] ?? [])
    const reply: ChatMessage = { id: uid(), chatId, role: 'assistant', content: '', createdAt: Date.now() }
    set((state) => ({
      streamingId: reply.id,
      messages: { ...state.messages, [chatId]: [...(state.messages[chatId] ?? []), reply] },
    }))

    const controller = new AbortController()
    abort = controller
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
      const key = GEMINI_KEY.value
      if (!key) {
        finalText = NO_KEY_REPLY
      } else {
        finalText = await chatWithGemini(
          key,
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
            onUsage: (usage) => patchMessage(chatId, reply.id, { usage }),
            onAsk: (questions) =>
              new Promise<ChatAnswers>((resolve, reject) => {
                patchMessage(chatId, reply.id, { questions: { questions } })
                pendingAnswers = resolve
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

    // Stopped while still thinking: the thinking time ends at the stop.
    endThinking()
    const thoughts = current()?.reasoning || undefined
    const plan = current()?.plan
    const replyTodos = current()?.todos
    const usage = current()?.usage
    const searches = current()?.searches
    const questions = current()?.questions
    pendingAnswers = null
    const interrupted = controller.signal.aborted || undefined
    if (abort === controller) abort = null
    patchMessage(chatId, reply.id, { content: finalText, reasoning: thoughts, reasoningSeconds, interrupted })
    set({ streamingId: null })
    await chatMessagesRepo.put({ ...reply, content: finalText, reasoning: thoughts, reasoningSeconds, interrupted, plan, todos: replyTodos, usage, searches, questions })
    await touchChat(chatId)
    if (!interrupted) void episodicMemory.append({ id: reply.id, chatId, role: 'assistant', content: finalText })
  }

  /** Names the chat with Gemini from its first few messages. Does nothing without a key or messages. */
  async function nameChat(id: string) {
    const key = GEMINI_KEY.value
    const transcript = (get().messages[id] ?? [])
      .slice(0, 6)
      .map((message) => `${message.role === 'user' ? 'User' : 'Sensei'}: ${message.content || message.attachments?.map((file) => file.name).join(', ') || ''}`)
      .join('\n')
    if (!key || !transcript.trim()) return
    const title = await generateChatTitle(key, transcript)
    if (title) await get().renameChat(id, title)
  }

  return {
    ready: false,
    chats: [],
    messages: {},
    streamingId: null,

    stopReply() {
      abort?.abort()
    },

    answerQuestions(chatId, messageId, answers) {
      const message = get().messages[chatId]?.find((item) => item.id === messageId)
      if (!message?.questions || !pendingAnswers) return
      patchMessage(chatId, messageId, { questions: { ...message.questions, answers } })
      pendingAnswers(answers)
      pendingAnswers = null
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

    async sendMessage(chatId, content, attachments) {
      const text = content.trim()
      if (!text && !attachments?.length) return null
      const chat = get().chats.find((item) => item.id === chatId) ?? (await get().createChat())
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
      if (get().streamingId) return
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
        await addMessage({ id, chatId, role, content, reasoning, ...extras, createdAt: Date.now() })
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
      const key = GEMINI_KEY.value
      if (!key) {
        toast('Add your Gemini API key in Settings → AI features to name chats')
        return
      }
      try {
        await nameChat(id)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Could not regenerate the title')
      }
    },

    async deleteChat(id) {
      // Attachments live in Cache Storage, outside IndexedDB, so they are removed separately.
      const files = (get().messages[id] ?? []).flatMap((message) => message.attachments ?? [])
      await Promise.all(files.map((file) => deleteMedia(file.src)))
      await chatMessagesRepo.removeByChat(id)
      void episodicMemory.removeChat(id)
      void sessionMemory.clear(id)
      await chatsRepo.remove(id)
      set((state) => {
        const { [id]: _removed, ...rest } = state.messages
        return { chats: state.chats.filter((chat) => chat.id !== id), messages: rest }
      })
    },
  }
})
