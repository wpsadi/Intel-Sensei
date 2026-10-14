import { useEffect, useState } from 'react'

import { type Catalog, compatibleModels, loadCatalog } from '@/ai/models-dev'
import { AI_MODELS, CAPABILITY_INFO, type Capability, PROVIDER_NAMES, type Provider, defaultModel, providersFor } from '@/ai/providers'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LIVE_MODEL } from '@/constants/ai'

const CAPABILITIES: Capability[] = ['title', 'chat', 'tts', 'transcribe']

const toItems = (values: readonly string[], label: (value: string) => string = (value) => value) =>
  Object.fromEntries(values.map((value) => [value, label(value)]))

/** Where the model lists come from; fetched once and shared by every row. */
function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    let alive = true
    void loadCatalog().then((loaded) => alive && setCatalog(loaded))
    return () => {
      alive = false
    }
  }, [])
  return catalog
}

/** One job: the provider, then a model from that provider's compatible list. Only providers that can do the job are listed. */
function ModelRow({ capability, catalog }: { capability: Capability; catalog: Catalog | null }) {
  const [provider, setProvider] = useState(() => AI_MODELS.get(capability).provider)
  const [model, setModel] = useState(() => AI_MODELS.get(capability).model)
  const providers = providersFor(capability)
  // The picked and default models always show, so the list is never empty while models.dev loads or when it cannot be reached.
  const models = [
    ...new Set([model, defaultModel(capability, provider)!, ...compatibleModels(catalog, provider, capability).map((item) => item.id)]),
  ]

  return (
    <section className="flex flex-col gap-3 border p-4">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{CAPABILITY_INFO[capability].name}</h3>
        <p className="text-xs text-muted-foreground">
          {CAPABILITY_INFO[capability].help}
          {!AI_MODELS.get(capability).key && (
            <span className="text-destructive"> Add a {PROVIDER_NAMES[provider]} key in AI providers.</span>
          )}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Provider</span>
          <Select
            value={provider}
            items={toItems(providers, (item) => PROVIDER_NAMES[item as Provider])}
            onValueChange={(value) => {
              if (!value) return
              AI_MODELS.set(capability, { provider: value as Provider })
              setProvider(value as Provider)
              setModel(AI_MODELS.get(capability).model)
            }}
          >
            <SelectTrigger className="w-full" aria-label={`${CAPABILITY_INFO[capability].name} provider`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {providers.map((item) => (
                <SelectItem key={item} value={item}>
                  {PROVIDER_NAMES[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Model</span>
          <Select
            value={model}
            items={toItems(models)}
            onValueChange={(value) => {
              if (!value) return
              AI_MODELS.set(capability, { provider, model: value })
              setModel(value)
            }}
          >
            <SelectTrigger className="w-full" aria-label={`${CAPABILITY_INFO[capability].name} model`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {models.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
    </section>
  )
}

/** Which provider and model each job runs on. Keys are added in AI providers. */
export function AiModelsSection() {
  const catalog = useCatalog()
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Choose a provider and one of its compatible models for each job. The lists come from models.dev. Web search always uses Firecrawl.
      </p>
      {CAPABILITIES.map((capability) => (
        <ModelRow key={capability} capability={capability} catalog={catalog} />
      ))}
      <section className="flex flex-col gap-1 border p-4">
        <h3 className="text-sm font-medium">Live call</h3>
        <p className="text-xs text-muted-foreground">
          Always runs on Gemini ({LIVE_MODEL}), so it has no choice here. Embeddings also stay on Gemini.
        </p>
      </section>
    </div>
  )
}
