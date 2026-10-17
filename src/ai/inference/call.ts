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

import type { AgentProgress } from '@/ai/tools/progress'
import { currentTimePrompt } from '@/ai/utils/current-time'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { LIVE_MODEL } from '@/constants/ai'

/** Gemini Live takes 16 kHz mono PCM in and sends 24 kHz mono PCM back. */
const INPUT_RATE = 16000
const OUTPUT_RATE = 24000
/** A failed farewell response must not leave the microphone and call open indefinitely. */
const FAREWELL_TIMEOUT_MS = 20_000

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
  private runningTools = new Map<string, { name: string; abort: AbortController; nonBlocking: boolean }>()
  private lastProgressAt = -Infinity
  private ending: { heardAudio: boolean; turnComplete: boolean; timeout: ReturnType<typeof setTimeout> } | null = null

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
          'Call endCall when the user asks to hang up, disconnect or end the call, or clearly says goodbye and is finished. After its result, say one brief, warm goodbye in the language of the conversation. The app will disconnect after your goodbye finishes playing. Do not end the call just because you completed an answer, are waiting on a tool, or the user is quiet.\n\n' +
          currentTimePrompt() +
          (this.options.instructions ? `\n\n${this.options.instructions}` : '') +
          ((this.options.history ?? '')
            ? `\n\nThis call continues the text chat below. Treat it as what you and the user already said.\n\n${this.options.history ?? ''}`
            : ''),
        // The same tools the text chat has, answered in handleToolCalls.
        tools: [
          {
            functionDeclarations: [
              {
                name: 'endCall',
                description:
                  'Finish this voice call when the user asks to end it or clearly says goodbye. After the tool result, say a brief natural goodbye; the app hangs up once it finishes playing.',
                parametersJsonSchema: { type: 'object', properties: {} },
                behavior: Behavior.BLOCKING,
              },
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

  /** Adds a milestone to the pending tool, letting Live speak when idle while the agent keeps working. */
  reportToolProgress(id: string, progress: AgentProgress) {
    const running = this.runningTools.get(id)
    if (this.stopped || !running?.nonBlocking || running.abort.signal.aborted || !this.session) return
    const now = Date.now()
    // Keep frequent updates as context, without prompting another spoken response for each one.
    const speak = now - this.lastProgressAt >= 6000
    if (speak) this.lastProgressAt = now
    this.session.sendToolResponse({
      functionResponses: [
        {
          id,
          name: running.name,
          response: { output: { status: 'in_progress', ...progress } },
          willContinue: true,
          scheduling: speak ? FunctionResponseScheduling.WHEN_IDLE : FunctionResponseScheduling.SILENT,
        },
      ],
    })
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
    if (this.ending) clearTimeout(this.ending.timeout)
    this.ending = null
    this.runningTools.forEach((running) => running.abort.abort())
    this.runningTools.clear()
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
      if (this.ending) return
      this.session?.sendRealtimeInput({
        audio: { data: toBase64Pcm(event.data), mimeType: `audio/pcm;rate=${INPUT_RATE}` },
      })
    }
    source.connect(capture)
  }

  private handleMessage(message: LiveServerMessage) {
    if (this.stopped) return
    for (const id of message.toolCallCancellation?.ids ?? []) {
      this.runningTools.get(id)?.abort.abort()
      this.runningTools.delete(id)
    }
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
    if (message.serverContent?.turnComplete && this.ending?.heardAudio) {
      this.ending.turnComplete = true
      this.finishFarewell()
    }
    if (message.toolCall?.functionCalls?.length) this.handleToolCalls(message.toolCall.functionCalls)
  }

  /** Both generation and actual playback must finish before the call disconnects. */
  private finishFarewell() {
    if (this.ending?.turnComplete && this.playing.size === 0) void this.stop()
  }

  /**
   * Runs the model's tool calls and sends each result back as soon as it is ready, so a slow tool does
   * not hold up a quick one. A non-blocking tool's result is added when the model is idle, so it never cuts in on speech.
   */
  private handleToolCalls(calls: NonNullable<LiveServerMessage['toolCall']>['functionCalls'] & {}) {
    if (this.stopped) return
    const endCall = calls.find((call) => call.name === 'endCall')
    if (endCall) {
      const cancelled = Array.from(this.runningTools, ([id, running]) => {
        running.abort.abort()
        return {
          id,
          name: running.name,
          response: { error: 'Cancelled because the call is ending.' },
          ...(running.nonBlocking && { willContinue: false, scheduling: FunctionResponseScheduling.SILENT }),
        }
      })
      this.runningTools.clear()
      if (!this.ending) {
        this.ending = {
          heardAudio: false,
          turnComplete: false,
          timeout: setTimeout(() => void this.stop(), FAREWELL_TIMEOUT_MS),
        }
      }
      this.session?.sendToolResponse({
        functionResponses: [
          ...calls.map((call) => ({
            id: call.id,
            name: call.name,
            response:
              call.name === 'endCall'
                ? {
                    output: {
                      instruction:
                        'Say one short, natural goodbye now in the language of this conversation. Do not call more tools. The call will close after your goodbye finishes playing.',
                    },
                  }
                : { error: 'The call is ending. Say a brief goodbye instead of starting more work.' },
          })),
          ...cancelled,
        ],
      })
      return
    }
    if (this.ending) {
      this.session?.sendToolResponse({
        functionResponses: calls.map((call) => ({
          id: call.id,
          name: call.name,
          response: { error: 'The call is ending. Say one brief goodbye now without using tools.' },
        })),
      })
      return
    }
    for (const call of calls) {
      void (async () => {
        const base = { id: call.id ?? crypto.randomUUID(), name: call.name ?? '', args: (call.args ?? {}) as Record<string, unknown> }
        if (this.runningTools.has(base.id)) return
        const nonBlocking = this.options.nonBlocking?.includes(base.name) ?? false
        const scheduling = nonBlocking ? FunctionResponseScheduling.WHEN_IDLE : undefined
        const abort = new AbortController()
        this.runningTools.set(base.id, { name: base.name, abort, nonBlocking })
        this.options.onTool?.({ ...base, status: 'running' })
        let response: Record<string, unknown>
        try {
          const own = this.options.tools?.[base.name]
          if (!own?.execute) throw new Error(`Unknown tool ${base.name}`)
          response = {
            output: await own.execute(call.args ?? {}, {
              toolCallId: base.id,
              messages: [],
              context: undefined,
              abortSignal: abort.signal,
            }),
          }
          if (abort.signal.aborted) return
          this.options.onTool?.({ ...base, status: 'done' })
        } catch (error) {
          if (abort.signal.aborted) return
          const message = error instanceof Error ? error.message : 'The tool failed'
          this.options.onTool?.({ ...base, status: 'failed', error: message })
          response = { error: message }
        } finally {
          this.runningTools.delete(base.id)
        }
        this.session?.sendToolResponse({
          functionResponses: [{ id: base.id, name: base.name, response, scheduling, ...(nonBlocking && { willContinue: false }) }],
        })
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
    if (this.ending) this.ending.heardAudio = true
    source.onended = () => {
      this.playing.delete(source)
      this.finishFarewell()
    }
  }
}
