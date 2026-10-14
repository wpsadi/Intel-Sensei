import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'

import type { ChatTurn } from '@/ai/utils/messages'
import { ANTHROPIC_TEST_MODEL, OPENAI_TEST_MODEL } from '@/constants/ai'

/** Streams a plain, tool-free conversation, so a key can be checked. `onText` receives the reply as it grows. */
async function streamPlain(model: Parameters<typeof streamText>[0]['model'], messages: ChatTurn[], onText: (soFar: string) => void) {
  const result = streamText({ model, messages: messages.map(({ role, content }) => ({ role, content })) })
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

/** Test chat with the OpenAI key passed in (and an optional base URL), so it works before the key is saved. */
export const chatWithOpenAI = (apiKey: string, baseURL: string, messages: ChatTurn[], onText: (soFar: string) => void) =>
  streamPlain(createOpenAI({ apiKey, baseURL: baseURL || undefined })(OPENAI_TEST_MODEL), messages, onText)

/** Test chat with the Anthropic key passed in (and an optional base URL), so it works before the key is saved. */
export const chatWithAnthropic = (apiKey: string, baseURL: string, messages: ChatTurn[], onText: (soFar: string) => void) =>
  streamPlain(
    // Anthropic refuses browser calls unless the request says it is deliberate; the key is the user's own, kept in their browser.
    createAnthropic({ apiKey, baseURL: baseURL || undefined, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(
      ANTHROPIC_TEST_MODEL,
    ),
    messages,
    onText,
  )
