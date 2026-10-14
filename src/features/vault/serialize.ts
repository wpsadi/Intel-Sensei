import { fromBase64, toBase64 } from './bytes'

/**
 * JSON that also carries what IndexedDB records can hold and plain JSON cannot: typed arrays, dates and
 * non-finite numbers. Used for encrypted records and for the backup zip.
 */
const TAG = '__t'

export function serialize(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, current) {
    // JSON.stringify has already turned a Date into a string by the time the replacer sees it, so read the original.
    const original = this[key]
    if (original instanceof Date) return { [TAG]: 'date', v: original.getTime() }
    if (typeof current === 'number' && !Number.isFinite(current)) return { [TAG]: 'num', v: String(current) }
    if (current instanceof Float32Array)
      return { [TAG]: 'f32', v: toBase64(new Uint8Array(current.buffer, current.byteOffset, current.byteLength)) }
    if (current instanceof Uint8Array) return { [TAG]: 'u8', v: toBase64(current) }
    if (current instanceof ArrayBuffer) return { [TAG]: 'ab', v: toBase64(new Uint8Array(current)) }
    return current
  })
}

export function deserialize<T = unknown>(text: string): T {
  return JSON.parse(text, (_key, current) => {
    if (current && typeof current === 'object' && TAG in current) {
      const { [TAG]: kind, v } = current as { [TAG]: string; v: string | number }
      switch (kind) {
        case 'date':
          return new Date(v as number)
        case 'num':
          return Number(v)
        case 'f32': {
          const bytes = fromBase64(v as string)
          return new Float32Array(bytes.buffer, 0, bytes.byteLength / 4)
        }
        case 'u8':
          return fromBase64(v as string)
        case 'ab':
          return fromBase64(v as string).buffer
      }
    }
    return current
  }) as T
}
