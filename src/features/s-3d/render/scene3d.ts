import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { resolveFile } from '../files'
import type { CameraKey3D, Geometry3D, Keyframe3D, Material3D, Obj3D, SNode, Scene3D, Vec3 } from '../types'

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

/** `lite` builds low-poly geometry for measuring: the same extents at a fraction of the cost. */
export function makeGeometry(geo: Geometry3D, p: Obj3D['params'], lite = false): THREE.BufferGeometry {
  const n = (k: string) => num(p, k, geo)
  const seg = (full: number, low: number) => (lite ? low : full)
  switch (geo) {
    case 'box': return new THREE.BoxGeometry(n('width'), n('height'), n('depth'))
    case 'roundedBox': return new RoundedBoxGeometry(n('width'), n('height'), n('depth'), seg(4, 1), Math.min(n('radius'), n('width') / 2, n('height') / 2, n('depth') / 2))
    case 'sphere': return new THREE.SphereGeometry(n('radius'), seg(48, 12), seg(32, 8))
    case 'cylinder': return new THREE.CylinderGeometry(n('radiusTop'), n('radiusBottom'), n('height'), seg(48, 12))
    case 'cone': return new THREE.ConeGeometry(n('radius'), n('height'), seg(48, 12))
    case 'capsule': return new THREE.CapsuleGeometry(n('radius'), n('length'), seg(8, 2), seg(24, 8))
    case 'torus': return new THREE.TorusGeometry(n('radius'), n('tube'), seg(24, 8), seg(96, 24), THREE.MathUtils.degToRad(n('arc')))
    case 'torusKnot': return new THREE.TorusKnotGeometry(n('radius'), n('tube'), seg(160, 48), seg(20, 6), n('p'), n('q'))
    case 'plane': return new THREE.PlaneGeometry(n('width'), n('height'))
    case 'circle': return new THREE.CircleGeometry(n('radius'), seg(48, 12))
    case 'ring': return new THREE.RingGeometry(n('innerRadius'), n('outerRadius'), seg(48, 12))
    case 'icosahedron': return new THREE.IcosahedronGeometry(n('radius'), n('detail'))
    case 'dodecahedron': return new THREE.DodecahedronGeometry(n('radius'), n('detail'))
    case 'octahedron': return new THREE.OctahedronGeometry(n('radius'), n('detail'))
    case 'tetrahedron': return new THREE.TetrahedronGeometry(n('radius'), n('detail'))
    case 'lathe': {
      const profile = pts(p, 'points').map(([x, y]) => new THREE.Vector2(x, y))
      return new THREE.LatheGeometry(profile.length > 1 ? profile : [new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)], lite ? Math.min(12, n('segments')) : n('segments'))
    }
    case 'extrude': {
      const outline = pts(p, 'points')
      const shape = new THREE.Shape((outline.length > 2 ? outline : [[0, 0], [1, 0], [0.5, 1]]).map(([x, y]) => new THREE.Vector2(x, y)))
      const bevel = n('bevel')
      const g = new THREE.ExtrudeGeometry(shape, { depth: n('depth'), bevelEnabled: bevel > 0, curveSegments: seg(12, 4), bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 })
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
export async function buildScene(scene: Scene3D, { models = true, lite = false } = {}) {
  const liteMat = lite ? new THREE.MeshBasicMaterial() : null
  const root = new THREE.Group()
  const made = new Map<string, THREE.Object3D>()
  for (const o of scene.objects) {
    let obj: THREE.Object3D
    if (o.kind === 'mesh') {
      const mesh = new THREE.Mesh(makeGeometry(o.geometry ?? 'box', o.params, lite), liteMat ?? makeMaterial(o.material))
      mesh.castShadow = o.castShadow ?? true
      mesh.receiveShadow = true
      obj = mesh
    } else if (o.kind === 'light') obj = lite ? new THREE.Object3D() : makeLight(o, scene.shadows)
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
    obj.userData = { id: o.id, kind: o.kind, animate: o.animate, keyframes: o.keyframes?.length ? o.keyframes : undefined, base: { position: o.position, rotation: o.rotation, scale: o.scale, visible: o.visible } }
    obj.position.set(...o.position)
    obj.rotation.set(...rad(o.rotation))
    obj.scale.set(...o.scale)
    obj.visible = o.visible
    made.set(o.id, obj)
  }
  for (const o of scene.objects) (made.get(o.parent ?? '') ?? root).add(made.get(o.id)!)
  if (scene.ground.visible && !lite) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(groundRadius(root), 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: scene.ground.color, roughness: 0.95, alphaMap: groundFade(), transparent: true, depthWrite: false }))
    ground.position.y = scene.ground.y
    ground.receiveShadow = true
    ground.userData = { ground: true }
    root.add(ground)
  }
  root.updateMatrixWorld(true)
  return root
}

/**
 * Runs `fn` on a cheap, model-less, low-poly build of the scene (for bounds, framing and checks) and frees it after.
 * Models count as unit cubes.
 */
export async function measureScene<T>(scene: Scene3D, fn: (root: THREE.Group) => T): Promise<T> {
  const root = await buildScene(scene, { models: false, lite: true })
  try {
    return fn(root)
  } finally {
    disposeTree(root)
  }
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

const smooth = (k: number) => k * k * (3 - 2 * k)

/** A channel's value at time t, interpolated between the keys that set it. */
function sampleChannel(keys: Keyframe3D[], ch: 'position' | 'rotation' | 'scale', t: number, base: Vec3): Vec3 {
  let prev: Keyframe3D | undefined
  for (const k of keys) {
    const v = k[ch]
    if (!v) continue
    if (k.t >= t) {
      if (!prev) return v
      const a = prev[ch]!
      const span = k.t - prev.t
      const raw = span > 0 ? (t - prev.t) / span : 1
      const e = k.ease === 'linear' ? raw : smooth(raw)
      return [a[0] + (v[0] - a[0]) * e, a[1] + (v[1] - a[1]) * e, a[2] + (v[2] - a[2]) * e]
    }
    prev = k
  }
  return prev?.[ch] ?? base
}

function sampleVisible(keys: Keyframe3D[], t: number, base: boolean) {
  let v = base
  for (const k of keys) if (k.visible !== undefined && k.t <= t) v = k.visible
  return v
}

/** Timeline length: the scene's duration, else the last keyframe or camera key, else 5 s of looping motion. */
export function sceneDuration(scene: Scene3D) {
  if (scene.duration) return scene.duration
  const last = Math.max(0, ...scene.objects.flatMap((o) => o.keyframes?.map((k) => k.t) ?? []), ...(scene.cameraKeys?.map((k) => k.t) ?? []))
  return last > 0 ? last : 5
}

/** The camera at time t, following camera keys when the scene has them. */
export function cameraAt(scene: Scene3D, t: number): Scene3D['camera'] {
  const keys = [...(scene.cameraKeys ?? [])].sort((a, b) => a.t - b.t)
  if (!keys.length) return scene.camera
  const asKey = (k: CameraKey3D): Keyframe3D => ({ t: k.t, position: k.position, rotation: k.target })
  const kf = keys.map(asKey)
  const fovKeys = keys.map((k) => ({ t: k.t, scale: [k.fov ?? scene.camera.fov, 0, 0] as Vec3 }))
  return { position: sampleChannel(kf, 'position', t, scene.camera.position), target: sampleChannel(kf, 'rotation', t, scene.camera.target), fov: sampleChannel(fovKeys, 'scale', t, [scene.camera.fov, 0, 0])[0] }
}

/** Poses every animated object for time `t` seconds. Absolute in t, so any frame can be rendered on its own. */
export function animate(root: THREE.Object3D, t: number) {
  root.traverse((o) => {
    const a = o.userData.animate as Obj3D['animate']
    const keys = o.userData.keyframes as Keyframe3D[] | undefined
    if (!a && !keys) return
    const base = o.userData.base as { position: Vec3; rotation: Vec3; scale: Vec3; visible: boolean }
    const pos = keys ? sampleChannel(keys, 'position', t, base.position) : base.position
    const rot = keys ? sampleChannel(keys, 'rotation', t, base.rotation) : base.rotation
    const scl = keys ? sampleChannel(keys, 'scale', t, base.scale) : base.scale
    o.position.set(...pos)
    o.rotation.set(...rad(rot))
    o.scale.set(...scl)
    if (keys) o.visible = sampleVisible(keys, t, base.visible)
    if (!a) return
    const s = a.speed || 1
    if (a.kind === 'spin') o.rotation[a.axis ?? 'y'] += t * s
    else if (a.kind === 'float') o.position.y = pos[1] + Math.sin(t * s * 2) * 0.1
    else if (a.kind === 'pulse') o.scale.multiplyScalar(1 + Math.sin(t * s * 3) * 0.05)
    else if (a.kind === 'orbit') {
      const r = Math.hypot(pos[0], pos[2])
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
function offscreenRenderer() {
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
  return offscreen
}

export type SceneView = 'camera' | 'front' | 'side' | 'top' | 'iso'
const VIEW_DIRS: Record<Exclude<SceneView, 'camera'>, Vec3> = { front: [0, 0.15, 1], side: [1, 0.15, 0], top: [0.001, 1, 0.001], iso: [1, 0.75, 1.3] }

/** Output size for a node of w×h, longest side capped at `max`. */
export function fitSize(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(w, h))
  const even = (v: number) => Math.max(64, Math.round(v * k / 2) * 2)
  return { width: even(w), height: even(h) }
}

/**
 * Builds a scene once and renders it at any time on the timeline. `frame(t)` poses objects and the camera for t
 * and draws into `canvas`; call `dispose` when done.
 */
export async function sceneRenderer(scene: Scene3D, width: number, height: number, view: SceneView = 'camera') {
  const gl = offscreenRenderer()
  gl.setSize(width, height, false)
  const target = new THREE.Scene()
  const root = await buildScene(scene)
  target.add(root)
  applyLook(target, { ...scene, background: scene.background ?? '#ffffff' }, gl)
  const fixed = view === 'camera' ? null : fitCamera(root, width / height, scene.camera.fov, VIEW_DIRS[view])
  return {
    canvas: gl.domElement,
    frame(t: number) {
      animate(root, t)
      root.updateMatrixWorld(true)
      gl.render(target, makeCamera({ ...scene, camera: fixed ?? cameraAt(scene, t) }, width / height))
    },
    dispose: () => disposeTree(root),
  }
}

/** Renders a scene to a PNG (base64, no data: prefix) at time t, optionally from a preset view instead of the scene camera. */
export async function renderScene(scene: Scene3D, w: number, h: number, view: SceneView = 'camera', t = 0, max = 768) {
  const { width, height } = fitSize(w, h, max)
  const r = await sceneRenderer(scene, width, height, view)
  r.frame(t)
  const url = r.canvas.toDataURL('image/png')
  r.dispose()
  return url.slice(url.indexOf(',') + 1)
}

/** Several frames of the timeline in one contact sheet, so the agent can check motion in a single look. */
export async function renderTimeline(scene: Scene3D, w: number, h: number, times: number[], view: SceneView = 'camera') {
  const cols = Math.min(times.length, 3)
  const rows = Math.ceil(times.length / cols)
  const cell = fitSize(w, h, 400)
  const r = await sceneRenderer(scene, cell.width, cell.height, view)
  const sheet = document.createElement('canvas')
  sheet.width = cell.width * cols
  sheet.height = cell.height * rows
  const g = sheet.getContext('2d')!
  g.font = '600 16px system-ui, sans-serif'
  times.forEach((t, i) => {
    r.frame(t)
    const x = (i % cols) * cell.width, y = Math.floor(i / cols) * cell.height
    g.drawImage(r.canvas, x, y)
    g.fillStyle = '#000a'
    g.fillRect(x + 6, y + 6, 70, 24)
    g.fillStyle = '#fff'
    g.fillText(`t=${Math.round(t * 10) / 10}s`, x + 12, y + 24)
  })
  r.dispose()
  const url = sheet.toDataURL('image/png')
  return url.slice(url.indexOf(',') + 1)
}

function videoMime() {
  const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
}

/**
 * Records the scene timeline to a video. Frames are posed by time so motion is exact, but MediaRecorder stamps
 * frames by wall clock, so recording takes about as long as the clip.
 */
export async function recordScene(scene: Scene3D, w: number, h: number, opts: { duration?: number; fps?: number; view?: SceneView; max?: number; onProgress?: (f: number) => void } = {}) {
  const mime = videoMime()
  if (!mime) throw new Error('This browser cannot record video (no MediaRecorder).')
  const duration = Math.min(120, opts.duration ?? sceneDuration(scene))
  const fps = Math.min(60, Math.max(10, opts.fps ?? 30))
  const { width, height } = fitSize(w, h, opts.max ?? 1280)
  const r = await sceneRenderer(scene, width, height, opts.view)
  // Recording reads from a 2D canvas copy, so the shared WebGL canvas can be resized by other renders meanwhile.
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const g = out.getContext('2d')!
  const stream = out.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((res) => (rec.onstop = () => res()))
  const frames = Math.max(1, Math.round(duration * fps))
  const draw = (t: number) => {
    r.frame(t)
    g.drawImage(r.canvas, 0, 0, width, height)
    track.requestFrame()
  }
  try {
    draw(0)
    rec.start()
    const start = performance.now()
    for (let i = 0; i <= frames; i++) {
      draw(i / fps)
      opts.onProgress?.(i / frames)
      const wait = start + ((i + 1) * 1000) / fps - performance.now()
      await new Promise((res) => setTimeout(res, Math.max(0, wait)))
    }
  } finally {
    if (rec.state !== 'inactive') rec.stop()
    await done
    stream.getTracks().forEach((t) => t.stop())
    r.dispose()
  }
  const type = mime.split(';')[0]
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', width, height, duration, fps }
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData.shared) return
    m.geometry?.dispose()
    for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose()
  })
}
