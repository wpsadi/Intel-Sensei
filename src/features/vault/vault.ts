/**
 * The data key for this page (or worker), held in memory only. When a key is present the storage layers can read
 * encrypted data; when `encrypting` is also true they write new data encrypted. Nothing here touches storage, so it
 * also works inside Web Workers.
 */
export interface VaultState {
  key: CryptoKey | null
  encrypting: boolean
}

export class VaultLockedError extends Error {
  constructor() {
    super('This data is encrypted and the app is locked.')
  }
}

type Listener = (state: VaultState) => void

let state: VaultState = { key: null, encrypting: false }
const listeners = new Set<Listener>()

const IV_BYTES = 12

export const vault = {
  get key() {
    return state.key
  },
  /** True when new data should be written encrypted. */
  get encrypting() {
    return state.encrypting
  },
  set(next: VaultState) {
    state = next
    listeners.forEach((fn) => fn(state))
  },
  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  snapshot: () => state,

  /** AES-256-GCM. The result is a random 12-byte IV followed by the ciphertext and its authentication tag. */
  async encrypt(plain: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    if (!state.key) throw new VaultLockedError()
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, state.key, plain))
    const out = new Uint8Array(IV_BYTES + cipher.length)
    out.set(iv)
    out.set(cipher, IV_BYTES)
    return out
  },

  async decrypt(sealed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    if (!state.key) throw new VaultLockedError()
    const iv = sealed.slice(0, IV_BYTES)
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, state.key, sealed.slice(IV_BYTES)))
  },
}
