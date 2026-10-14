import { SECRET_STORAGE_KEYS } from '@/constants/ai'

import { fromBase64, fromUtf8, toBase64, utf8 } from './bytes'
import { vault } from './vault'

/**
 * Synchronous access to the API keys in localStorage. The key classes read these on every request and cannot await,
 * so decrypted values live in memory. They are filled in once after unlocking (`hydrateSecrets`) and written back
 * encrypted whenever the vault is encrypting.
 */
const PREFIX = 'enc:v1:'
const memory = new Map<string, string>()

function read(name: string): string | null {
  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}

function write(name: string, value: string) {
  try {
    if (value) localStorage.setItem(name, value)
    else localStorage.removeItem(name)
  } catch {
    // Storage is blocked, so the value lasts only for this page load.
  }
}

export function secretGet(name: string): string {
  const cached = memory.get(name)
  if (cached !== undefined) return cached
  const raw = read(name) ?? ''
  // Encrypted and not hydrated yet: there is nothing usable to return.
  return raw.startsWith(PREFIX) ? '' : raw
}

async function persist(name: string, value: string) {
  if (!value || !vault.encrypting) return write(name, value)
  write(name, PREFIX + toBase64(await vault.encrypt(utf8(value))))
}

export function secretSet(name: string, value: string) {
  memory.set(name, value)
  void persist(name, value)
}

/** Decrypts every saved secret into memory. Call after the vault key is set. */
export async function hydrateSecrets() {
  for (const name of SECRET_STORAGE_KEYS) {
    const raw = read(name)
    if (raw?.startsWith(PREFIX)) memory.set(name, fromUtf8(await vault.decrypt(fromBase64(raw.slice(PREFIX.length)))))
  }
}

/** Rewrites every saved secret in the current mode. */
export async function resealSecrets() {
  for (const name of SECRET_STORAGE_KEYS) {
    const value = secretGet(name)
    if (value) await persist(name, value)
  }
}

/** Forgets decrypted values, used when locking. */
export function clearSecretMemory() {
  memory.clear()
}
