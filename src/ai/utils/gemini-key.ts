import { GEMINI_KEY_STORAGE } from '@/constants/ai'

/** The Gemini API key, kept in localStorage so it stays in this browser. `GEMINI_KEY.value` is '' when none is saved or storage is blocked. */
export class GEMINI_KEY {
  static get value(): string {
    try {
      return localStorage.getItem(GEMINI_KEY_STORAGE) ?? ''
    } catch {
      return ''
    }
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    try {
      if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key)
      else localStorage.removeItem(GEMINI_KEY_STORAGE)
    } catch {
      // Storage is blocked, so the key lasts only for this page load.
    }
  }
}
