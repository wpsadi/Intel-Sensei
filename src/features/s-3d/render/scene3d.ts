import * as THREE from 'three'
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, getFirstEncodableVideoCodec, type VideoCodec } from 'mediabunny'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { resolveFile } from '../files'
import { applyTextures, disposeTextures } from './textures'
import type { CameraKey3D, Geometry3D, Keyframe3D, Material3D, MeshData3D, Obj3D, SNode, Scene3D, Vec3 } from '../types'

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
  tube: { radius: 0.05, closed: 0 },
  helix: { radius: 0.3, height: 1, turns: 4, tube: 0.04 },
  wave: { width: 1, height: 1, amplitude: 0.08, frequency: 4 },
  mesh: {},
}

/** Point lists the path-based geometries fall back to when none is set; the inspector starts editing from these. */
export const DEFAULT_POINTS: Partial<Record<Geometry3D, number[][]>> = {
  tube: [[-0.5, 0, 0], [-0.2, 0.3, 0.2], [0.2, -0.3, -0.2], [0.5, 0, 0]],
  lathe: [[0, 0], [0.5, 0], [0.5, 0.2], [0.2, 0.6], [0.3, 1]],
  extrude: [[0, 0], [1, 0], [0.5, 1]],
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
      return new THREE.LatheGeometry(profile.length > 1 ? profile : DEFAULT_POINTS.lathe!.map(([x, y]) => new THREE.Vector2(x, y)), lite ? Math.min(12, n('segments')) : n('segments'))
    }
    case 'tube': {
      // A smooth Catmull-Rom curve through [x, y, z] points, swept with a round pipe.
      const raw = pts(p, 'points').filter((q) => q.length >= 3)
      const path = (raw.length > 1 ? raw : DEFAULT_POINTS.tube!).map(([x, y, z]) => new THREE.Vector3(x, y, z))
      const closed = n('closed') > 0
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, closed), seg(Math.max(24, path.length * 16), 12), n('radius'), seg(16, 6), closed)
    }
    case 'helix': {
      const turns = n('turns'), r = n('radius'), h = n('height')
      const count = Math.max(8, Math.ceil(turns * 24)) + 1
      const path = Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1)
        return new THREE.Vector3(Math.cos(t * turns * Math.PI * 2) * r, (t - 0.5) * h, Math.sin(t * turns * Math.PI * 2) * r)
      })
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), path.length * (lite ? 1 : 2), n('tube'), seg(12, 5), false)
    }
    case 'wave': {
      // A plane rippled along its width; lies flat like a plane when rotated -90° on x.
      const w = n('width'), h = n('height'), amp = n('amplitude'), freq = n('frequency')
      const g = new THREE.PlaneGeometry(w, h, seg(96, 16), seg(96, 16))
      const pos = g.attributes.position
      for (let i = 0; i < pos.count; i++) pos.setZ(i, amp * Math.sin((pos.getX(i) / w) * freq * Math.PI * 2) * Math.cos((pos.getY(i) / h) * freq * Math.PI))
      g.computeVertexNormals()
      return g
    }
    case 'mesh': return new THREE.BufferGeometry()
    case 'extrude': {
      const outline = pts(p, 'points')
      const shape = new THREE.Shape((outline.length > 2 ? outline : DEFAULT_POINTS.extrude!).map(([x, y]) => new THREE.Vector2(x, y)))
      const bevel = n('bevel')
      const g = new THREE.ExtrudeGeometry(shape, { depth: n('depth'), bevelEnabled: bevel > 0, curveSegments: seg(12, 4), bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 })
      g.center()
      return g
    }
  }
}

/** Box-projected UVs: each vertex takes the two axes across the face it mostly points along. Fine for noise, fur and tiling patterns. */
function boxUVs(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal')
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    if (ay >= ax && ay >= az) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i) }
    else if (ax >= az) { uv[i * 2] = p.getZ(i); uv[i * 2 + 1] = p.getY(i) }
    else { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getY(i) }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

let furNoise: THREE.CanvasTexture | null = null
/** Random dots: where a strand exists. Shells cut this at a rising threshold, so strands thin out toward the tip. */
function strandNoise() {
  if (!furNoise) {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const img = g.createImageData(256, 256)
    for (let i = 0; i < 256 * 256; i++) {
      const v = Math.floor(Math.random() * 255)
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
    furNoise = new THREE.CanvasTexture(c)
    furNoise.wrapS = furNoise.wrapT = THREE.RepeatWrapping
  }
  return furNoise
}

/** Short fur as shells: copies of the surface pushed out along its normals, each keeping fewer strand pixels. */
function addFur(mesh: THREE.Mesh, o: Obj3D) {
  const fur = o.fur!
  const layers = Math.max(3, Math.min(16, Math.round(fur.layers)))
  const base = new THREE.Color(o.material?.color ?? DEFAULT_MATERIAL.color)
  const tip = new THREE.Color(fur.tipColor ?? o.material?.color ?? DEFAULT_MATERIAL.color)
  const src = mesh.geometry
  if (!src.getAttribute('normal')) src.computeVertexNormals()
  if (!src.getAttribute('uv')) boxUVs(src)
  const useVertexColors = !!o.material?.vertexColors && !!src.getAttribute('color')
  for (let i = 1; i <= layers; i++) {
    const t = i / layers
    const g = src.clone()
    const p = g.getAttribute('position'), n = g.getAttribute('normal')
    for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) + n.getX(v) * fur.length * t, p.getY(v) + n.getY(v) * fur.length * t, p.getZ(v) + n.getZ(v) * fur.length * t)
    const noise = strandNoise().clone()
    noise.repeat.set(fur.density, fur.density)
    noise.needsUpdate = true
    const shell = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: base.clone().lerp(tip, t), vertexColors: useVertexColors, roughness: o.material?.roughness ?? 0.9, alphaMap: noise, alphaTest: 0.15 + 0.7 * t, transparent: false, side: THREE.DoubleSide,
    }))
    shell.castShadow = false
    shell.receiveShadow = true
    shell.userData = { fur: true }
    mesh.add(shell)
  }
}

/** A baked mesh as geometry, with smooth shading from its shared vertices. */
function meshGeometry(m: MeshData3D) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3))
  if (m.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(m.colors, 3))
  g.setIndex(m.indices)
  g.computeVertexNormals()
  boxUVs(g)
  return g
}

function makeMaterial(m: Partial<Material3D> | undefined) {
  const v = { ...DEFAULT_MATERIAL, ...m }
  const mat = new THREE.MeshPhysicalMaterial({
    color: v.color, metalness: v.metalness, roughness: v.roughness, emissive: v.emissive, emissiveIntensity: v.emissiveIntensity,
    opacity: v.opacity, transparent: v.opacity < 1 || v.transmission > 0, transmission: v.transmission, thickness: v.transmission ? 0.5 : 0,
    clearcoat: v.clearcoat, vertexColors: !!v.vertexColors, sheen: v.sheen ?? 0, sheenColor: new THREE.Color(v.sheenColor ?? '#ffffff'), sheenRoughness: 0.5, specularIntensity: v.specularIntensity ?? 1, wireframe: v.wireframe, flatShading: v.flatShading, side: THREE.DoubleSide,
  })
  applyTextures(mat, v)
  return mat
}

/** A bigger `size` blurs the shadow edge, like a larger light source. */
function softShadow(light: THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight, size = 0) {
  light.shadow.radius = 1 + size * 2
  light.shadow.blurSamples = 8 + Math.round(size * 2)
}

function makeLight(o: Obj3D, shadows: boolean): THREE.Object3D {
  const l = o.light!
  switch (l.type) {
    case 'ambient': return new THREE.AmbientLight(l.color, l.intensity)
    case 'hemisphere': return new THREE.HemisphereLight(l.color, l.groundColor ?? '#444455', l.intensity)
    case 'point': {
      const p = new THREE.PointLight(l.color, l.intensity, 0, 2)
      p.castShadow = shadows && l.castShadow
      softShadow(p, l.size)
      return p
    }
    case 'spot':
    case 'directional': {
      const d = l.type === 'spot' ? new THREE.SpotLight(l.color, l.intensity, 0, THREE.MathUtils.degToRad(l.angle ?? 30), 0.3, 2) : new THREE.DirectionalLight(l.color, l.intensity)
      d.castShadow = shadows && l.castShadow
      d.shadow.mapSize.set(2048, 2048)
      d.shadow.bias = -0.0005
      softShadow(d, l.size)
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
      const mesh = new THREE.Mesh(o.geometry === 'mesh' && o.mesh ? meshGeometry(o.mesh) : makeGeometry(o.geometry ?? 'box', o.params, lite), liteMat ?? makeMaterial(o.material))
      mesh.castShadow = o.castShadow ?? true
      mesh.receiveShadow = true
      if (o.fur && !lite) addFur(mesh, o)
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
  if (!lite) fitShadows(root, scene)
  return root
}

/** Sizes each light's shadow map to the subject, so a small model gets sharp shadows instead of a thin slice of a huge map. */
function fitShadows(root: THREE.Object3D, scene: Scene3D) {
  const box = new THREE.Box3()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !o.userData.ground && !o.userData.fur && !o.userData.helper) box.expandByObject(m)
  })
  if (box.isEmpty()) return
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  // Lights aim at the origin, so the frustum must reach from there out to the far side of the subject.
  const radius = sphere.radius + sphere.center.length()
  const size = { normal: 2048, high: 4096, ultra: 8192 }[scene.shadowQuality ?? 'normal']
  root.traverse((o) => {
    const l = o as THREE.DirectionalLight
    if (!l.isDirectionalLight || !l.castShadow) return
    const r = Math.max(radius * 1.6, 1)
    Object.assign(l.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.05, far: Math.max(50, r * 8) })
    l.shadow.camera.updateProjectionMatrix()
  })
  root.traverse((o) => {
    const l = o as THREE.DirectionalLight
    if (l.shadow && l.castShadow) l.shadow.mapSize.set(size, size)
  })
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
  // The renderer is shared, so every look sets its tone mapping and exposure explicitly.
  gl.toneMapping = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, linear: THREE.LinearToneMapping, none: THREE.NoToneMapping }[scene.toneMapping ?? 'aces']
  gl.toneMappingExposure = scene.exposure ?? 1
  target.environmentRotation.set(0, THREE.MathUtils.degToRad(scene.envRotation ?? 0), 0)
  if (scene.environment === 'studio') {
    if (!roomEnv || (roomEnv.gen as unknown as { _renderer: unknown })._renderer !== gl) {
      const gen = new THREE.PMREMGenerator(gl)
      roomEnv = { gen, tex: gen.fromScene(new RoomEnvironment(), 0.04).texture }
    }
    target.environment = roomEnv.tex
    target.environmentIntensity = scene.envIntensity ?? 0.6
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
  // A lost context (GPU reset, too many contexts) never comes back by itself, so start a new renderer.
  if (offscreen?.getContext().isContextLost()) {
    offscreen.dispose()
    offscreen = null
  }
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

export type SceneView = 'camera' | 'front' | 'back' | 'side' | 'left' | 'top' | 'iso' | 'iso-back'
export const VIEW_DIRS: Record<Exclude<SceneView, 'camera'>, Vec3> = {
  front: [0, 0.15, 1], back: [0, 0.15, -1], side: [1, 0.15, 0], left: [-1, 0.15, 0], top: [0.001, 1, 0.001], iso: [1, 0.75, 1.3], 'iso-back': [-1, 0.75, -1.3],
}
/** The angles a model must hold up from, front to back and above. */
export const ALL_ANGLES: SceneView[] = ['front', 'side', 'back', 'left', 'top', 'iso', 'iso-back']

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
export interface RenderOpts {
  /** Draw at this many times the size, then shrink: smoother edges. 1..3 */
  supersample?: number
  /** Show the mesh edges. */
  wireframe?: boolean
  /** Show only these objects (and what they sit in), hiding the rest. */
  only?: string[]
  /** Orthographic projection: no perspective, for judging proportions and alignment. */
  ortho?: boolean
}

/** Keeps the listed objects, their parents and their children visible and hides every other object. */
function isolate(root: THREE.Object3D, scene: Scene3D, only: string[]) {
  const keep = new Set<string>()
  const byId = new Map(scene.objects.map((o) => [o.id, o]))
  for (const id of only) {
    for (let o = byId.get(id); o; o = o.parent ? byId.get(o.parent) : undefined) keep.add(o.id)
    for (const o of scene.objects) for (let a: Obj3D | undefined = o; a; a = a.parent ? byId.get(a.parent) : undefined) if (a.id === id) keep.add(o.id)
  }
  root.traverse((o) => {
    const id = o.userData.id as string | undefined
    if (id && o.userData.kind !== 'light' && !keep.has(id)) o.visible = false
  })
}

function makeOrtho(cam: Scene3D['camera'], aspect: number) {
  const dist = new THREE.Vector3(...cam.position).distanceTo(new THREE.Vector3(...cam.target))
  const h = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist
  const c = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 0.05, 500)
  c.position.set(...cam.position)
  c.lookAt(...cam.target)
  c.updateMatrixWorld()
  return c
}

export async function sceneRenderer(scene: Scene3D, width: number, height: number, view: SceneView | Scene3D['camera'] = 'camera', opts: RenderOpts = {}) {
  const gl = offscreenRenderer()
  gl.setSize(width, height, false)
  const target = new THREE.Scene()
  const root = await buildScene(scene)
  if (opts.only?.length) isolate(root, scene, opts.only)
  if (opts.wireframe) root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !o.userData.ground) for (const mat of [m.material].flat()) (mat as THREE.MeshBasicMaterial).wireframe = true
  })
  target.add(root)
  applyLook(target, { ...scene, background: scene.background ?? '#ffffff' }, gl)
  const fixed = typeof view === 'object' ? view : view === 'camera' ? null : fitCamera(root, width / height, scene.camera.fov, VIEW_DIRS[view])
  return {
    canvas: gl.domElement,
    frame(t: number) {
      animate(root, t)
      root.updateMatrixWorld(true)
      const cam = fixed ?? cameraAt(scene, t)
      gl.render(target, opts.ortho ? makeOrtho(cam, width / height) : makeCamera({ ...scene, camera: cam }, width / height))
    },
    dispose: () => disposeTree(root),
  }
}

/** Draws a finished frame at its final size with the scene's post settings: contrast, saturation and a sharpening pass. */
function finishImage(canvas: HTMLCanvasElement, width: number, height: number, post: Scene3D['post']) {
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const g = out.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  const contrast = post?.contrast ?? 1, saturation = post?.saturation ?? 1
  if (contrast !== 1 || saturation !== 1) g.filter = `contrast(${contrast}) saturate(${saturation})`
  g.drawImage(canvas, 0, 0, width, height)
  g.filter = 'none'
  const k = Math.max(0, Math.min(1, post?.sharpen ?? 0)) * 0.6
  if (k > 0) {
    const src = g.getImageData(0, 0, width, height)
    const dst = g.createImageData(width, height)
    const d = src.data
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        const up = d[(Math.max(0, y - 1) * width + x) * 4 + c], dn = d[(Math.min(height - 1, y + 1) * width + x) * 4 + c]
        const lf = d[(y * width + Math.max(0, x - 1)) * 4 + c], rt = d[(y * width + Math.min(width - 1, x + 1)) * 4 + c]
        dst.data[i + c] = Math.max(0, Math.min(255, d[i + c] * (1 + 4 * k) - k * (up + dn + lf + rt)))
      }
      dst.data[i + 3] = d[i + 3]
    }
    g.putImageData(dst, 0, 0)
  }
  return out
}

/** Renders a scene to a PNG (base64, no data: prefix) at time t, optionally from a preset view instead of the scene camera. */
export async function renderScene(scene: Scene3D, w: number, h: number, view: SceneView | Scene3D['camera'] = 'camera', t = 0, max = 768, opts: RenderOpts = {}) {
  const { width, height } = fitSize(w, h, max)
  const ss = Math.max(1, Math.min(3, Math.round(opts.supersample ?? 1)))
  // Supersampling stays within what a canvas can hold.
  const f = Math.min(ss, 8192 / Math.max(width, height))
  const r = await sceneRenderer(scene, Math.round(width * f), Math.round(height * f), view, opts)
  r.frame(t)
  const needsFinish = f !== 1 || !!scene.post?.contrast || !!scene.post?.saturation || !!scene.post?.sharpen
  const url = (needsFinish ? finishImage(r.canvas, width, height, scene.post) : r.canvas).toDataURL('image/png')
  r.dispose()
  return url.slice(url.indexOf(',') + 1)
}

/** One contact sheet of the scene from several angles at time t, each labelled, so a single look checks every side. */
export async function renderViews(scene: Scene3D, w: number, h: number, views: (SceneView | { label: string; camera: Scene3D['camera'] })[], t = 0, opts: RenderOpts = {}) {
  const cols = Math.min(views.length, 3)
  const rows = Math.ceil(views.length / cols)
  const cell = fitSize(w, h, 420)
  const sheet = document.createElement('canvas')
  sheet.width = cell.width * cols
  sheet.height = cell.height * rows
  const g = sheet.getContext('2d')!
  g.font = '600 16px system-ui, sans-serif'
  for (const [i, entry] of views.entries()) {
    const view = typeof entry === 'string' ? entry : entry.camera
    const name = typeof entry === 'string' ? entry : entry.label
    const r = await sceneRenderer(scene, cell.width, cell.height, view, opts)
    r.frame(t)
    const x = (i % cols) * cell.width, y = Math.floor(i / cols) * cell.height
    g.drawImage(r.canvas, x, y)
    g.strokeStyle = '#0003'
    g.strokeRect(x, y, cell.width, cell.height)
    g.fillStyle = '#000a'
    g.fillRect(x + 6, y + 6, 12 + g.measureText(name).width, 24)
    g.fillStyle = '#fff'
    g.fillText(name, x + 12, y + 24)
    r.dispose()
  }
  const url = sheet.toDataURL('image/png')
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

/** WebCodecs path: renders each frame, copies it to a 2D canvas and encodes it straight into an mp4, no real-time waiting. */
async function encodeScene(scene: Scene3D, width: number, height: number, duration: number, fps: number, codec: VideoCodec, opts: RecordOpts) {
  const r = await sceneRenderer(scene, width, height, opts.view)
  // Encoding reads from a 2D canvas copy, so the shared WebGL canvas can be resized by other renders meanwhile.
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const g = out.getContext('2d')!
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const source = new CanvasSource(out, { codec, bitrate: 8_000_000, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: fps })
  const frames = Math.max(1, Math.round(duration * fps))
  try {
    await output.start()
    for (let i = 0; i < frames; i++) {
      r.frame(i / fps)
      g.drawImage(r.canvas, 0, 0, width, height)
      // Awaiting respects encoder backpressure, so memory stays flat on long clips.
      await source.add(i / fps, 1 / fps)
      opts.onProgress?.((i + 1) / frames)
    }
    await output.finalize()
  } catch (e) {
    if (output.state !== 'finalized') await output.cancel().catch(() => {})
    throw e
  } finally {
    r.dispose()
  }
  return { blob: new Blob([target.buffer!], { type: 'video/mp4' }), ext: 'mp4', width, height, duration, fps }
}

function videoMime() {
  // avc3 keeps codec settings in-band, so a changing resolution does not break the mp4; avc1 is the fallback.
  const types = ['video/mp4;codecs=avc3', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
}

type RecordOpts = { duration?: number; fps?: number; view?: SceneView; max?: number; onProgress?: (f: number) => void }

/**
 * Records the scene timeline to a video. With WebCodecs, frames are stamped by timeline time and encoded as fast as
 * the GPU and encoder allow; otherwise it falls back to MediaRecorder, which takes about as long as the clip.
 */
export async function recordScene(scene: Scene3D, w: number, h: number, opts: RecordOpts = {}) {
  const duration = Math.min(120, opts.duration ?? sceneDuration(scene))
  const fps = Math.min(60, Math.max(10, opts.fps ?? 30))
  const { width, height } = fitSize(w, h, opts.max ?? 1280)
  if (typeof VideoEncoder !== 'undefined') {
    const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width, height, bitrate: 8_000_000 })
    if (codec) return encodeScene(scene, width, height, duration, fps, codec, opts)
  }
  const mime = videoMime()
  if (!mime) throw new Error('This browser cannot record video (no WebCodecs or MediaRecorder).')
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
    for (const mat of [m.material].flat()) {
      if (!mat) continue
      disposeTextures(mat)
      mat.dispose()
    }
  })
}
