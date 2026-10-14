import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

/** Model formats that are converted to GLB on import, so the rest of S3D only ever loads GLB/GLTF. */
export const CONVERTIBLE = ['obj', 'fbx', 'stl', 'ply'] as const
export type Convertible = (typeof CONVERTIBLE)[number]

export const extOf = (name: string) => name.split('.').pop()!.toLowerCase()
export const isConvertible = (name: string): boolean => (CONVERTIBLE as readonly string[]).includes(extOf(name))

/** Files that sit next to the model (textures, .mtl), keyed by their path, e.g. from a zip. */
export type Neighbours = Record<string, Uint8Array>

/**
 * A loading manager that serves a model's neighbouring files from memory, matching by path and then by bare file
 * name (exports often reference textures by an absolute path from the author's machine).
 */
function memoryManager(neighbours: Neighbours, dir: string) {
  const urls = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const [path, bytes] of Object.entries(neighbours)) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
    urls.set(path.toLowerCase(), url)
    byName.set(path.split('/').pop()!.toLowerCase(), url)
  }
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url
    const clean = decodeURIComponent(url).replace(/\\/g, '/').replace(/^\.\//, '')
    const rel = (dir ? `${dir}/${clean}` : clean).toLowerCase()
    return urls.get(rel) ?? urls.get(clean.toLowerCase()) ?? byName.get(clean.split('/').pop()!.toLowerCase()) ?? url
  })
  // Resolves once every texture the loaders asked for has arrived (or failed); immediately if none were asked for.
  let pending = 0
  let done: () => void = () => {}
  const settled = new Promise<void>((r) => {
    done = r
  })
  manager.itemStart = ((orig) => (url: string) => {
    pending++
    orig(url)
  })(manager.itemStart.bind(manager))
  manager.itemEnd = ((orig) => (url: string) => {
    orig(url)
    if (--pending <= 0) done()
  })(manager.itemEnd.bind(manager))
  manager.itemError = ((orig) => (url: string) => {
    orig(url)
    console.warn('[S3D] missing texture:', url)
  })(manager.itemError.bind(manager))
  const idle = () => (pending <= 0 ? Promise.resolve() : settled)
  const dispose = () => urls.forEach((u) => URL.revokeObjectURL(u))
  return { manager, idle, dispose }
}

const DEFAULT_SURFACE = () => new THREE.MeshStandardMaterial({ color: '#b0b4bc', roughness: 0.6, metalness: 0.05 })

async function parse(name: string, bytes: ArrayBuffer, neighbours: Neighbours, manager: THREE.LoadingManager): Promise<THREE.Object3D> {
  switch (extOf(name) as Convertible) {
    case 'obj': {
      const text = new TextDecoder().decode(bytes)
      const loader = new OBJLoader(manager)
      // The .mtl named by the file (or any .mtl beside it) carries its colours and textures.
      const mtlName = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim()
      const mtlPath =
        Object.keys(neighbours).find((p) => mtlName && p.toLowerCase().endsWith(mtlName.toLowerCase())) ??
        Object.keys(neighbours).find((p) => extOf(p) === 'mtl')
      if (mtlPath) {
        const materials = new MTLLoader(manager).parse(new TextDecoder().decode(neighbours[mtlPath]), '')
        materials.preload()
        loader.setMaterials(materials)
      }
      return loader.parse(text)
    }
    case 'fbx':
      return new FBXLoader(manager).parse(bytes, '')
    case 'stl': {
      const geometry = new STLLoader(manager).parse(bytes)
      geometry.computeVertexNormals()
      // Binary STLs can carry per-face colours.
      const colored = !!geometry.getAttribute('color')
      return new THREE.Mesh(geometry, colored ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }) : DEFAULT_SURFACE())
    }
    case 'ply': {
      const geometry = new PLYLoader(manager).parse(bytes)
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
      const colored = !!geometry.getAttribute('color')
      // A PLY without faces is a point cloud (common for scans).
      if (!geometry.index && geometry.getAttribute('position').count % 3 !== 0) {
        return new THREE.Points(
          geometry,
          new THREE.PointsMaterial({ size: 0.005, vertexColors: colored, color: colored ? undefined : '#b0b4bc' }),
        )
      }
      return new THREE.Mesh(geometry, colored ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }) : DEFAULT_SURFACE())
    }
  }
}

/** Converts an OBJ/FBX/STL/PLY (with its neighbouring files) into a GLB file with textures embedded. */
export async function toGlb(file: File, neighbours: Neighbours = {}, path = file.name): Promise<File> {
  const dir = path.split('/').slice(0, -1).join('/')
  const { manager, idle, dispose } = memoryManager(neighbours, dir)
  try {
    const object = await parse(file.name, await file.arrayBuffer(), neighbours, manager)
    await idle()
    // Shading the loaders leave unset (e.g. Phong from OBJ/FBX) exports fine; make sure every mesh has a material.
    object.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !m.material) m.material = DEFAULT_SURFACE()
    })
    const glb = (await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true })) as ArrayBuffer
    return new File([glb], file.name.replace(/\.[^.]+$/, '.glb'), { type: 'model/gltf-binary' })
  } finally {
    dispose()
  }
}

const IMAGE = /\.(png|jpe?g|webp|bmp|tga|gif|tiff?|dds|ktx2?)$/i

/**
 * Texture loading needs the DOM, which workers lack. Models that can carry textures (FBX, OBJ with an .mtl that
 * names image files) convert on the main thread; everything else converts in a worker so the UI stays responsive.
 */
function needsDom(file: File, neighbours: Neighbours) {
  const ext = extOf(file.name)
  if (ext === 'fbx') return true
  return ext === 'obj' && Object.keys(neighbours).some((p) => extOf(p) === 'mtl') && Object.keys(neighbours).some((p) => IMAGE.test(p))
}

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, { resolve: (f: File) => void; reject: (e: Error) => void }>()

function convertWorker() {
  if (!worker) {
    worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; glb?: File; error?: string }>) => {
      const job = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (e.data.glb) job?.resolve(e.data.glb)
      else job?.reject(new Error(e.data.error ?? 'conversion failed'))
    }
  }
  return worker
}

/** Converts an OBJ/FBX/STL/PLY to GLB, in a worker when the model has no textures to load. */
export function convertModel(file: File, neighbours: Neighbours = {}, path = file.name): Promise<File> {
  if (needsDom(file, neighbours) || typeof Worker === 'undefined') return toGlb(file, neighbours, path)
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    convertWorker().postMessage({ id, file, neighbours, path })
  })
}
