import { ANTHROPIC_BASE_URL_STORAGE, ANTHROPIC_KEY_STORAGE } from '@/constants/ai'
import { secretGet, secretSet } from '@/features/vault/secrets'

/** The Anthropic API key for the S3D agent, kept in localStorage so it stays in this browser. `ANTHROPIC_KEY.value` is '' when none is saved or storage is blocked. */
export class ANTHROPIC_KEY {
  static get value(): string {
    return secretGet(ANTHROPIC_KEY_STORAGE)
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    secretSet(ANTHROPIC_KEY_STORAGE, key)
  }
}

/** An optional Anthropic base URL for a proxy or custom gateway, e.g. https://my-gateway.example.com/v1. `ANTHROPIC_BASE_URL.value` is '' for the default. */
export class ANTHROPIC_BASE_URL {
  static get value(): string {
    return secretGet(ANTHROPIC_BASE_URL_STORAGE)
  }

  /** An empty value goes back to api.anthropic.com. */
  static set value(url: string) {
    secretSet(ANTHROPIC_BASE_URL_STORAGE, url ? url.replace(/\/+$/, '') : '')
  }
}
