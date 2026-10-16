import { fromBase64, fromUtf8, toBase64, utf8 } from '@/features/vault/bytes'
import { deserialize, serialize } from '@/features/vault/serialize'
import { vault } from '@/features/vault/vault'

/** Where an encrypted record keeps its ciphertext inside `data`. */
const ENC = '__enc'

/**
 * A record as it goes into a `data` column: the record itself, or `{ __enc }` with the whole record encrypted when the
 * vault is encrypting. Read accepts both, so a half-finished migration, or data written before encryption was on,
 * keeps working.
 */
export async function seal(value: unknown): Promise<unknown> {
  const json = serialize(value)
  if (!vault.encrypting) return JSON.parse(json)
  return { [ENC]: toBase64(await vault.encrypt(utf8(json))) }
}

export async function open<T>(data: unknown): Promise<T> {
  if (data && typeof data === 'object' && ENC in data) {
    return deserialize<T>(fromUtf8(await vault.decrypt(fromBase64((data as Record<string, string>)[ENC]))))
  }
  return deserialize<T>(JSON.stringify(data))
}
