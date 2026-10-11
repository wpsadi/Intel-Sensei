/** localStorage key for the Gemini API key entered in Settings → AI features. Stays in this browser only. */
export const GEMINI_KEY_STORAGE = 'sensei.gemini_api_key'
/** localStorage key for the Firecrawl API key that web search uses. Stays in this browser only. */
export const FIRECRAWL_KEY_STORAGE = 'sensei.firecrawl_api_key'
/** localStorage key for the OpenAI API key, used only by the S3D agent. Stays in this browser only. */
export const OPENAI_KEY_STORAGE = 'sensei.openai_api_key'
/** localStorage key for an optional OpenAI-compatible base URL (proxy, Azure, OpenRouter…). Stays in this browser only. */
export const OPENAI_BASE_URL_STORAGE = 'sensei.openai_base_url'
/** Writes text for the notes page. */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite'
export const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe'
export const TEST_MODEL = 'gemini-3.1-flash-lite'
/** Runs the chat. */
export const CHAT_MODEL = 'gemini-3.1-flash-lite'
export const MINI_STUFF_MODEL = 'gemma-4-26b-a4b-it'
/** Runs the web search sub-agent with Google Search. */
export const SEARCH_MODEL = 'antigravity-preview-09-2026'
/** Runs the S3D design agent, on OpenAI; Gemini does not model 3D well. */
export const S3D_MODEL = 'gpt-6.1-sol'
export const LIVE_MODEL = 'gemini-3.8-live'
/** Numbers per embedding. 768 keeps 100k vectors near 293 MiB. */
export const EMBEDDING_DIMENSIONS = 768
