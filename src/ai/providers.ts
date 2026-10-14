import { createAnthropic } from '@ai-sdk/anthropic'
import { type GoogleLanguageModelOptions, createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

import { ANTHROPIC_BASE_URL, ANTHROPIC_KEY } from '@/ai/utils/anthropic-key'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { OPENAI_BASE_URL, OPENAI_KEY } from '@/ai/utils/openai-key'
import { DEFAULT_MODELS, LIVE_MODEL, MODEL_CHOICE_STORAGE, PROVIDER_CHOICE_STORAGE } from '@/constants/ai'

/** The AI SDK provider ids, which is also what the usage log records. */
export type Provider = 'google' | 'anthropic' | 'openai'

/** What a provider and model are picked for in Settings → AI models. Web search (Firecrawl), live calls and embeddings are fixed and not listed. */
export type Capability = keyof typeof DEFAULT_MODELS

export const PROVIDER_NAMES: Record<Provider, string> = { google: 'Gemini', anthropic: 'Anthropic', openai: 'OpenAI' }

export const CAPABILITY_INFO: Record<Capability, { name: string; help: string }> = {
  title: { name: 'Title generation', help: 'Names chats and projects, and the key test.' },
  chat: { name: 'Chat', help: 'Replies in Ask Sensei and the notes widget.' },
  tts: { name: 'Text to speech', help: 'Reads replies aloud.' },
  transcribe: { name: 'Speech to text', help: 'Turns a voice note into text.' },
}

const ORDER: Provider[] = ['google', 'anthropic', 'openai']

/** The default model of `provider` for `capability`; undefined when it cannot do it. */
export const defaultModel = (capability: Capability, provider: Provider): string | undefined =>
  (DEFAULT_MODELS[capability] as Partial<Record<Provider, string>>)[provider]

/** The providers that can do `capability`, in the order the picker lists them. */
export const providersFor = (capability: Capability) => ORDER.filter((provider) => defaultModel(capability, provider))

function readSetting(name: string) {
  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}

function writeSetting(name: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(name)
    else localStorage.setItem(name, value)
  } catch {
    // The choice then lasts only until the page reloads.
  }
}

export function providerKey(provider: Provider) {
  return provider === 'google' ? GEMINI_KEY.value : provider === 'anthropic' ? ANTHROPIC_KEY.value : OPENAI_KEY.value
}

export function providerBaseURL(provider: Provider) {
  return (provider === 'anthropic' ? ANTHROPIC_BASE_URL.value : provider === 'openai' ? OPENAI_BASE_URL.value : '') || undefined
}

/** A language model on `provider` with the given key, for use straight from the browser. */
export function languageModel(provider: Provider, model: string, key: string, baseURL?: string): LanguageModel {
  if (provider === 'anthropic') {
    // Anthropic refuses browser calls unless the request says it is deliberate; the key is the user's own, kept in their browser.
    return createAnthropic({ apiKey: key, baseURL, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(model)
  }
  if (provider === 'openai') return createOpenAI({ apiKey: key, baseURL })(model)
  return createGoogle({ apiKey: key })(model)
}

/** Options that make Gemini think as little as possible; other providers need none. */
export const minimalThinking = (provider: Provider) =>
  provider === 'google' ? { google: { thinkingConfig: { thinkingLevel: 'minimal' } } satisfies GoogleLanguageModelOptions } : undefined

/** A provider and one of its models. */
export interface ModelChoice {
  provider: Provider
  model: string
}

/** A choice with what is needed to call it. `key` is '' when none is saved. */
export interface ResolvedModel extends ModelChoice {
  key: string
  baseURL?: string
}

/**
 * The model chosen in Settings → AI models for each job, kept in localStorage. Everything that runs a model reads it
 * from here, so Ask Sensei, S-Note, S3D and S-Design all use the same ones.
 *
 * `AI_MODELS.chat` is the choice with its key and base URL (a worker needs plain data); `AI_MODELS.chatModel` is the
 * same thing as an AI SDK model, like `openai('gpt-…')`. Assigning `AI_MODELS.chat = { provider, model }` saves a choice;
 * leave `model` out for that provider's remembered or default model. Gemini Live is fixed.
 */
export class AI_MODELS {
  static get(capability: Capability): ResolvedModel {
    const saved = readSetting(PROVIDER_CHOICE_STORAGE + capability)
    const provider = providersFor(capability).find((item) => item === saved) ?? 'google'
    const model = readSetting(MODEL_CHOICE_STORAGE + capability + '.' + provider) || defaultModel(capability, provider)!
    return { provider, model, key: providerKey(provider), baseURL: providerBaseURL(provider) }
  }

  static set(capability: Capability, choice: Pick<ModelChoice, 'provider'> & Partial<ModelChoice>) {
    if (!providersFor(capability).includes(choice.provider)) throw new Error(`${PROVIDER_NAMES[choice.provider]} cannot do ${capability}.`)
    writeSetting(PROVIDER_CHOICE_STORAGE + capability, choice.provider)
    // The model is remembered per provider, so switching back to a provider brings its model back.
    if (choice.model) writeSetting(MODEL_CHOICE_STORAGE + capability + '.' + choice.provider, choice.model)
  }

  /** Names chats and projects. The key test uses each provider's default, not this. */
  static get title(): ResolvedModel {
    return AI_MODELS.get('title')
  }
  static set title(choice: Pick<ModelChoice, 'provider'> & Partial<ModelChoice>) {
    AI_MODELS.set('title', choice)
  }
  static get titleModel() {
    return AI_MODELS.modelOf(AI_MODELS.title)
  }

  /** Ask Sensei, S-Note, S3D and S-Design. */
  static get chat(): ResolvedModel {
    return AI_MODELS.get('chat')
  }
  static set chat(choice: Pick<ModelChoice, 'provider'> & Partial<ModelChoice>) {
    AI_MODELS.set('chat', choice)
  }
  static get chatModel() {
    return AI_MODELS.modelOf(AI_MODELS.chat)
  }
  /** `provider:model`, the form the context meter uses to look up a window. */
  static get chatId() {
    const { provider, model } = AI_MODELS.chat
    return `${provider}:${model}`
  }

  /** Read aloud. Only Gemini has speech models on models.dev. */
  static get tts(): ResolvedModel {
    return AI_MODELS.get('tts')
  }
  static set tts(choice: Pick<ModelChoice, 'provider'> & Partial<ModelChoice>) {
    AI_MODELS.set('tts', choice)
  }
  static get ttsModel() {
    const { key, model } = AI_MODELS.tts
    return createGoogle({ apiKey: key }).speech(model)
  }

  /** Voice typing. The audio goes to Gemini's API directly, so this is a choice with no AI SDK model. */
  static get transcribe(): ResolvedModel {
    return AI_MODELS.get('transcribe')
  }
  static set transcribe(choice: Pick<ModelChoice, 'provider'> & Partial<ModelChoice>) {
    AI_MODELS.set('transcribe', choice)
  }

  /** Live calls always run on Gemini. */
  static get live(): ResolvedModel {
    return { provider: 'google', model: LIVE_MODEL, key: providerKey('google') }
  }

  private static modelOf({ provider, model, key, baseURL }: ResolvedModel) {
    return languageModel(provider, model, key, baseURL)
  }
}
