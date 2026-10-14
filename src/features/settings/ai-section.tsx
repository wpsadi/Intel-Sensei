import { useState } from 'react'

import { testChat } from '@/ai/inference/test-chat'
import { PROVIDER_NAMES, type Provider } from '@/ai/providers'
import { ANTHROPIC_BASE_URL, ANTHROPIC_KEY } from '@/ai/utils/anthropic-key'
import { FIRECRAWL_KEY } from '@/ai/utils/firecrawl-key'
import { GEMINI_KEY } from '@/ai/utils/gemini-key'
import { OPENAI_BASE_URL, OPENAI_KEY } from '@/ai/utils/openai-key'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TITLE_MODELS } from '@/constants/ai'

import { ProviderTestDialog } from './provider-test-dialog'

interface Store {
  value: string
}

interface ProviderProps {
  name: string
  /** What the key unlocks, shown under the name. */
  powers: string
  required?: boolean
  keyStore: Store
  keyPlaceholder: string
  keyHelp: string
  urlStore?: Store
  urlPlaceholder?: string
  urlHelp?: string
  /** Shows a Test button that receives the key and base URL being typed. */
  onTest?: (key: string, baseURL: string) => void
}

/** One provider: its API key and, where it makes sense, a base URL. Keys stay in this browser's localStorage. */
function ProviderCard({
  name,
  powers,
  required,
  keyStore,
  keyPlaceholder,
  keyHelp,
  urlStore,
  urlPlaceholder,
  urlHelp,
  onTest,
}: ProviderProps) {
  const [savedKey, setSavedKey] = useState(() => keyStore.value)
  const [savedUrl, setSavedUrl] = useState(() => urlStore?.value ?? '')
  // Null until the user types, so the fields show the saved values.
  const [keyDraft, setKeyDraft] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const key = keyDraft ?? savedKey
  const url = urlDraft ?? savedUrl
  const badUrl = !!url.trim() && !/^https?:\/\/\S+$/.test(url.trim())
  const dirty = (keyDraft !== null && keyDraft.trim() !== savedKey) || (urlDraft !== null && urlDraft.trim() !== savedUrl)

  const save = () => {
    // oxlint-disable-next-line react/immutability -- stores hold module-level persisted settings whose setters write to browser storage
    keyStore.value = key.trim()
    setSavedKey(key.trim())
    if (urlStore) {
      // oxlint-disable-next-line react/immutability -- same module-level persisted store
      urlStore.value = url.trim()
      setSavedUrl(urlStore.value)
    }
    setKeyDraft(null)
    setUrlDraft(null)
    setJustSaved(true)
  }

  return (
    <section className="flex flex-col gap-3 border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{name}</h3>
          <p className="text-xs text-muted-foreground">{powers}</p>
        </div>
        <span
          className={
            savedKey
              ? 'shrink-0 text-xs text-green-600 dark:text-green-500'
              : required
                ? 'shrink-0 text-xs text-destructive'
                : 'shrink-0 text-xs text-muted-foreground'
          }
        >
          {savedKey ? 'Key saved' : required ? 'Key needed' : 'Optional'}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">API key</span>
        <Input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(event) => {
            setKeyDraft(event.target.value)
            setJustSaved(false)
          }}
          placeholder={keyPlaceholder}
        />
        <span className="text-xs text-muted-foreground">{keyHelp}</span>
      </label>

      {urlStore && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Base URL (optional)</span>
          <Input
            type="url"
            value={url}
            onChange={(event) => {
              setUrlDraft(event.target.value)
              setJustSaved(false)
            }}
            placeholder={urlPlaceholder}
            aria-invalid={badUrl}
          />
          <span className={badUrl ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            {badUrl ? 'Enter a full URL starting with http:// or https://.' : urlHelp}
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={!dirty || badUrl}>
          Save
        </Button>
        {onTest && (
          <Button size="sm" variant="outline" onClick={() => onTest(key.trim(), url.trim())} disabled={!key.trim()}>
            Test
          </Button>
        )}
        {savedKey && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setKeyDraft('')
              setJustSaved(false)
            }}
          >
            Clear
          </Button>
        )}
        {justSaved && <span className="text-xs text-green-600 dark:text-green-500">Saved.</span>}
      </div>
    </section>
  )
}

/** Where the user adds the keys for each inference provider. Every request goes straight from this browser to the provider. */
export function AiSection() {
  // The provider under test and what was typed for it; null when no test is open.
  const [test, setTest] = useState<{ provider: Provider; key: string; baseURL: string } | null>(null)

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">
        Add the API keys for the providers you want to use, then choose which models they run in AI models. Keys are stored only in this
        browser, and requests go directly from your browser to the provider.
      </p>

      <ProviderCard
        name="Gemini"
        powers="Live calls and embeddings always, plus chat, titles, text to speech and speech to text when picked in AI models."
        required
        keyStore={GEMINI_KEY}
        keyPlaceholder="AIza…"
        keyHelp="From Google AI Studio. Used by most AI features across the app."
        onTest={(key, baseURL) => setTest({ provider: 'google', key, baseURL })}
      />
      <ProviderCard
        name="Anthropic"
        powers="Claude for chat (Ask Sensei, S-Note, S3D, S-Design) and titles, when picked in AI models."
        keyStore={ANTHROPIC_KEY}
        keyPlaceholder="sk-ant-…"
        keyHelp="Needed only if you pick Anthropic in AI models."
        urlStore={ANTHROPIC_BASE_URL}
        urlPlaceholder="https://api.anthropic.com/v1"
        urlHelp="For a proxy or custom gateway. Leave empty for api.anthropic.com. It must allow requests from this browser (CORS)."
        onTest={(key, baseURL) => setTest({ provider: 'anthropic', key, baseURL })}
      />
      <ProviderCard
        name="Firecrawl"
        powers="Web search and page reading for Sensei."
        keyStore={FIRECRAWL_KEY}
        keyPlaceholder="fc-…"
        keyHelp="Search works without a key on Firecrawl's free tier, which is limited per IP. Add a key from firecrawl.dev for higher limits."
      />
      <ProviderCard
        name="OpenAI"
        powers="Chat, titles, text to speech and speech to text when picked in AI models, and any OpenAI-compatible endpoint."
        keyStore={OPENAI_KEY}
        keyPlaceholder="sk-…"
        keyHelp="Needed only if you pick OpenAI in AI models."
        urlStore={OPENAI_BASE_URL}
        urlPlaceholder="https://api.openai.com/v1"
        urlHelp="For a proxy or any OpenAI-compatible endpoint (Azure, OpenRouter, a local server…). Leave empty for api.openai.com."
        onTest={(key, baseURL) => setTest({ provider: 'openai', key, baseURL })}
      />

      <ProviderTestDialog
        provider={PROVIDER_NAMES[test?.provider ?? 'google']}
        model={TITLE_MODELS[test?.provider ?? 'google']}
        chat={(history, onText) => testChat(test?.provider ?? 'google', test?.key ?? '', test?.baseURL ?? '', history, onText)}
        open={test !== null}
        onOpenChange={(open) => !open && setTest(null)}
      />
    </div>
  )
}
