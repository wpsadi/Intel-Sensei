import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { fromBase64, toBase64 } from '@/features/vault/bytes'

/** The data key, locked by a key made from the password. Without the password there is no way to open it. */
export interface EncryptionRecord {
  /** Base64 random salt for the password-derived key. */
  salt: string
  iterations: number
  /** Base64 IV used when wrapping the data key. */
  iv: string
  /** Base64 data key, encrypted with the password-derived key. */
  wrappedKey: string
  /**
   * 'ready' once every record is encrypted. 'encrypting' and 'decrypting' mean a migration was interrupted, so the
   * next unlock finishes it.
   */
  phase: 'encrypting' | 'ready' | 'decrypting'
}

/** The one profile this browser has. Holds either a password hash (lock only) or an encryption record, never both. */
export interface Profile {
  id: string
  /** Base64 PBKDF2-SHA256 hash of the password, for the lock-only mode. */
  passwordHash?: string
  /** Base64 random salt for the hash. */
  salt?: string
  iterations?: number
  encryption?: EncryptionRecord
  updatedAt: number
}

export type LockMode = 'none' | 'lock' | 'encrypted'

interface ProfileSchema extends DBSchema {
  profiles: { key: string; value: Profile }
}

const PROFILE_ID = 'default'
const ITERATIONS = 310_000

let dbPromise: Promise<IDBPDatabase<ProfileSchema>> | null = null

function getDb() {
  dbPromise ??= openDB<ProfileSchema>('sensei-profile', 1, {
    upgrade(db) {
      db.createObjectStore('profiles', { keyPath: 'id' })
    },
  })
  return dbPromise
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

/** Compares in constant time so a wrong guess does not leak how many leading bytes matched. */
function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export const profileRepo = {
  async get(): Promise<Profile | undefined> {
    return (await getDb()).get('profiles', PROFILE_ID)
  },

  async mode(): Promise<LockMode> {
    const profile = await this.get()
    return profile?.encryption ? 'encrypted' : profile?.passwordHash ? 'lock' : 'none'
  },

  async hasPassword() {
    return (await this.mode()) !== 'none'
  },

  /** Lock-only mode: hashes the password with a fresh salt and saves it, replacing anything saved before. */
  async setPassword(password: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const hash = await derive(password, salt, ITERATIONS)
    await (
      await getDb()
    ).put('profiles', {
      id: PROFILE_ID,
      passwordHash: toBase64(hash),
      salt: toBase64(salt),
      iterations: ITERATIONS,
      updatedAt: Date.now(),
    })
  },

  /** Encryption mode: saves the wrapped data key, replacing any lock-only hash. */
  async saveEncryption(encryption: EncryptionRecord) {
    await (await getDb()).put('profiles', { id: PROFILE_ID, encryption, updatedAt: Date.now() })
  },

  /** Removes the password, whichever mode it was for. */
  async clearPassword() {
    await (await getDb()).put('profiles', { id: PROFILE_ID, updatedAt: Date.now() })
  },

  /** Lock-only check: true when the password matches the stored hash. With no hash saved, anything matches. */
  async verify(password: string) {
    const profile = await this.get()
    if (!profile?.passwordHash || !profile.salt || !profile.iterations) return true
    const hash = await derive(password, fromBase64(profile.salt), profile.iterations)
    return sameBytes(hash, fromBase64(profile.passwordHash))
  },
}
