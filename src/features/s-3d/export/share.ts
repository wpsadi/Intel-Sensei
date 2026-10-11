import { fileDataUrl, isFileRef } from '../files'
import type { Doc } from '../types'

function toB64Url(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** The document with every `s3d-file:` ref replaced by its data URL, so it works anywhere. */
export async function inlineFiles(doc: Doc) {
  const refs = new Set<string>()
  const scan = (v: unknown) => {
    if (typeof v === 'string' && isFileRef(v)) refs.add(v)
    else if (v && typeof v === 'object') Object.values(v).forEach(scan)
  }
  scan(doc)
  let json = JSON.stringify(doc)
  for (const ref of refs) json = json.split(ref).join(await fileDataUrl(ref))
  return json
}

export async function encodeDoc(doc: Doc) {
  const json = await inlineFiles(doc)
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
  return toB64Url(new Uint8Array(await new Response(stream).arrayBuffer()))
}

export async function decodeDoc(data: string): Promise<Doc> {
  const stream = new Blob([fromB64Url(data) as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  const doc = JSON.parse(await new Response(stream).text()) as Doc
  if (!doc?.pages || !doc.nodes) throw new Error('Invalid document')
  return doc
}
