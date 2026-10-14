import { streamText } from 'ai'

import { type Provider, languageModel } from '@/ai/providers'
import type { ChatTurn } from '@/ai/utils/messages'
import { TITLE_MODELS } from '@/constants/ai'

/**
 * Streams a plain, tool-free conversation with the provider's title model, so a key can be checked. It uses the key
 * and base URL passed in, so it works before they are saved. `onText` receives the reply as it grows.
 */
export async function testChat(provider: Provider, key: string, baseURL: string, messages: ChatTurn[], onText: (soFar: string) => void) {
  const result = streamText({
    model: languageModel(provider, TITLE_MODELS[provider], key, baseURL || undefined),
    messages: messages.map(({ role, content }) => ({ role, content })),
  })
  let reply = ''
  let streamError: unknown
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      reply += part.text
      onText(reply)
    } else if (part.type === 'error') {
      streamError = part.error
    }
  }
  if (streamError) throw streamError
  return reply.trim()
}
