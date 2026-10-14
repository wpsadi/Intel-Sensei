import { AI_MODELS } from '@/ai/providers'

const blobToBase64 = (audio: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(audio)
  })

/** Transcribes with Gemini. The transcript comes back in `audioTranscription`, not `text`. */
async function transcribeWithGemini(audio: Blob, key: string, model: string) {
  const data = await blobToBase64(audio)
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Transcribe this audio exactly.' }, { inlineData: { mimeType: audio.type.split(';')[0] || 'audio/webm', data } }],
        },
      ],
    }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error?.message ?? `Transcription failed (${response.status})`)
  const parts = (body.candidates?.[0]?.content?.parts ?? []) as { text?: string; audioTranscription?: { text?: string } }[]
  return parts.map((part) => part.audioTranscription?.text ?? part.text ?? '').join('')
}

/** Transcribes a recorded voice note with the model picked for speech to text in Settings. */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const { key, model } = AI_MODELS.transcribe
  if (!key) throw new Error('Add a key for your speech to text provider in Settings → AI providers to use voice typing.')
  const transcript = (await transcribeWithGemini(audio, key, model)).trim()
  if (!transcript) throw new Error('No speech was recognised.')
  return transcript
}
