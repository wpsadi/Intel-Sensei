import { FIRECRAWL_KEY_STORAGE } from '@/constants/ai'
import { secretGet, secretSet } from '@/features/vault/secrets'

/** The Firecrawl API key for web search, kept in localStorage so it stays in this browser. `FIRECRAWL_KEY.value` is '' when none is saved or storage is blocked. */
export class FIRECRAWL_KEY {
  static get value(): string {
    return secretGet(FIRECRAWL_KEY_STORAGE)
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    secretSet(FIRECRAWL_KEY_STORAGE, key)
  }
}
