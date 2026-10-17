import { FIRECRAWL_KEY_STORAGE } from '@/constants/ai'
import { secretGet, secretSet } from '@/features/vault/secrets'

/** The Firecrawl key for shared MCP, search and scraping, stored through the vault-aware secret store. */
export class FIRECRAWL_KEY {
  static get value(): string {
    return secretGet(FIRECRAWL_KEY_STORAGE)
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    secretSet(FIRECRAWL_KEY_STORAGE, key)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('sensei:firecrawl-auth'))
  }
}
