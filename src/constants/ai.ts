/** localStorage key for the Gemini API key entered in Settings → AI features. Stays in this browser only. */
export const GEMINI_KEY_STORAGE = 'sensei.gemini_api_key'
/** localStorage key for the Firecrawl API key that web search uses. Stays in this browser only. */
export const FIRECRAWL_KEY_STORAGE = 'sensei.firecrawl_api_key'
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
export const TEST_MODEL = 'gemini-3.5-flash-lite'
/** Used by the OpenAI key test in Settings. */
export const OPENAI_TEST_MODEL = 'gpt-6-luna'
/** Used by the Anthropic key test in Settings. */
export const ANTHROPIC_TEST_MODEL = 'claude-haiku-5-5'
/** Runs the chat. */
export const CHAT_MODEL = 'gemini-3.5-flash-lite'
export const MINI_STUFF_MODEL = 'gemma-4-26b-a4b-it'
/** Runs the web search sub-agent with Google Search. */
export const SEARCH_MODEL = 'antigravity-preview-09-2026'
/** Runs the S3D / S-Design agent, on Anthropic; Gemini does not model 3D well. */
export const S3D_MODEL = 'claude-opus-5-5'
/** Reads Sensei's replies aloud. */
export const TTS_MODEL = 'gemini-3.8-flash-tts'
export const LIVE_MODEL = 'gemini-3.8-live'
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
  OPENAI_KEY_STORAGE,
  OPENAI_BASE_URL_STORAGE,
  ANTHROPIC_KEY_STORAGE,
  ANTHROPIC_BASE_URL_STORAGE,
]
