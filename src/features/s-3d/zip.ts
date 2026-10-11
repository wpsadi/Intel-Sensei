import { unzip } from 'fflate'
import { convertModel, isConvertible } from './convert'

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ktx2: 'image/ktx2', bin: 'application/octet-stream',
}

/** Native scene files of desktop 3D apps, which only those apps can read. */
const NATIVE: Record<string, string> = {
  max: '3ds Max (.max)', blend: 'Blender (.blend)', ma: 'Maya (.ma)', mb: 'Maya (.mb)', c4d: 'Cinema 4D (.c4d)', skp: 'SketchUp (.skp)',
  '3dm': 'Rhino (.3dm)', hip: 'Houdini (.hip)', lwo: 'LightWave (.lwo)', zpr: 'ZBrush (.zpr)', ztl: 'ZBrush (.ztl)',
}

const ext = (name: string) => name.split('.').pop()!.toLowerCase()
const base = (name: string) => name.split('/').pop()!.replace(/\.[^.]+$/, '')

function unzipAsync(data: Uint8Array) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(data, (err, out) => (err ? reject(err) : resolve(out))))
}

function toDataUrl(bytes: Uint8Array, mime: string) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(bin)}`
}

/** Resolves a relative URI from a .gltf against the zip, the way a browser would against its folder. */
function resolveIn(entries: Record<string, Uint8Array>, from: string, uri: string) {
  const parts = from.split('/').slice(0, -1)
  for (const seg of decodeURIComponent(uri).split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  const path = parts.join('/')
  return entries[path] ?? Object.entries(entries).find(([k]) => k.toLowerCase() === path.toLowerCase())?.[1]
}

/**
 * The 3D models inside a zip, as files ready to import. GLBs come out as they are; a .gltf has its buffers and
 * textures inlined, since once out of the zip it can no longer reach its neighbouring files; OBJ/FBX/STL/PLY are
 * converted to GLB.
 */
export async function modelsFromZip(zip: File): Promise<File[]> {
  const entries = await unzipAsync(new Uint8Array(await zip.arrayBuffer()))
  // macOS adds resource-fork copies that are not real models.
  const names = Object.keys(entries).filter((n) => !n.startsWith('__MACOSX/') && !n.split('/').pop()!.startsWith('._'))
  const out: File[] = []
  for (const name of names) {
    if (ext(name) === 'glb') out.push(new File([entries[name] as BlobPart], `${base(name)}.glb`, { type: 'model/gltf-binary' }))
    else if (ext(name) === 'gltf') {
      const json = JSON.parse(new TextDecoder().decode(entries[name])) as { buffers?: { uri?: string }[]; images?: { uri?: string; mimeType?: string }[] }
      const inline = (item: { uri?: string; mimeType?: string }, fallback: string) => {
        if (!item.uri || item.uri.startsWith('data:')) return
        const bytes = resolveIn(entries, name, item.uri)
        if (!bytes) throw new Error(`${base(name)}.gltf needs ${item.uri}, which is not in the zip`)
        item.uri = toDataUrl(bytes, item.mimeType ?? MIME[ext(item.uri)] ?? fallback)
      }
      json.buffers?.forEach((b) => inline(b, MIME.bin))
      json.images?.forEach((img) => inline(img, 'image/png'))
      out.push(new File([JSON.stringify(json)], `${base(name)}.gltf`, { type: 'model/gltf+json' }))
    }
  }
  // Packs often ship one model in several formats; GLB/GLTF win, and the rest are only converted when they are all there is.
  if (!out.length) {
    for (const name of names.filter(isConvertible)) {
      // Textures often sit in a sibling folder (e.g. tex/ next to the model's folder), so every other file is offered;
      // the loader matches by relative path first and by file name after.
      const neighbours = Object.fromEntries(names.filter((n) => n !== name && !n.endsWith('/')).map((n) => [n, entries[n]]))
      out.push(await convertModel(new File([entries[name] as BlobPart], name.split('/').pop()!), neighbours, name))
    }
  }
  if (!out.length) {
    // Authoring-app files cannot be read in a browser; say which ones so the user knows what to export instead.
    const native = [...new Set(names.map(ext).filter((e) => NATIVE[e]))].map((e) => NATIVE[e])
    if (native.length) throw new Error(`only ${native.join(', ')} files inside, which can't be opened in a browser. Export the model as GLB, FBX or OBJ and zip that.`)
    throw new Error('no 3D model inside (supported: GLB, GLTF, OBJ, FBX, STL, PLY)')
  }
  return out
}
