import { generateText as generateWithModel } from 'ai'
import { createGoogle } from '@ai-sdk/google'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { GEMINI_MODEL } from '@/constants/ai'

/** Generates text for the notes page with the AI SDK. Uses the user's own key from Settings → AI features. */
export async function generateText(prompt: string, context = '') {
  const key = GEMINI_KEY.value
  if (!key) throw new Error('Add your Gemini API key in Settings → AI features to use AI.')
  const google = createGoogle({ apiKey: key })
  const { text } = await generateWithModel({
    model: google(GEMINI_MODEL),
    system: 'You write content for a notes page. Reply with plain text only, no preamble.',
    prompt: `Page content so far:\n${context.slice(0, 8000)}\n\nTask: ${prompt}`,
    maxOutputTokens: 1024,
  })
  return text
}
