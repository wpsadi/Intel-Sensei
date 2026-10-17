import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chatMessagesRepo } from '@/features/note/db/repo'

import { useAskSenseiStore } from './ask-sensei.store'

vi.mock('@/ai/inference/chat', () => ({ chatWithSensei: vi.fn() }))
vi.mock('@/ai/inference/title', () => ({ generateChatTitle: vi.fn() }))
vi.mock('@/ai/memory', () => ({ episodicMemory: {}, sessionMemory: {} }))
vi.mock('@/ai/providers', () => ({ AI_MODELS: { title: { key: '' } } }))
vi.mock('@/features/note/db/repo', () => ({
  chatMessagesRepo: { put: vi.fn() },
  chatsRepo: { put: vi.fn() },
}))

describe('live call messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAskSenseiStore.setState({ chats: [], messages: {} })
  })

  it.each(['user', 'assistant'] as const)('updates one %s message while its first save is pending', async (role) => {
    const writes: (() => void)[] = []
    vi.mocked(chatMessagesRepo.put).mockImplementation(() => new Promise<void>((resolve) => writes.push(resolve)))
    const save = useAskSenseiStore.getState().saveCallMessage
    const first = save('chat', 'turn', role, 'Hi')
    const second = save('chat', 'turn', role, 'Hi there')
    const third = save('chat', 'turn', role, 'Hi there, how can I help?')

    expect(useAskSenseiStore.getState().messages.chat).toEqual([
      expect.objectContaining({ id: 'turn', role, content: 'Hi there, how can I help?' }),
    ])

    // Completing older writes must not add their partial transcripts back to the conversation.
    for (const finish of writes.toReversed()) finish()
    await Promise.all([first, second, third])
    expect(useAskSenseiStore.getState().messages.chat).toEqual([
      expect.objectContaining({ id: 'turn', role, content: 'Hi there, how can I help?' }),
    ])
  })

  it('keeps consecutive speakers in arrival order while storage is pending', async () => {
    const writes: (() => void)[] = []
    vi.mocked(chatMessagesRepo.put).mockImplementation(() => new Promise<void>((resolve) => writes.push(resolve)))
    const save = useAskSenseiStore.getState().saveCallMessage
    const user = save('chat', 'user-turn', 'user', 'Hello')
    const assistant = save('chat', 'assistant-turn', 'assistant', 'Hi there')

    for (const finish of writes.toReversed()) finish()
    await Promise.all([user, assistant])
    expect(useAskSenseiStore.getState().messages.chat.map((message) => message.id)).toEqual(['user-turn', 'assistant-turn'])
  })
})
