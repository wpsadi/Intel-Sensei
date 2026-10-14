import { experimental_generateSpeech as generateSpeech } from 'ai'

import { AI_MODELS } from '@/ai/providers'

/** The voice that reads replies aloud. */
const TTS_VOICE = 'Kore'

/** Speech for a piece of text from the provider picked for text to speech, as a playable audio blob. */
export async function generateReplySpeech(text: string, abortSignal?: AbortSignal) {
  if (!AI_MODELS.tts.key) throw new Error('Add a key for your text to speech provider in Settings → AI providers.')
  const { audio } = await generateSpeech({ model: AI_MODELS.ttsModel, text, voice: TTS_VOICE, abortSignal })
  return new Blob([audio.uint8Array as BlobPart], { type: audio.mediaType })
}
