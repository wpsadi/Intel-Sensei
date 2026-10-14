import { OPENAI_BASE_URL_STORAGE, OPENAI_KEY_STORAGE } from '@/constants/ai'
import { secretGet, secretSet } from '@/features/vault/secrets'

/** The OpenAI API key for the S3D agent, kept in localStorage so it stays in this browser. `OPENAI_KEY.value` is '' when none is saved or storage is blocked. */
export class OPENAI_KEY {
  static get value(): string {
    return secretGet(OPENAI_KEY_STORAGE)
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    secretSet(OPENAI_KEY_STORAGE, key)
  }
}

/** An optional OpenAI-compatible base URL, e.g. https://my-proxy.example.com/v1. `OPENAI_BASE_URL.value` is '' for the default. */
export class OPENAI_BASE_URL {
  static get value(): string {
    return secretGet(OPENAI_BASE_URL_STORAGE)
  }

  /** An empty value goes back to api.openai.com. */
  static set value(url: string) {
    secretSet(OPENAI_BASE_URL_STORAGE, url ? url.replace(/\/+$/, '') : '')
  }
}
