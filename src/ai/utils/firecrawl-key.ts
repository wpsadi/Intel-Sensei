import { FIRECRAWL_KEY_STORAGE } from '@/constants/ai'

/** The Firecrawl API key for web search, kept in localStorage so it stays in this browser. `FIRECRAWL_KEY.value` is '' when none is saved or storage is blocked. */
export class FIRECRAWL_KEY {
  static get value(): string {
    try {
      return localStorage.getItem(FIRECRAWL_KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    try {
      if (key) localStorage.setItem(FIRECRAWL_KEY_STORAGE, key)
      else localStorage.removeItem(FIRECRAWL_KEY_STORAGE)
    } catch {
      // Storage is blocked, so the key lasts only for this page load.
    }
  }
}
