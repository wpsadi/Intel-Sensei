import { type GoogleLanguageModelOptions, createGoogle } from '@ai-sdk/google'
import { generateText } from 'ai'

import { recordSdkUsage } from '@/ai/usage'
import { TEST_MODEL } from '@/constants/ai'

/** A short chat title from the start of a conversation, written by Gemini with minimal thinking so it comes back fast. */
export async function generateChatTitle(apiKey: string, transcript: string) {
  const { text, usage } = await generateText({
    model: createGoogle({ apiKey })(TEST_MODEL),
    prompt: `Write a short title of three to six words for this conversation. Reply with the title only.\n\n${transcript}`,
    providerOptions: { google: { thinkingConfig: { thinkingLevel: 'minimal' } } satisfies GoogleLanguageModelOptions },
    maxOutputTokens: 32,
  })
  void recordSdkUsage({ provider: 'google', model: TEST_MODEL }, usage)
  return text
    .trim()
    .replace(/^["'“”*]+|["'“”*.]+$/g, '')
    .slice(0, 80)
}
