import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { resolveFile } from '../files'
import type { Geometry3D, Material3D, Obj3D, SNode, Scene3D, Vec3 } from '../types'

/** Dimension keys and defaults per geometry, in scene units. Also documents the params the agent may set. */
export const GEOMETRY_PARAMS: Record<Geometry3D, Record<string, number>> = {
  box: { width: 1, height: 1, depth: 1 },
  roundedBox: { width: 1, height: 1, depth: 1, radius: 0.1 },
  sphere: { radius: 0.5 },
  cylinder: { radiusTop: 0.5, radiusBottom: 0.5, height: 1 },
  cone: { radius: 0.5, height: 1 },
  capsule: { radius: 0.3, length: 0.6 },
  torus: { radius: 0.5, tube: 0.15, arc: 360 },
  torusKnot: { radius: 0.4, tube: 0.12, p: 2, q: 3 },
  plane: { width: 1, height: 1 },
  circle: { radius: 0.5 },
  ring: { innerRadius: 0.3, outerRadius: 0.5 },
  icosahedron: { radius: 0.5, detail: 0 },
  dodecahedron: { radius: 0.5, detail: 0 },
  octahedron: { radius: 0.5, detail: 0 },
  tetrahedron: { radius: 0.5, detail: 0 },
  lathe: { segments: 48 },
  extrude: { depth: 0.2, bevel: 0.02 },
}

export const DEFAULT_MATERIAL: Material3D = {
  color: '#9ca3af', metalness: 0, roughness: 0.5, emissive: '#000000', emissiveIntensity: 1, opacity: 1, transmission: 0, clearcoat: 0, wireframe: false, flatShading: false,
}

/** Starting points for common surfaces; any explicit material field overrides the preset. */
export const MATERIAL_PRESETS: Record<string, Partial<Material3D>> = {
  matte: { roughness: 0.9, metalness: 0 },
  plastic: { roughness: 0.35, metalness: 0, clearcoat: 0.3 },
  glossy: { roughness: 0.15, metalness: 0, clearcoat: 1 },
  rubber: { roughness: 1, metalness: 0 },
  metal: { roughness: 0.35, metalness: 1 },
  chrome: { roughness: 0.05, metalness: 1, color: '#e5e7eb' },
  gold: { roughness: 0.25, metalness: 1, color: '#d4a537' },
  glass: { roughness: 0.05, metalness: 0, transmission: 1, color: '#ffffff' },
  ceramic: { roughness: 0.2, metalness: 0, clearcoat: 0.8 },
  wood: { roughness: 0.75, metalness: 0, color: '#8b5a2b' },
  fabric: { roughness: 1, metalness: 0 },
  emissive: { roughness: 0.5, metalness: 0, emissiveIntensity: 2 },
}

export function emptyScene(): Scene3D {
  return {
    objects: [],
    background: null,
    environment: 'studio',
    camera: { position: [4, 3, 5], target: [0, 0.5, 0], fov: 40 },
    ground: { visible: true, color: '#e5e7eb', y: 0 },
    shadows: true,
  }
}

/** A node's scene; a plain 3D shape becomes a scene holding that shape, so it can be edited like any other. */
export function sceneOf(n: SNode): Scene3D {
  if (!n.scene && n.type === 'model3d') return modelScene(n.src, n.name)
  return n.scene ?? {
    ...emptyScene(),
    objects: [{ id: 'shape', name: n.shape3d, kind: 'mesh', parent: null, position: [0, 0.75, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, geometry: n.shape3d === 'cube' ? 'box' : n.shape3d, params: {}, material: { ...DEFAULT_MATERIAL, color: n.modelColor } }],
  }
}

/** A scene showing one imported GLB/GLTF, about 1.5 units tall on the ground. */
export function modelScene(src: string, name: string): Scene3D {
  return {
    ...emptyScene(),
    camera: { position: [2.2, 1.6, 2.8], target: [0, 0.75, 0], fov: 40 },
    objects: [
      { id: 'model', name, kind: 'model', parent: null, src, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1.5, 1.5, 1.5], visible: true },
      { id: 'key-light', name: 'Key light', kind: 'light', parent: null, position: [4, 7, 5], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, light: { type: 'directional', color: '#ffffff', intensity: 2.2, castShadow: true } },
    ],
  }
}

const num = (p: Obj3D['params'], key: string, geo: Geometry3D) => {
  const v = p?.[key]
  return typeof v === 'number' ? v : GEOMETRY_PARAMS[geo][key]
}
const pts = (p: Obj3D['params'], key: string) => (Array.isArray(p?.[key]) ? (p[key] as number[][]) : [])

export function makeGeometry(geo: Geometry3D, p: Obj3D['params']): THREE.BufferGeometry {
  const n = (k: string) => num(p, k, geo)
  switch (geo) {
    case 'box': return new THREE.BoxGeometry(n('width'), n('height'), n('depth'))
    case 'roundedBox': return new RoundedBoxGeometry(n('width'), n('height'), n('depth'), 4, Math.min(n('radius'), n('width') / 2, n('height') / 2, n('depth') / 2))
    case 'sphere': return new THREE.SphereGeometry(n('radius'), 48, 32)
    case 'cylinder': return new THREE.CylinderGeometry(n('radiusTop'), n('radiusBottom'), n('height'), 48)
    case 'cone': return new THREE.ConeGeometry(n('radius'), n('height'), 48)
    case 'capsule': return new THREE.CapsuleGeometry(n('radius'), n('length'), 8, 24)
    case 'torus': return new THREE.TorusGeometry(n('radius'), n('tube'), 24, 96, THREE.MathUtils.degToRad(n('arc')))
    case 'torusKnot': return new THREE.TorusKnotGeometry(n('radius'), n('tube'), 160, 20, n('p'), n('q'))
    case 'plane': return new THREE.PlaneGeometry(n('width'), n('height'))
    case 'circle': return new THREE.CircleGeometry(n('radius'), 48)
    case 'ring': return new THREE.RingGeometry(n('innerRadius'), n('outerRadius'), 48)
    case 'icosahedron': return new THREE.IcosahedronGeometry(n('radius'), n('detail'))
    case 'dodecahedron': return new THREE.DodecahedronGeometry(n('radius'), n('detail'))
    case 'octahedron': return new THREE.OctahedronGeometry(n('radius'), n('detail'))
    case 'tetrahedron': return new THREE.TetrahedronGeometry(n('radius'), n('detail'))
    case 'lathe': {
      const profile = pts(p, 'points').map(([x, y]) => new THREE.Vector2(x, y))
      return new THREE.LatheGeometry(profile.length > 1 ? profile : [new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)], n('segments'))
    }
    case 'extrude': {
      const outline = pts(p, 'points')
      const shape = new THREE.Shape((outline.length > 2 ? outline : [[0, 0], [1, 0], [0.5, 1]]).map(([x, y]) => new THREE.Vector2(x, y)))
      const bevel = n('bevel')
      const g = new THREE.ExtrudeGeometry(shape, { depth: n('depth'), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 })
      g.center()
      return g
    }
  }
}

function makeMaterial(m: Partial<Material3D> | undefined) {
  const v = { ...DEFAULT_MATERIAL, ...m }
  return new THREE.MeshPhysicalMaterial({
    color: v.color, metalness: v.metalness, roughness: v.roughness, emissive: v.emissive, emissiveIntensity: v.emissiveIntensity,
    opacity: v.opacity, transparent: v.opacity < 1 || v.transmission > 0, transmission: v.transmission, thickness: v.transmission ? 0.5 : 0,
    clearcoat: v.clearcoat, wireframe: v.wireframe, flatShading: v.flatShading, side: THREE.DoubleSide,
  })
}

function makeLight(o: Obj3D, shadows: boolean): THREE.Object3D {
  const l = o.light!
  switch (l.type) {
    case 'ambient': return new THREE.AmbientLight(l.color, l.intensity)
    case 'hemisphere': return new THREE.HemisphereLight(l.color, l.groundColor ?? '#444455', l.intensity)
    case 'point': {
      const p = new THREE.PointLight(l.color, l.intensity, 0, 2)
      p.castShadow = shadows && l.castShadow
      return p
    }
    case 'spot':
    case 'directional': {
      const d = l.type === 'spot' ? new THREE.SpotLight(l.color, l.intensity, 0, THREE.MathUtils.degToRad(l.angle ?? 30), 0.3, 2) : new THREE.DirectionalLight(l.color, l.intensity)
      d.castShadow = shadows && l.castShadow
      d.shadow.mapSize.set(2048, 2048)
      d.shadow.bias = -0.0005
      if (d instanceof THREE.DirectionalLight) Object.assign(d.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.1, far: 50 })
      // Lights shine at the scene origin.
      return d
    }
  }
}

let gltfLoader: GLTFLoader | null = null
/** Many published models (the Smithsonian's among them) are Draco-compressed, so the loader carries a decoder. */
function loader() {
  if (!gltfLoader) {
    const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    gltfLoader = new GLTFLoader().setDRACOLoader(draco)
  }
  return gltfLoader
}

const gltfCache = new Map<string, Promise<THREE.Group | null>>()
function loadModel(src: string) {
  if (!gltfCache.has(src)) {
    gltfCache.set(src, resolveFile(src).then((url) => loader().loadAsync(url)).then((g) => g.scene, (e) => {
      console.warn('[S3D] model failed to load:', e)
      return null
    }))
  }
  return gltfCache.get(src)!
}

/** Scales a loaded model to fit a 1-unit cube resting on y=0, so `scale` means the same for every model. */
function normalizeModel(scene: THREE.Group) {
  const clone = scene.clone(true)
  const box = new THREE.Box3().setFromObject(clone)
  const size = box.getSize(new THREE.Vector3())
  const k = 1 / Math.max(size.x, size.y, size.z, 1e-6)
  const center = box.getCenter(new THREE.Vector3())
  clone.position.set(-center.x * k, -box.min.y * k, -center.z * k)
  clone.scale.setScalar(k)
  const wrap = new THREE.Group()
  wrap.add(clone)
  return wrap
}

const rad = (v: Vec3) => v.map((d) => THREE.MathUtils.degToRad(d)) as Vec3

/**
 * Builds the three.js graph for a scene. Every object carries `userData.id`, and animated ones `userData.animate`.
 * Models load asynchronously; pass `models: false` to skip them (bounds then treat a model as a unit cube).
 */
export async function buildScene(scene: Scene3D, { models = true } = {}) {
  const root = new THREE.Group()
  const made = new Map<string, THREE.Object3D>()
  for (const o of scene.objects) {
    let obj: THREE.Object3D
    if (o.kind === 'mesh') {
      const mesh = new THREE.Mesh(makeGeometry(o.geometry ?? 'box', o.params), makeMaterial(o.material))
      mesh.castShadow = o.castShadow ?? true
      mesh.receiveShadow = true
      obj = mesh
    } else if (o.kind === 'light') obj = makeLight(o, scene.shadows)
    else if (o.kind === 'model') {
      const loaded = models && o.src ? await loadModel(o.src) : null
      obj = loaded ? normalizeModel(loaded) : new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), makeMaterial({ color: '#c4b5fd', wireframe: true }))
      // Model meshes share the cached geometry, so they are never disposed.
      obj.traverse((c) => {
        c.userData.shared = true
        if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true
      })
    } else obj = new THREE.Group()
    obj.name = o.name
    obj.userData = { id: o.id, kind: o.kind, animate: o.animate, base: o.position }
    obj.position.set(...o.position)
    obj.rotation.set(...rad(o.rotation))
    obj.scale.set(...o.scale)
    obj.visible = o.visible
    made.set(o.id, obj)
  }
  for (const o of scene.objects) (made.get(o.parent ?? '') ?? root).add(made.get(o.id)!)
  if (scene.ground.visible) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(groundRadius(root), 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: scene.ground.color, roughness: 0.95, alphaMap: groundFade(), transparent: true, depthWrite: false }))
    ground.position.y = scene.ground.y
    ground.receiveShadow = true
    ground.userData = { ground: true }
    root.add(ground)
  }
  root.updateMatrixWorld(true)
  return root
}

/** Ground size follows the scene so it reads as a soft stage, not a disc with a visible rim. */
function groundRadius(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return 4
  const size = box.getSize(new THREE.Vector3())
  return Math.max(2, Math.hypot(size.x, size.z) * 1.6)
}

let fade: THREE.Texture | null = null
/** Radial alpha: solid in the middle, fading out to the edge. */
function groundFade() {
  if (fade) return fade
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, '#fff')
  grad.addColorStop(0.55, '#fff')
  grad.addColorStop(1, '#000')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  fade = new THREE.CanvasTexture(c)
  return fade
}

/** Moves animated objects for time `t` seconds. */
export function animate(root: THREE.Object3D, t: number, dt: number) {
  root.traverse((o) => {
    const a = o.userData.animate as Obj3D['animate']
    if (!a) return
    const base = o.userData.base as Vec3
    const s = a.speed || 1
    if (a.kind === 'spin') o.rotation.y += dt * s
    else if (a.kind === 'float') o.position.y = base[1] + Math.sin(t * s * 2) * 0.1
    else if (a.kind === 'pulse') o.scale.setScalar(1 + Math.sin(t * s * 3) * 0.05)
    else if (a.kind === 'orbit') {
      const r = Math.hypot(base[0], base[2])
      o.position.x = Math.cos(t * s) * r
      o.position.z = Math.sin(t * s) * r
    }
  })
}

let roomEnv: { gen: THREE.PMREMGenerator; tex: THREE.Texture } | null = null
/** Applies background and environment for a renderer; the studio environment is generated once per renderer. */
export function applyLook(target: THREE.Scene, scene: Scene3D, gl: THREE.WebGLRenderer) {
  target.background = scene.background ? new THREE.Color(scene.background) : null
  if (scene.environment === 'studio') {
    if (!roomEnv || (roomEnv.gen as unknown as { _renderer: unknown })._renderer !== gl) {
      const gen = new THREE.PMREMGenerator(gl)
      roomEnv = { gen, tex: gen.fromScene(new RoomEnvironment(), 0.04).texture }
    }
    target.environment = roomEnv.tex
    target.environmentIntensity = 0.6
  } else target.environment = null
}

/** World-space bounds of each object id (lights excluded), ground excluded. */
export function objectBounds(root: THREE.Object3D) {
  const out = new Map<string, THREE.Box3>()
  root.traverse((o) => {
    const id = o.userData.id as string | undefined
    if (!id || o.userData.kind === 'light') return
    const box = new THREE.Box3().setFromObject(o)
    if (!box.isEmpty()) out.set(id, box)
  })
  return out
}

export function makeCamera(scene: Scene3D, aspect: number) {
  const cam = new THREE.PerspectiveCamera(scene.camera.fov, aspect, 0.05, 500)
  cam.position.set(...scene.camera.position)
  cam.lookAt(...scene.camera.target)
  cam.updateMatrixWorld()
  return cam
}

/** A camera that frames every visible object from a 3/4 view (or the given direction). */
export function fitCamera(root: THREE.Object3D, aspect: number, fov = 40, dir: Vec3 = [1, 0.75, 1.3]): Scene3D['camera'] {
  const all = new THREE.Box3()
  for (const b of objectBounds(root).values()) all.union(b)
  if (all.isEmpty()) all.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1))
  const sphere = all.getBoundingSphere(new THREE.Sphere())
  const vfov = THREE.MathUtils.degToRad(fov)
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
  const dist = (sphere.radius * 1.15) / Math.sin(Math.min(vfov, hfov) / 2)
  const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist).add(sphere.center)
  const r = (v: number) => Math.round(v * 100) / 100
  return { position: [r(d.x), r(d.y), r(d.z)], target: [r(sphere.center.x), r(sphere.center.y), r(sphere.center.z)], fov }
}

let offscreen: THREE.WebGLRenderer | null = null
/** Renders a scene to a PNG (base64, no data: prefix), optionally from a preset view instead of the scene camera. */
export async function renderScene(scene: Scene3D, w: number, h: number, view: 'camera' | 'front' | 'side' | 'top' | 'iso' = 'camera') {
  if (!offscreen) {
    try {
      offscreen = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    } catch {
      throw new Error('3D rendering is unavailable in this browser (no WebGL). Judge the scene with get_scene bounds instead.')
    }
    offscreen.shadowMap.enabled = true
    offscreen.shadowMap.type = THREE.PCFSoftShadowMap
    offscreen.toneMapping = THREE.ACESFilmicToneMapping
    offscreen.outputColorSpace = THREE.SRGBColorSpace
  }
  const k = Math.min(1, 768 / Math.max(w, h))
  const width = Math.max(64, Math.round(w * k)), height = Math.max(64, Math.round(h * k))
  offscreen.setSize(width, height, false)
  const target = new THREE.Scene()
  const root = await buildScene(scene)
  target.add(root)
  applyLook(target, { ...scene, background: scene.background ?? '#ffffff' }, offscreen)
  const dirs: Record<string, Vec3> = { front: [0, 0.15, 1], side: [1, 0.15, 0], top: [0.001, 1, 0.001], iso: [1, 0.75, 1.3] }
  const cam = view === 'camera' ? scene.camera : fitCamera(root, width / height, scene.camera.fov, dirs[view])
  offscreen.render(target, makeCamera({ ...scene, camera: cam }, width / height))
  const url = offscreen.domElement.toDataURL('image/png')
  disposeTree(root)
  return url.slice(url.indexOf(',') + 1)
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.shared) return
    m.geometry?.dispose()
    for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose()
  })
}
