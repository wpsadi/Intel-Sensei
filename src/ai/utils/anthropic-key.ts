import { ANTHROPIC_BASE_URL_STORAGE, ANTHROPIC_KEY_STORAGE } from '@/constants/ai'

/** The Anthropic API key for the S3D agent, kept in localStorage so it stays in this browser. `ANTHROPIC_KEY.value` is '' when none is saved or storage is blocked. */
export class ANTHROPIC_KEY {
  static get value(): string {
    try {
      return localStorage.getItem(ANTHROPIC_KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    try {
      if (key) localStorage.setItem(ANTHROPIC_KEY_STORAGE, key)
      else localStorage.removeItem(ANTHROPIC_KEY_STORAGE)
    } catch {
      // Storage is blocked, so the key lasts only for this page load.
    }
  }
}

/** An optional Anthropic base URL for a proxy or custom gateway, e.g. https://my-gateway.example.com/v1. `ANTHROPIC_BASE_URL.value` is '' for the default. */
export class ANTHROPIC_BASE_URL {
  static get value(): string {
    try {
      return localStorage.getItem(ANTHROPIC_BASE_URL_STORAGE) ?? ''
    } catch {
      return ''
    }
  }

  /** An empty value goes back to api.anthropic.com. */
  static set value(url: string) {
    try {
      if (url) localStorage.setItem(ANTHROPIC_BASE_URL_STORAGE, url.replace(/\/+$/, ''))
      else localStorage.removeItem(ANTHROPIC_BASE_URL_STORAGE)
    } catch {
      // Storage is blocked, so the URL lasts only for this page load.
    }
  }
}
