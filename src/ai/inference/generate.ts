import { createGoogle } from '@ai-sdk/google'
import { generateText as generateWithModel } from 'ai'

import { recordSdkUsage } from '@/ai/usage'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { GEMINI_MODEL } from '@/constants/ai'

/** Generates text for the notes page with the AI SDK. Uses the user's own key from Settings → AI providers. */
export async function generateText(prompt: string, context = '') {
  const key = GEMINI_KEY.value
  if (!key) throw new Error('Add your Gemini API key in Settings → AI providers to use AI.')
  const google = createGoogle({ apiKey: key })
  const { text, usage } = await generateWithModel({
    model: google(GEMINI_MODEL),
    system: 'You write content for a notes page. Reply with plain text only, no preamble.',
    prompt: `Page content so far:\n${context.slice(0, 8000)}\n\nTask: ${prompt}`,
    maxOutputTokens: 1024,
  })
  void recordSdkUsage({ provider: 'google', model: GEMINI_MODEL }, usage)
  return text
}
