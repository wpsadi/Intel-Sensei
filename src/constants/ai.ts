/** localStorage key for the Gemini API key entered in Settings → AI providers. Stays in this browser only. */
export const GEMINI_KEY_STORAGE = 'sensei.gemini_api_key'
/** localStorage key for the Firecrawl API key that web search uses. Stays in this browser only. */
export const FIRECRAWL_KEY_STORAGE = 'sensei.firecrawl_api_key'
export const FIRECRAWL_MCP_AUTH_STORAGE = 'sensei.firecrawl_mcp_auth'
/** localStorage key for the OpenAI API key, used only by the S3D agent. Stays in this browser only. */
export const OPENAI_KEY_STORAGE = 'sensei.openai_api_key'
/** localStorage key for an optional OpenAI-compatible base URL (proxy, Azure, OpenRouter…). Stays in this browser only. */
export const OPENAI_BASE_URL_STORAGE = 'sensei.openai_base_url'
/** localStorage key for the Anthropic API key, used by the S3D / S-Design agent. Stays in this browser only. */
export const ANTHROPIC_KEY_STORAGE = 'sensei.anthropic_api_key'
/** localStorage key for an optional Anthropic base URL (a proxy or custom gateway). Stays in this browser only. */
export const ANTHROPIC_BASE_URL_STORAGE = 'sensei.anthropic_base_url'
/** Writes text for the notes page. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'
export const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe'
/** localStorage key prefixes for the provider and model picked for each job in Settings → AI models. Not secrets. */
export const PROVIDER_CHOICE_STORAGE = 'sensei.provider.'
export const MODEL_CHOICE_STORAGE = 'sensei.model.'
/** localStorage key for what sending does while a reply is running: queue the message or steer the reply. Not a secret. */
export const SEND_MODE_STORAGE = 'sensei.send_mode'
/** Runs the chat. */
export const CHAT_MODEL = 'gemini-3.5-flash-lite'
export const MINI_STUFF_MODEL = 'gemma-4-26b-a4b-it'
/**
 * The default model each provider uses for titles and other small tasks. It is also what the key test in
 * Settings talks to, so it is the same whichever provider is picked.
 */
export const TITLE_MODELS = {
  google: 'gemini-3.5-flash-lite',
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-6-luna',
} as const
/** Reads Sensei's replies aloud. */
export const TTS_MODEL = 'gemini-3.8-flash-tts'
/**
 * The model for live voice calls. The extended-thinking variant reasons before it answers or calls a tool, which the base
 * `gemini-3.8-live` cannot do (it rejects `thinkingConfig`), and it sends its thinking so the chat can show it. Tasks that
 * need exact tool use, such as drawing, need that reasoning.
 */
export const LIVE_MODEL = 'gemini-3.8-live-extended-thinking'
/**
 * The default model of each provider for a job. Settings → AI models lists every compatible model from models.dev and
 * starts on these; they are also the list when models.dev cannot be reached. A provider missing from a job cannot do it
 * (models.dev has no OpenAI or Anthropic speech models). Live calls are not listed: they always use LIVE_MODEL on Gemini.
 */
export const DEFAULT_MODELS = {
  title: TITLE_MODELS,
  chat: { google: CHAT_MODEL, anthropic: 'claude-sonnet-5-5', openai: 'gpt-6-luna' },
  tts: { google: TTS_MODEL },
  transcribe: { google: TRANSCRIBE_MODEL },
} as const satisfies Record<string, Partial<Record<'google' | 'anthropic' | 'openai', string>>>
/** Numbers per embedding. 768 keeps 100k vectors near 293 MiB. */
export const EMBEDDING_DIMENSIONS = 768
/** Context window of the S3D / S-Design agent; older messages are compacted at 80% of it. */
export const S3D_AGENT_CONTEXT_LIMIT = 500_000
/** Context window of the S-Note Sensei widget; older messages are compacted at 80% of it. */
export const SNOTE_AGENT_CONTEXT_LIMIT = 250_000

/** Every localStorage key that holds a secret or private setting, so they can be encrypted and exported together. */
export const SECRET_STORAGE_KEYS = [
  GEMINI_KEY_STORAGE,
  FIRECRAWL_KEY_STORAGE,
  FIRECRAWL_MCP_AUTH_STORAGE,
  OPENAI_KEY_STORAGE,
  OPENAI_BASE_URL_STORAGE,
  ANTHROPIC_KEY_STORAGE,
  ANTHROPIC_BASE_URL_STORAGE,
]
