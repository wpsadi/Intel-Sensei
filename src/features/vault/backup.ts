import { type Zippable, unzip, zip } from 'fflate'

import { SECRET_STORAGE_KEYS } from '@/constants/ai'

import { BLOB_BUCKETS, putBlob, readBlob } from './blob'
import { fromUtf8, utf8 } from './bytes'
import { COLLECTIONS, collectionOf } from './migrate'
import { secretGet, secretSet } from './secrets'
import { deserialize, serialize } from './serialize'

/**
 * A backup is a plain zip:
 *   manifest.json                      what and when
 *   data/<database>/<store>.json       every record
 *   files/<bucket>/<id>                the bytes of each stored file
 *   files/<bucket>/<id>.json           its name, type and cache path
 *   settings/api-keys.json             only when asked for
 * Everything is raw and readable, even when the app's own storage is encrypted.
 */
const FORMAT = 1

interface Manifest {
  app: 'sensei'
  format: number
  exportedAt: string
  includesApiKeys: boolean
}

interface FileInfo {
  name: string
  type: string
  path: string
}

const zipAsync = (files: Zippable) =>
  new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 1 }, (error, data) => (error ? reject(error) : resolve(data))))

const unzipAsync = (data: Uint8Array) =>
  new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(data, (error, out) => (error ? reject(error) : resolve(out))))

const README = `Sensei backup

This archive holds your data as plain, readable files. It is NOT encrypted, even if encryption is turned on in
Sensei, so anyone who has this file can read everything in it. Keep it somewhere safe.

To restore it, use Settings > Backup > Import in Sensei.
`

export async function exportBackup({ includeApiKeys }: { includeApiKeys: boolean }): Promise<Blob> {
  const files: Zippable = {}
  const manifest: Manifest = { app: 'sensei', format: FORMAT, exportedAt: new Date().toISOString(), includesApiKeys: includeApiKeys }
  files['manifest.json'] = utf8(JSON.stringify(manifest, null, 2))
  files['README.txt'] = utf8(README)

  for (const collection of COLLECTIONS) {
    files[`data/${collection.database}/${collection.name}.json`] = utf8(serialize(await collection.list()))
  }

  for (const bucket of BLOB_BUCKETS) {
    const cache = await caches.open(bucket)
    for (const request of await cache.keys()) {
      const res = await cache.match(request)
      if (!res) continue
      const { blob, name, type } = await readBlob(res)
      const path = new URL(request.url).pathname
      const id = path.split('/').pop()!
      files[`files/${bucket}/${id}`] = new Uint8Array(await blob.arrayBuffer())
      files[`files/${bucket}/${id}.json`] = utf8(JSON.stringify({ name, type, path } satisfies FileInfo))
    }
  }

  if (includeApiKeys) {
    const keys = Object.fromEntries(SECRET_STORAGE_KEYS.map((name) => [name, secretGet(name)]).filter(([, value]) => value))
    files['settings/api-keys.json'] = utf8(JSON.stringify(keys, null, 2))
  }

  return new Blob([(await zipAsync(files)) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

export interface ImportSummary {
  records: number
  files: number
  apiKeys: boolean
}

/** Adds everything in the zip to this browser. A record with the same id replaces the one here; nothing is deleted. */
export async function importBackup(file: File): Promise<ImportSummary> {
  let entries: Record<string, Uint8Array>
  try {
    entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('That file is not a zip archive.')
  }

  const manifestBytes = entries['manifest.json']
  const manifest = manifestBytes ? (JSON.parse(fromUtf8(manifestBytes)) as Partial<Manifest>) : null
  if (manifest?.app !== 'sensei') throw new Error('That zip is not a Sensei backup.')
  if ((manifest.format ?? 0) > FORMAT) throw new Error('This backup comes from a newer version of Sensei.')

  const summary: ImportSummary = { records: 0, files: 0, apiKeys: false }

  for (const [path, bytes] of Object.entries(entries)) {
    const match = path.match(/^data\/([^/]+)\/([^/]+)\.json$/)
    const collection = match && collectionOf(match[1], match[2])
    if (!collection) continue
    for (const record of deserialize<unknown[]>(fromUtf8(bytes))) {
      await collection.put(record as never)
      summary.records++
    }
  }

  for (const bucket of BLOB_BUCKETS) {
    for (const [path, bytes] of Object.entries(entries)) {
      const match = path.match(new RegExp(`^files/${bucket}/([^/]+)\\.json$`))
      const body = match && entries[`files/${bucket}/${match[1]}`]
      if (!body) continue
      const info = JSON.parse(fromUtf8(bytes)) as FileInfo
      // Only paths inside the app's own cache namespace are accepted.
      if (!/^\/__(snote_media|s3d_files)__\/[\w-]+$/.test(info.path)) continue
      await putBlob(bucket, new Request(info.path), new Blob([body as Uint8Array<ArrayBuffer>], { type: info.type }), info.name)
      summary.files++
    }
  }

  const keys = entries['settings/api-keys.json']
  if (keys) {
    const saved = JSON.parse(fromUtf8(keys)) as Record<string, string>
    for (const name of SECRET_STORAGE_KEYS) if (typeof saved[name] === 'string') secretSet(name, saved[name])
    summary.apiKeys = true
  }

  return summary
}
