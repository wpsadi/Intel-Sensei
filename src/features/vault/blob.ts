import { fromBase64, fromUtf8, toBase64, utf8 } from './bytes'
import { vault } from './vault'

/**
 * Files kept in Cache Storage. In plain mode the name and type sit in response headers. When encrypting, the bytes
 * are the response body and the name, type and size are an encrypted JSON blob in the `X-Encrypted` header.
 */
interface BlobMeta {
  name: string
  type: string
  size: number
}

export const BLOB_BUCKETS = ['snote-media', 's3d-files'] as const

export async function putBlob(bucket: string, request: Request, file: Blob, name = '') {
  const cache = await caches.open(bucket)
  const type = file.type || 'application/octet-stream'
  if (!vault.encrypting) {
    await cache.put(
      request,
      new Response(file, {
        headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name), 'Content-Length': String(file.size) },
      }),
    )
    return
  }
  const body = await vault.encrypt(new Uint8Array(await file.arrayBuffer()))
  const meta = await vault.encrypt(utf8(JSON.stringify({ name, type, size: file.size } satisfies BlobMeta)))
  await cache.put(request, new Response(body, { headers: { 'Content-Type': 'application/octet-stream', 'X-Encrypted': toBase64(meta) } }))
}

/** Name, type and size of a stored file, without reading its bytes when it is not encrypted. */
export async function blobMeta(res: Response): Promise<BlobMeta> {
  const sealed = res.headers.get('X-Encrypted')
  if (sealed) return JSON.parse(fromUtf8(await vault.decrypt(fromBase64(sealed)))) as BlobMeta
  return {
    name: decodeURIComponent(res.headers.get('X-File-Name') ?? ''),
    type: res.headers.get('Content-Type') ?? '',
    size: Number(res.headers.get('Content-Length') ?? 0),
  }
}

export async function readBlob(res: Response): Promise<{ blob: Blob } & BlobMeta> {
  const meta = await blobMeta(res)
  if (!res.headers.get('X-Encrypted')) return { ...meta, blob: await res.blob() }
  const bytes = await vault.decrypt(new Uint8Array(await res.arrayBuffer()))
  return { ...meta, blob: new Blob([bytes], { type: meta.type }) }
}

/** Rewrites every stored file in the current mode: encrypted when encrypting, plain otherwise. */
export async function resealBlobs() {
  for (const bucket of BLOB_BUCKETS) {
    const cache = await caches.open(bucket)
    for (const request of await cache.keys()) {
      const res = await cache.match(request)
      if (!res) continue
      const { blob, name } = await readBlob(res)
      await putBlob(bucket, request, blob, name)
    }
  }
}
