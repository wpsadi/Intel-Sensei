import { Models } from '@opencode-ai/models'
import type { Model, ProviderMap } from '@opencode-ai/models'

import type { Capability, Provider } from '@/ai/providers'

let inFlight: Promise<ProviderMap> | null = null

/** Every provider and model from models.dev. Prices and the model lists both read this, so it is fetched once at a time. */
export function fetchProviders(): Promise<ProviderMap> {
  inFlight ??= Models.make()
    .providers({ signal: AbortSignal.timeout(10_000) })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** What the model lists need to know about a model; kept small because it is cached in localStorage. */
export interface CatalogModel {
  id: string
  name: string
  input: string[]
  output: string[]
  tools: boolean
  deprecated: boolean
  type?: string
}

export type Catalog = Record<Provider, CatalogModel[]>

const CACHE_KEY = 'sensei.models_dev_catalog'
const MAX_AGE = 24 * 60 * 60 * 1000
const PROVIDERS: Provider[] = ['google', 'anthropic', 'openai']

function slim(providers: ProviderMap): Catalog {
  const catalog = { google: [], anthropic: [], openai: [] } as Catalog
  for (const provider of PROVIDERS) {
    catalog[provider] = Object.values(providers[provider]?.models ?? {}).map((model: Model) => ({
      id: model.id,
      name: model.name,
      input: model.modalities?.input ?? [],
      output: model.modalities?.output ?? [],
      tools: !!model.tool_call,
      deprecated: model.status === 'deprecated',
      type: model.type,
    }))
  }
  return catalog
}

function cached(): { at: number; catalog: Catalog } | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
  } catch {
    return null
  }
}

let pending: Promise<Catalog | null> | null = null

/** The models of Gemini, Anthropic and OpenAI from models.dev, refreshed once a day. Offline the last copy is used; with none it is null. */
export function loadCatalog(): Promise<Catalog | null> {
  const saved = cached()
  if (saved && Date.now() - saved.at < MAX_AGE) return Promise.resolve(saved.catalog)
  pending ??= fetchProviders()
    .then((providers) => {
      const catalog = slim(providers)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), catalog }))
      } catch {
        // Storage is full or blocked; the list is just fetched again next time.
      }
      return catalog
    })
    .catch(() => saved?.catalog ?? null)
    .finally(() => {
      pending = null
    })
  return pending
}

const onlyText = (output: string[]) => output.length === 1 && output[0] === 'text'
const NOT_FOR_TEXT = /embed|rerank|computer-use|deep-research/i

/** Whether a model can do the job, judged by what it takes in and gives out. */
const CAN: Record<Capability, (model: CatalogModel) => boolean> = {
  title: (model) => onlyText(model.output) && !model.deprecated && !NOT_FOR_TEXT.test(model.id),
  chat: (model) => CAN.title(model) && model.tools,
  tts: (model) => model.type === 'speech' || (model.output.length === 1 && model.output[0] === 'audio' && !model.input.includes('audio')),
  transcribe: (model) =>
    model.type === 'transcription' ||
    (model.input.includes('audio') && onlyText(model.output) && !model.deprecated && !NOT_FOR_TEXT.test(model.id)),
}

/** The models that can do `capability` on `provider`, from models.dev. Empty when the catalog is not available. */
export const compatibleModels = (catalog: Catalog | null, provider: Provider, capability: Capability) =>
  (catalog?.[provider] ?? []).filter(CAN[capability])
