import { GEMINI_KEY_STORAGE } from '@/constants/ai'
import { secretGet, secretSet } from '@/features/vault/secrets'

/** The Gemini API key, kept in localStorage so it stays in this browser. `GEMINI_KEY.value` is '' when none is saved or storage is blocked. */
export class GEMINI_KEY {
  static get value(): string {
    return secretGet(GEMINI_KEY_STORAGE)
  }

  /** An empty value removes the key. */
  static set value(key: string) {
    secretSet(GEMINI_KEY_STORAGE, key)
  }
}
