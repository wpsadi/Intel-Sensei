import { BLOB_BUCKETS, blobMeta, putBlob, readBlob } from '@/features/vault/blob'

import { uid } from './idb'

/**
 * Media binaries live in the Cache Storage bucket, not IndexedDB.
 * Documents reference them with a `snote-media:<id>` src which is resolved to an object URL at render time.
 */
const BUCKET = BLOB_BUCKETS[0]
const SCHEME = 'snote-media:'
const keyFor = (id: string) => new Request(`/__snote_media__/${id}`)

const objectUrls = new Map<string, Promise<string>>()

export const isMediaRef = (src: string) => src.startsWith(SCHEME)

export async function putMedia(file: Blob, name = 'file') {
  const id = uid()
  await putBlob(BUCKET, keyFor(id), file, name)
  return `${SCHEME}${id}`
}

/** Resolves a stored src (media ref or plain URL) to something the browser can load. */
export function resolveMedia(src: string): Promise<string> {
  if (!isMediaRef(src)) return Promise.resolve(src)
  let url = objectUrls.get(src)
  if (!url) {
    url = caches
      .open(BUCKET)
      .then((cache) => cache.match(keyFor(src.slice(SCHEME.length))))
      .then(async (res) => (res ? URL.createObjectURL((await readBlob(res)).blob) : ''))
    objectUrls.set(src, url)
  }
  return url
}

export async function mediaInfo(src: string) {
  if (!isMediaRef(src)) return null
  const res = await (await caches.open(BUCKET)).match(keyFor(src.slice(SCHEME.length)))
  if (!res) return null
  const meta = await blobMeta(res)
  return { name: meta.name || 'file', type: meta.type, size: meta.size }
}

/** The stored bytes for a media ref, or null when it is gone. */
export async function readMedia(src: string): Promise<Blob | null> {
  if (!isMediaRef(src)) return null
  const res = await (await caches.open(BUCKET)).match(keyFor(src.slice(SCHEME.length)))
  return res ? (await readBlob(res)).blob : null
}

export async function deleteMedia(src: string) {
  if (!isMediaRef(src)) return
  await (await caches.open(BUCKET)).delete(keyFor(src.slice(SCHEME.length)))
  objectUrls.delete(src)
}

/** Opens the native file picker and resolves with the chosen file (or null). */
export function pickFile(accept = '*/*') {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
