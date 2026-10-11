import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { TRANSCRIBE_MODEL } from '@/constants/ai'

/** Transcribes a recorded voice note with the Gemini transcribe model. The transcript comes back in `audioTranscription`, not `text`. */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const key = GEMINI_KEY.value
  if (!key) throw new Error('Add your Gemini API key in Settings → AI features to use voice typing.')
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(audio)
  })
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe this audio exactly.' },
            { inlineData: { mimeType: audio.type.split(';')[0] || 'audio/webm', data } },
          ],
        },
      ],
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error?.message ?? `Transcription failed (${response.status})`)
  const parts = (body.candidates?.[0]?.content?.parts ?? []) as { text?: string; audioTranscription?: { text?: string } }[]
  const transcript = parts.map((part) => part.audioTranscription?.text ?? part.text ?? '').join('').trim()
  if (!transcript) throw new Error('No speech was recognised.')
  return transcript
}
