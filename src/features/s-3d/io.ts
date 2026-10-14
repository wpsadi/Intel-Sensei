import { toast } from 'sonner'

import { convertModel, isConvertible } from './convert'
import { uid } from './db'
import { downloadBlob, fileDataUrl, isFileRef, kindOf, pickFiles, readFile, resolveFile, storeFile } from './files'
import { absPos } from './model'
import { modelScene, sceneOf } from './render/scene3d'
import { openSceneEditor } from './scene-editor/edit'
import { containerAt, useS3D } from './store'
import type { Doc } from './types'
import { modelsFromZip } from './zip'

const s = () => useS3D.getState()

function mediaSize(url: string, kind: 'image' | 'video' | 'svg') {
  return new Promise<{ w: number; h: number }>((resolve) => {
    if (kind === 'video') {
      const v = document.createElement('video')
      v.onloadedmetadata = () => resolve({ w: v.videoWidth || 640, h: v.videoHeight || 360 })
      v.onerror = () => resolve({ w: 640, h: 360 })
      v.src = url
    } else {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth || 200, h: img.naturalHeight || 200 })
      img.onerror = () => resolve({ w: 200, h: 200 })
      img.src = url
    }
  })
}

/** World point at the centre of the viewport. */
function viewCenter() {
  const { camera, viewport } = s()
  return { x: (viewport.w / 2 - camera.x) / camera.zoom, y: (viewport.h / 2 - camera.y) / camera.zoom }
}

/** Adds files to the canvas: images, video, SVG, GLB/GLTF models, or `.s3d` projects (opened as a new document). */
export async function addFilesToCanvas(input: File[], at?: { x: number; y: number }) {
  const point = at ?? viewCenter()
  // Models are often shared zipped (with their textures); unpack them into the models they hold.
  const files: File[] = []
  for (const file of input) {
    try {
      if (file.name.toLowerCase().endsWith('.zip')) files.push(...(await modelsFromZip(file)))
      // OBJ/FBX/STL/PLY become GLB, so scenes only ever load one format.
      else if (isConvertible(file.name)) files.push(await convertModel(file))
      else files.push(file)
    } catch (error) {
      toast.error(`${file.name}: ${error instanceof Error ? error.message : error}`)
    }
  }
  const created: string[] = []
  let offset = 0
  for (const file of files) {
    const kind = kindOf(file)
    try {
      if (kind === 'project') {
        await openProjectFile(file)
        continue
      }
      if (kind === 'other') {
        toast.error(`${file.name}: unsupported file type`)
        continue
      }
      const ref = await storeFile(file, file.name, s().doc.id)
      const { doc, pageId } = s()
      const parent = containerAt(doc, pageId, point.x, point.y)
      const pAbs = doc.nodes[parent] ? absPos(doc, parent) : { x: 0, y: 0 }
      let w = 400
      let h = 400
      if (kind !== 'model') {
        const size = await mediaSize(await resolveFile(ref), kind)
        const scale = Math.min(1, 800 / Math.max(size.w, size.h))
        w = Math.round(size.w * scale)
        h = Math.round(size.h * scale)
      }
      const name = file.name.replace(/\.[^.]+$/, '')
      if (kind === 'model') {
        w = 800
        h = 600
      }
      const type = kind === 'model' ? 'shape3d' : kind === 'video' ? 'video' : 'image'
      const node = s().addNode(
        type,
        {
          name,
          ...(kind === 'model' ? { scene: modelScene(ref, name) } : { src: ref }),
          x: point.x - pAbs.x - w / 2 + offset,
          y: point.y - pAbs.y - h / 2 + offset,
          w,
          h,
        },
        parent,
      )
      created.push(node.id)
      offset += 24
    } catch (error) {
      toast.error(`Could not import ${file.name}: ${error instanceof Error ? error.message : error}`)
    }
  }
  if (created.length) {
    s().select(created)
    toast.success(`Imported ${created.length} file${created.length > 1 ? 's' : ''}`)
    // A single 3D model opens straight into the 3D editor.
    if (created.length === 1 && s().doc.nodes[created[0]]?.scene) openSceneEditor(created[0])
  }
}

export async function importFiles() {
  const files = await pickFiles('image/*,video/*,.svg,.glb,.gltf,.obj,.fbx,.stl,.ply,.zip,.s3d,.json')
  if (files.length) await addFilesToCanvas(files)
}

/** A portable project: the document plus every referenced file inlined as a data URL. */
export async function exportProject(doc: Doc = s().doc) {
  const refs = new Set<string>()
  const scan = (v: unknown) => {
    if (typeof v === 'string' && isFileRef(v)) refs.add(v)
    else if (v && typeof v === 'object') Object.values(v).forEach(scan)
  }
  scan(doc)
  const files: Record<string, string> = {}
  for (const ref of refs) files[ref] = await fileDataUrl(ref)
  downloadBlob(
    new Blob([JSON.stringify({ format: 's3d', version: 1, doc, files })], { type: 'application/json' }),
    `${doc.name || 'Untitled'}.s3d`,
  )
}

export async function openProjectFile(file: File) {
  const data = JSON.parse(await file.text()) as { format?: string; doc?: Doc; files?: Record<string, string> }
  if (data.format !== 's3d' || !data.doc) throw new Error('Not an S3D project file')
  // Re-store every embedded file in the cache bucket under a fresh ref.
  let json = JSON.stringify(data.doc)
  const projectRef = await storeFile(file, file.name)
  for (const [oldRef, dataUrl] of Object.entries(data.files ?? {})) {
    if (!dataUrl) continue
    const blob = await (await fetch(dataUrl)).blob()
    const newRef = await storeFile(blob, oldRef.slice(9))
    json = json.split(oldRef).join(newRef)
  }
  const doc = { ...(JSON.parse(json) as Doc), id: uid(), kind: s().service, updatedAt: Date.now() }
  await s().loadDoc(doc)
  await s().saveNow('Opened from file')
  toast.success(`Opened ${doc.name}`)
  return projectRef
}

export async function openFiles() {
  const files = await pickFiles('.s3d,.json,image/*,video/*,.svg,.glb,.gltf,.obj,.fbx,.stl,.ply,.zip')
  if (files.length) await addFilesToCanvas(files)
}

/** Reads a file ref back as a File, e.g. to re-add a recent file. */
export async function fileFromRef(ref: string, name: string) {
  const blob = await readFile(ref)
  return blob ? new File([blob], name, { type: blob.type }) : null
}

/** Reads a response body, reporting how much of it has arrived (0..1) when the server gives a length. */
async function readWithProgress(res: Response, onProgress?: (fraction: number) => void) {
  const total = Number(res.headers.get('content-length')) || 0
  if (!onProgress || !total || !res.body) return res.blob()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress(Math.min(1, loaded / total))
  }
  return new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') ?? 'model/gltf-binary' })
}

/**
 * Downloads a model from the web into the file store. With `sceneId` it is added to that scene; otherwise it becomes
 * a new scene on the canvas (opened in the 3D editor). Returns the scene node id.
 */
export async function importRemoteModel(url: string, title: string, sceneId?: string, onProgress?: (fraction: number) => void) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const name = title.slice(0, 60)
  const blob = await readWithProgress(res, onProgress)
  const target = sceneId && s().doc.nodes[sceneId]
  if (target) {
    const ref = await storeFile(blob, `${name}.glb`, s().doc.id)
    const id = `model-${uid().slice(0, 6)}`
    s().updateNodes([target.id], (n) => {
      if (!n.scene) n.scene = sceneOf(n)
      n.type = 'shape3d'
      const xs = n.scene.objects.filter((o) => !o.parent && o.kind !== 'light').length
      n.scene.objects.push({
        id,
        name,
        kind: 'model',
        parent: null,
        src: ref,
        position: [xs * 1.8, 0, 0],
        rotation: [0, 0, 0],
        scale: [1.5, 1.5, 1.5],
        visible: true,
      })
    })
    toast.success(`Added ${name}`)
    return { sceneId: target.id, objectId: id }
  }
  await addFilesToCanvas([new File([blob], `${name}.glb`, { type: 'model/gltf-binary' })])
  return { sceneId: s().selection[0] }
}
