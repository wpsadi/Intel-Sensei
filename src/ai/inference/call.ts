import {
  Behavior,
  FunctionResponseScheduling,
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Session,
  ThinkingLevel,
} from '@google/genai'
import type { Tool } from 'ai'
import { z } from 'zod'

import { currentTimePrompt } from '@/ai/utils/current-time'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { LIVE_MODEL } from '@/constants/ai'

/** Gemini Live takes 16 kHz mono PCM in and sends 24 kHz mono PCM back. */
const INPUT_RATE = 16000
const OUTPUT_RATE = 24000

/** Runs in the audio thread and hands each block of microphone samples to the page. */
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel) this.port.postMessage(channel.slice(0))
    return true
  }
}
registerProcessor('capture', Capture)
`

/** Float samples in [-1, 1] to 16-bit PCM, base64 encoded for the Live API. */
function toBase64Pcm(samples: Float32Array) {
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Base64 16-bit PCM from the model to float samples. */
function fromBase64Pcm(data: string) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const pcm = new Int16Array(bytes.buffer)
  const samples = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 0x8000
  return samples
}

/** A tool call during the call: it starts as 'running' and ends as 'done' or 'failed'. */
export interface CallToolEvent {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'failed'
  error?: string
}

/** What a live call needs from the page. */
export interface LiveCallOptions {
  /** Reports 'live' once connected and 'idle' when the call ends. `error` is set when it ends because of a failure. */
  onChange: (state: 'live' | 'idle', error?: string) => void
  /** Receives the words of both sides as they are transcribed, and Sensei's thinking, a piece at a time. */
  onTranscript: (role: 'user' | 'assistant' | 'thought', piece: string) => void
  /** The chat so far, as "User:/Sensei:" lines, so the call carries on from it. */
  history?: string
  /** The tools the model can call. Each tool's description and zod schema become its function declaration. */
  tools?: Record<string, Tool>
  /** Tools that run in the background: the model keeps talking, and says the result when it arrives. */
  nonBlocking?: string[]
  /** Added to the call's instructions: memory and how to use the tools. */
  instructions?: string
  /** Told when a tool call starts and when it ends, so the chat can show the work. */
  onTool?: (event: CallToolEvent) => void
}

/**
 * One live voice call with Gemini, straight from the browser using the user's own key.
 * Mic audio goes up as it is spoken, and the model's voice plays back as it arrives.
 */
export class LiveCall {
  private session: Session | null = null
  private mic: MediaStream | null = null
  private inputContext: AudioContext | null = null
  private outputContext: AudioContext | null = null
  private playing = new Set<AudioBufferSourceNode>()
  private nextStart = 0
  /** Analyser on Sensei's voice, read by `level()`. */
  private voiceAnalyser: AnalyserNode | null = null
  private voiceOut: GainNode | null = null
  private samples = new Uint8Array(512)
  private stopped = false

  private options: LiveCallOptions

  constructor(options: LiveCallOptions) {
    this.options = options
  }

  async start() {
    const key = GEMINI_KEY.value
    if (!key) throw new Error('Add your Gemini API key in Settings → AI providers to start a live call.')

    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    this.outputContext = new AudioContext({ sampleRate: OUTPUT_RATE })
    this.inputContext = new AudioContext({ sampleRate: INPUT_RATE })
    // Sensei's voice goes through one gain node, so a single analyser hears all of it.
    this.voiceOut = this.outputContext.createGain()
    this.voiceAnalyser = this.outputContext.createAnalyser()
    this.voiceAnalyser.fftSize = 512
    this.voiceOut.connect(this.voiceAnalyser)
    this.voiceAnalyser.connect(this.outputContext.destination)

    const ai = new GoogleGenAI({ apiKey: key })
    this.session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        // Only the extended-thinking model takes a thinking level, and it needs one in setup. The base
        // gemini-3.8-live rejects thinkingConfig and closes the socket, so it is left out there.
        ...(LIVE_MODEL.includes('extended-thinking') && { thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM, includeThoughts: true } }),
        systemInstruction:
          "You are Sensei, a friendly, general-purpose assistant on a live voice call. Help with the user's request across topics; do not steer the conversation toward studying unless asked. Keep replies short and conversational, because they are spoken aloud. After a tool call, carry on from where you stopped: never say again what you already said. Do not use tools for a plain answer.\n\n" +
          currentTimePrompt() +
          (this.options.instructions ? `\n\n${this.options.instructions}` : '') +
          ((this.options.history ?? '')
            ? `\n\nThis call continues the text chat below. Treat it as what you and the user already said.\n\n${this.options.history ?? ''}`
            : ''),
        // The same tools the text chat has, answered in handleToolCalls.
        tools: [
          {
            functionDeclarations: [
              // Each tool's own description and zod input schema become the Live API's function declaration.
              ...Object.entries(this.options.tools ?? {}).map(([name, item]) => {
                const { $schema: _schema, ...parametersJsonSchema } = z.toJSONSchema(item.inputSchema as z.ZodType)
                return {
                  name,
                  description: typeof item.description === 'string' ? item.description : undefined,
                  parametersJsonSchema,
                  // A non-blocking tool runs in the background while the model keeps talking.
                  ...(this.options.nonBlocking?.includes(name) && { behavior: Behavior.NON_BLOCKING }),
                }
              }),
            ],
          },
        ],
        // Both sides are transcribed so the call shows up in the chat.
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => this.options.onChange('live'),
        onmessage: (message) => this.handleMessage(message),
        onerror: () => void this.stop('The live call hit an error.'),
        // A close the server asked for (such as a rejected setup) comes with a reason, which is shown instead of ending silently.
        onclose: (event) => void this.stop(event.code !== 1000 && event.reason ? `The live call closed: ${event.reason}` : undefined),
      },
    })

    await this.startMicrophone()
  }

  /** Muting turns the mic track off, so silence goes up instead of speech. */
  setMuted(muted: boolean) {
    this.mic?.getAudioTracks().forEach((track) => (track.enabled = !muted))
  }

  /** Sends typed text into the call; Sensei answers it out loud. */
  sendText(text: string) {
    this.session?.sendRealtimeInput({ text })
  }

  /** How loud Sensei's voice is right now, 0 to 1. The mic is left out, so only Sensei's replies move the aurora. */
  level() {
    const loudness = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0
      analyser.getByteTimeDomainData(this.samples)
      let sum = 0
      for (const sample of this.samples) sum += ((sample - 128) / 128) ** 2
      return Math.sqrt(sum / this.samples.length)
    }
    return Math.min(1, loudness(this.voiceAnalyser) * 4)
  }

  async stop(error?: string) {
    if (this.stopped) return
    this.stopped = true
    this.session?.close()
    this.session = null
    this.mic?.getTracks().forEach((track) => track.stop())
    this.mic = null
    this.playing.forEach((source) => source.stop())
    this.playing.clear()
    await Promise.all([this.inputContext?.close(), this.outputContext?.close()])
    this.inputContext = null
    this.outputContext = null
    this.voiceAnalyser = null
    this.voiceOut = null
    this.options.onChange('idle', error)
  }

  private async startMicrophone() {
    const context = this.inputContext
    const mic = this.mic
    if (!context || !mic) return
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }))
    await context.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    const source = context.createMediaStreamSource(mic)
    const capture = new AudioWorkletNode(context, 'capture')
    capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
      this.session?.sendRealtimeInput({
        audio: { data: toBase64Pcm(event.data), mimeType: `audio/pcm;rate=${INPUT_RATE}` },
      })
    }
    source.connect(capture)
  }

  private handleMessage(message: LiveServerMessage) {
    if (message.toolCall?.functionCalls?.length) this.handleToolCalls(message.toolCall.functionCalls)
    // The user started talking over the model, so drop the voice that is still queued.
    if (message.serverContent?.interrupted) {
      this.playing.forEach((source) => source.stop())
      this.playing.clear()
      this.nextStart = 0
    }
    const heard = message.serverContent?.inputTranscription?.text
    if (heard) this.options.onTranscript('user', heard)
    const said = message.serverContent?.outputTranscription?.text
    if (said) this.options.onTranscript('assistant', said)
    for (const part of message.serverContent?.modelTurn?.parts ?? []) {
      if (part.thought && part.text) this.options.onTranscript('thought', part.text)
      else if (part.inlineData?.data) this.play(fromBase64Pcm(part.inlineData.data))
    }
  }

  /**
   * Runs the model's tool calls and sends each result back as soon as it is ready, so a slow tool does
   * not hold up a quick one. A non-blocking tool's result is added when the model is idle, so it never cuts in on speech.
   */
  private handleToolCalls(calls: NonNullable<LiveServerMessage['toolCall']>['functionCalls'] & {}) {
    for (const call of calls) {
      void (async () => {
        const base = { id: call.id ?? crypto.randomUUID(), name: call.name ?? '', args: (call.args ?? {}) as Record<string, unknown> }
        const scheduling = this.options.nonBlocking?.includes(base.name) ? FunctionResponseScheduling.WHEN_IDLE : undefined
        this.options.onTool?.({ ...base, status: 'running' })
        let response: Record<string, unknown>
        try {
          const own = this.options.tools?.[base.name]
          if (!own?.execute) throw new Error(`Unknown tool ${base.name}`)
          response = { output: await own.execute(call.args ?? {}, { toolCallId: base.id, messages: [], context: undefined }) }
          this.options.onTool?.({ ...base, status: 'done' })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The tool failed'
          this.options.onTool?.({ ...base, status: 'failed', error: message })
          response = { error: message }
        }
        this.session?.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response, scheduling }] })
      })()
    }
  }

  /** Queues one chunk of model audio right after the previous chunk so the voice plays without gaps. */
  private play(samples: Float32Array) {
    const context = this.outputContext
    if (!context) return
    const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE)
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(this.voiceOut ?? context.destination)
    const startAt = Math.max(this.nextStart, context.currentTime)
    source.start(startAt)
    this.nextStart = startAt + buffer.duration
    this.playing.add(source)
    source.onended = () => this.playing.delete(source)
  }
}
