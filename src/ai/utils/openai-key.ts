import { OPENAI_BASE_URL_STORAGE, OPENAI_KEY_STORAGE } from '@/constants/ai'

/** The OpenAI API key for the S3D agent, kept in localStorage so it stays in this browser. `OPENAI_KEY.value` is '' when none is saved or storage is blocked. */
export class OPENAI_KEY {
  static get value(): string {
    try {
      return localStorage.getItem(OPENAI_KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    try {
      if (key) localStorage.setItem(OPENAI_KEY_STORAGE, key)
      else localStorage.removeItem(OPENAI_KEY_STORAGE)
    } catch {
      // Storage is blocked, so the key lasts only for this page load.
    }
  }
}

/** An optional OpenAI-compatible base URL, e.g. https://my-proxy.example.com/v1. `OPENAI_BASE_URL.value` is '' for the default. */
export class OPENAI_BASE_URL {
  static get value(): string {
    try {
      return localStorage.getItem(OPENAI_BASE_URL_STORAGE) ?? ''
    } catch {
      return ''
    }
  }

  /** An empty value goes back to api.openai.com. */
  static set value(url: string) {
    try {
      if (url) localStorage.setItem(OPENAI_BASE_URL_STORAGE, url.replace(/\/+$/, ''))
      else localStorage.removeItem(OPENAI_BASE_URL_STORAGE)
    } catch {
      // Storage is blocked, so the URL lasts only for this page load.
    }
  }
}
