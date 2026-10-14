import { createGoogle } from '@ai-sdk/google'
import { experimental_generateSpeech as generateSpeech } from 'ai'

import { TTS_MODEL } from '@/constants/ai'

/** The voice that reads replies aloud. */
const TTS_VOICE = 'Kore'

/** Speech for a piece of text from Gemini, as a playable audio blob. */
export async function generateReplySpeech(apiKey: string, text: string, abortSignal?: AbortSignal) {
  const { audio } = await generateSpeech({
    model: createGoogle({ apiKey }).speech(TTS_MODEL),
    text,
    voice: TTS_VOICE,
    abortSignal,
  })
  return new Blob([audio.uint8Array as BlobPart], { type: audio.mediaType })
}
