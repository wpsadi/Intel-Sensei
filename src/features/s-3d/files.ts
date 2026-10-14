import { getDb, uid } from './db'
import type { FileMeta } from './types'

/**
 * Opened and imported files: bytes go into the `s3d-files` Cache Storage bucket, metadata into the IndexedDB
 * `files` store. Nodes reference a file with a `s3d-file:<id>` src that is resolved to an object URL at render time.
 */
const BUCKET = 's3d-files'
const SCHEME = 's3d-file:'
const keyFor = (id: string) => new Request(`/__s3d_files__/${id}`)
const objectUrls = new Map<string, Promise<string>>()

export const isFileRef = (src: string) => src.startsWith(SCHEME)
export const fileIdOf = (src: string) => src.slice(SCHEME.length)

export function kindOf(file: { name: string; type: string }): FileMeta['kind'] {
  const name = file.name.toLowerCase()
  if (file.type === 'image/svg+xml' || name.endsWith('.svg')) return 'svg'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (/\.(glb|gltf|obj|fbx|stl|ply)$/.test(name)) return 'model'
  if (name.endsWith('.s3d') || name.endsWith('.s3d.json')) return 'project'
  return 'other'
}

/** Stores the bytes in the cache bucket and the metadata in IndexedDB. Resolves with the `s3d-file:` ref. */
export async function storeFile(file: Blob, name = (file as File).name ?? 'file', docId?: string) {
  const id = uid()
  const cache = await caches.open(BUCKET)
  await cache.put(keyFor(id), new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }))
  const meta: FileMeta = {
    id,
    name,
    type: file.type,
    size: file.size,
    kind: kindOf({ name, type: file.type }),
    docId,
    addedAt: Date.now(),
    lastOpenedAt: Date.now(),
  }
  await (await getDb()).put('files', meta)
  return `${SCHEME}${id}`
}

export function resolveFile(src: string): Promise<string> {
  if (!isFileRef(src)) return Promise.resolve(src)
  let url = objectUrls.get(src)
  if (!url) {
    url = readFile(src).then((blob) => (blob ? URL.createObjectURL(blob) : ''))
    objectUrls.set(src, url)
  }
  return url
}

export async function readFile(src: string): Promise<Blob | null> {
  if (!isFileRef(src)) {
    const res = await fetch(src).catch(() => null)
    return res?.ok ? res.blob() : null
  }
  const res = await (await caches.open(BUCKET)).match(keyFor(fileIdOf(src)))
  return res ? res.blob() : null
}

/** Base64 data URL for exports, which cannot reference object URLs. */
export async function fileDataUrl(src: string) {
  const blob = await readFile(src)
  if (!blob) return ''
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

export async function listFiles() {
  return (await (await getDb()).getAllFromIndex('files', 'byOpened')).reverse()
}

export async function getFileMeta(src: string) {
  return isFileRef(src) ? (await getDb()).get('files', fileIdOf(src)) : undefined
}

export async function touchFile(id: string) {
  const db = await getDb()
  const meta = await db.get('files', id)
  if (meta) await db.put('files', { ...meta, lastOpenedAt: Date.now() })
}

export async function deleteFile(id: string) {
  await (await caches.open(BUCKET)).delete(keyFor(id))
  await (await getDb()).delete('files', id)
  objectUrls.delete(`${SCHEME}${id}`)
}

export function pickFiles(accept = '*/*', multiple = true) {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
