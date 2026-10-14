import { generateText } from 'ai'

import { AI_MODELS, minimalThinking } from '@/ai/providers'
import { recordSdkUsage } from '@/ai/usage'

/** One short line from the provider picked for titles in Settings, with minimal thinking so it comes back fast. */
async function shortText(prompt: string, maxOutputTokens: number, maxLength: number) {
  const { provider, key, model } = AI_MODELS.title
  if (!key) throw new Error('Add a key for the title provider in Settings → AI providers.')
  const { text, usage } = await generateText({
    model: AI_MODELS.titleModel,
    prompt,
    providerOptions: minimalThinking(provider),
    maxOutputTokens,
  })
  void recordSdkUsage({ provider, model }, usage)
  return text
    .trim()
    .replace(/^["'“”*]+|["'“”*.]+$/g, '')
    .slice(0, maxLength)
}

/** A short file name for a design or 3D project, from what the user first asked the agent to make. */
export const generateFileTitle = (request: string) =>
  shortText(
    `Write a short file name of two to four words for a project made from this request. Reply with the name only, in Title Case, with no quotes or file extension.\n\n${request}`,
    24,
    60,
  )

/** A short chat title from the start of a conversation. */
export const generateChatTitle = (transcript: string) =>
  shortText(`Write a short title of three to six words for this conversation. Reply with the title only.\n\n${transcript}`, 32, 80)
