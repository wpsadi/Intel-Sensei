import { fromBase64, toBase64 } from '@/features/vault/bytes'
import { resealAll } from '@/features/vault/migrate'
import { clearSecretMemory, hydrateSecrets } from '@/features/vault/secrets'
import { vault } from '@/features/vault/vault'

import { type EncryptionRecord, profileRepo } from './profile.db'

const ITERATIONS = 600_000
const CHANNEL = 'sensei-vault'

/** The key that locks the data key, made from the password. */
async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ])
}

/** Locks `dataKey` with the password. The key must be extractable, which only happens while setting up or changing the password. */
async function wrap(dataKey: CryptoKey, password: string, phase: EncryptionRecord['phase']): Promise<EncryptionRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, await passwordKey(password, salt, ITERATIONS), { name: 'AES-GCM', iv })
  return { salt: toBase64(salt), iterations: ITERATIONS, iv: toBase64(iv), wrappedKey: toBase64(new Uint8Array(wrapped)), phase }
}

/** Opens the data key with the password. Throws when the password is wrong, because the authentication tag fails. */
async function unwrap(password: string, record: EncryptionRecord, extractable: boolean) {
  const key = await passwordKey(password, fromBase64(record.salt), record.iterations)
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(record.wrappedKey),
    key,
    { name: 'AES-GCM', iv: fromBase64(record.iv) },
    { name: 'AES-GCM' },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

async function savedRecord() {
  const record = (await profileRepo.get())?.encryption
  if (!record) throw new Error('Encryption is not turned on.')
  return record
}

/** Other open tabs hold the old state in memory, so they reload when encryption is turned on or off. */
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
channel?.addEventListener('message', () => location.reload())
const announce = () => channel?.postMessage('changed')

/** Encrypts all data with a new random key that the password locks. Existing data is rewritten in place. */
export async function enableEncryption(password: string) {
  const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const record = await wrap(extractable, password, 'encrypting')
  // Saved first, so an interrupted migration is finished at the next unlock instead of being forgotten.
  await profileRepo.saveEncryption(record)
  vault.set({ key: await unwrap(password, record, false), encrypting: true })
  await resealAll()
  await profileRepo.saveEncryption({ ...record, phase: 'ready' })
  announce()
}

/** Decrypts all data and removes the password. */
export async function disableEncryption(password: string) {
  const record = await savedRecord()
  const key = await unwrap(password, record, false)
  await profileRepo.saveEncryption({ ...record, phase: 'decrypting' })
  vault.set({ key, encrypting: false })
  await resealAll()
  await profileRepo.clearPassword()
  vault.set({ key: null, encrypting: false })
  clearSecretMemory()
  announce()
}

/** Only the small key wrapper changes, so the data is not rewritten. Returns false when the current password is wrong. */
export async function changeEncryptionPassword(current: string, next: string) {
  const record = await savedRecord()
  let extractable: CryptoKey
  try {
    extractable = await unwrap(current, record, true)
  } catch {
    return false
  }
  await profileRepo.saveEncryption(await wrap(extractable, next, record.phase))
  return true
}

/** Opens the data key, loads the saved secrets and finishes an interrupted migration. Returns false for a wrong password. */
export async function unlockEncrypted(password: string) {
  const record = await savedRecord()
  let key: CryptoKey
  try {
    key = await unwrap(password, record, false)
  } catch {
    return false
  }
  vault.set({ key, encrypting: record.phase !== 'decrypting' })
  await hydrateSecrets()
  if (record.phase === 'encrypting') {
    await resealAll()
    await profileRepo.saveEncryption({ ...record, phase: 'ready' })
  } else if (record.phase === 'decrypting') {
    await resealAll()
    await profileRepo.clearPassword()
    vault.set({ key: null, encrypting: false })
  }
  return true
}

/** Checks a password against whichever lock is set. True when there is no password. */
export async function verifyPassword(password: string) {
  const mode = await profileRepo.mode()
  if (mode === 'none') return true
  if (mode === 'lock') return profileRepo.verify(password)
  try {
    await unwrap(password, await savedRecord(), false)
    return true
  } catch {
    return false
  }
}
