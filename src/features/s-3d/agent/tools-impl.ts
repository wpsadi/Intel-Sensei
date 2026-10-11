import { z } from 'zod'
import { toast } from 'sonner'
import { useS3D } from '../store'
import { uid } from '../db'
import { FRAME_PRESETS, absRect, childrenOf, solid, stroke } from '../model'
import * as THREE from 'three'
import { DEFAULT_MATERIAL, GEOMETRY_PARAMS, MATERIAL_PRESETS, sceneOf, measureScene, emptyScene, fitCamera, makeCamera, objectBounds, recordScene, renderScene, renderTimeline, sceneDuration } from '../render/scene3d'
import { DEFAULT_LOOK, animateCharacter, buildCharacter } from './character'
import { downloadBlob, storeFile } from '../files'
import { type DiscoverItem, OWNING_UNITS, searchModels } from '../discover/smithsonian'
import { importRemoteModel } from '../io'
import { askUser } from './ask-user'
import type { Effect, Fill, Geometry3D, Keyframe3D, Material3D, NodeType, Obj3D, SNode, Scene3D, Vec3 } from '../types'

const s = () => useS3D.getState()

/* ---------- schemas ---------- */

const NODE_TYPES = ['frame', 'section', 'group', 'rect', 'ellipse', 'polygon', 'star', 'vector', 'text', 'shape3d'] as const

const fillSpec = z.union([
  z.string().describe('Hex color, e.g. "#1e293b"'),
  z.object({ kind: z.enum(['linear', 'radial']), angle: z.number().optional(), stops: z.array(z.object({ offset: z.number(), color: z.string() })) }),
])

const propsShape = {
  name: z.string().optional(),
  x: z.number().optional().describe('Relative to parent'),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  fill: fillSpec.optional().describe('Single fill; use "none" to remove'),
  fills: z.array(fillSpec).optional(),
  radius: z.union([z.number(), z.array(z.number()).length(4)]).optional(),
  stroke: z.object({ color: z.string(), width: z.number().optional() }).optional(),
  shadow: z.object({ x: z.number().optional(), y: z.number().optional(), blur: z.number().optional(), color: z.string().optional() }).optional(),
  blur: z.number().optional().describe('Background blur (glass) radius'),
  text: z.string().optional().describe('Text content (text nodes)'),
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().optional(),
  autoLayout: z.object({
    direction: z.enum(['horizontal', 'vertical']),
    gap: z.number().optional(),
    padding: z.number().optional(),
    align: z.enum(['start', 'center', 'end']).optional(),
    justify: z.enum(['start', 'center', 'end', 'space-between']).optional(),
  }).nullable().optional(),
  sizing: z.object({ h: z.enum(['fixed', 'hug', 'fill']).optional(), v: z.enum(['fixed', 'hug', 'fill']).optional() }).optional(),
  sides: z.number().optional(),
  path: z.string().optional().describe('Vector SVG path in local coords'),
  shape3d: z.enum(['cube', 'sphere', 'torus', 'cylinder', 'cone', 'torusKnot']).optional(),
  modelColor: z.string().optional(),
}
const propsSchema = z.object(propsShape)
type Props = z.infer<typeof propsSchema>

export type NodeSpec = Props & { type: (typeof NODE_TYPES)[number]; children?: NodeSpec[] }
const nodeSpec: z.ZodType<NodeSpec> = z.lazy(() =>
  z.object({ type: z.enum(NODE_TYPES), ...propsShape, children: z.array(nodeSpec).optional() }),
) as z.ZodType<NodeSpec>

/* ---------- 3D schemas ---------- */

const GEOMETRIES = Object.keys(GEOMETRY_PARAMS) as [Geometry3D, ...Geometry3D[]]
const vec3 = z.array(z.number()).length(3)


const materialSpec = z.object({
  preset: z.enum(Object.keys(MATERIAL_PRESETS) as [string, ...string[]]).optional(),
  color: z.string().optional(),
  metalness: z.number().optional().describe('0..1'),
  roughness: z.number().optional().describe('0 mirror .. 1 matte'),
  emissive: z.string().optional().describe('Glow colour'),
  emissiveIntensity: z.number().optional(),
  opacity: z.number().optional(),
  transmission: z.number().optional().describe('0..1 glass see-through'),
  clearcoat: z.number().optional(),
  wireframe: z.boolean().optional(),
  flatShading: z.boolean().optional().describe('Faceted low-poly look'),
})

const paramsSpec = z.object({
  width: z.number().optional(), height: z.number().optional(), depth: z.number().optional(),
  radius: z.number().optional(), radiusTop: z.number().optional(), radiusBottom: z.number().optional(), length: z.number().optional(),
  tube: z.number().optional(), arc: z.number().optional().describe('Torus arc in degrees'), p: z.number().optional(), q: z.number().optional(),
  innerRadius: z.number().optional(), outerRadius: z.number().optional(), detail: z.number().optional(), segments: z.number().optional(),
  bevel: z.number().optional(),
  points: z.array(z.array(z.number()).length(2)).optional().describe('lathe: [radius, y] profile revolved around Y (vases, bottles, cups). extrude: [x, y] outline extruded along Z by depth'),
}).describe(`Geometry dimensions in scene units. Keys per geometry: ${Object.entries(GEOMETRY_PARAMS).map(([g, p]) => `${g}(${Object.keys(p).join(',')}${g === 'lathe' || g === 'extrude' ? ',points' : ''})`).join('; ')}`)

const lightSpec = z.object({
  type: z.enum(['ambient', 'hemisphere', 'directional', 'point', 'spot']),
  color: z.string().optional(),
  intensity: z.number().optional(),
  groundColor: z.string().optional(),
  angle: z.number().optional().describe('Spot cone angle in degrees'),
  castShadow: z.boolean().optional(),
})

const objProps = {
  name: z.string().optional(),
  geometry: z.enum(GEOMETRIES).optional(),
  params: paramsSpec.optional(),
  position: vec3.optional().describe('[x, y, z]; y is up, 1 unit ≈ 1 m. Omit y on a top-level object to rest it on the ground'),
  rotation: vec3.optional().describe('Degrees around x, y, z'),
  scale: vec3.optional(),
  color: z.string().optional().describe('Shortcut for material.color'),
  material: materialSpec.optional(),
  light: lightSpec.optional(),
  src: z.string().optional().describe('model: s3d-file ref or URL of a GLB/GLTF (normalized to fit a 1-unit cube on the ground; use scale to size it)'),
  castShadow: z.boolean().optional(),
  visible: z.boolean().optional(),
  animate: z.object({ kind: z.enum(['spin', 'float', 'pulse', 'orbit']), speed: z.number().optional().describe('Radians per second for spin'), axis: z.enum(['x', 'y', 'z']).optional().describe('Spin axis in the object\'s own frame (default y). Windmill/fan blades facing +z spin around z') }).nullable().optional().describe('Looping motion; null removes it'),
}

export type ObjSpec = { id?: string; kind?: Obj3D['kind']; children?: ObjSpec[] } & { [K in keyof typeof objProps]?: z.infer<(typeof objProps)[K]> }
const objSpec: z.ZodType<ObjSpec> = z.lazy(() =>
  z.object({
    id: z.string().optional().describe('Optional readable id, unique in the scene (e.g. "table-top"); generated if omitted'),
    kind: z.enum(['mesh', 'group', 'light', 'model']).optional().describe('Default mesh'),
    ...objProps,
    children: z.array(objSpec).optional().describe('For groups: children move/rotate/scale with the group; positions are relative to it'),
  }),
) as z.ZodType<ObjSpec>

const cameraSpec = z.object({ position: vec3.optional(), target: vec3.optional(), fov: z.number().optional() })
const sceneSettings = {
  background: z.string().nullable().optional().describe('Hex colour; null = transparent over the canvas'),
  environment: z.enum(['studio', 'none']).optional().describe('studio = soft reflections and fill light (default)'),
  ground: z.object({ visible: z.boolean().optional(), color: z.string().optional(), y: z.number().optional() }).optional(),
  shadows: z.boolean().optional(),
}
const VIEWS = ['iso', 'front', 'side', 'top'] as const

const keyframeSpec = z.object({
  t: z.number().describe('Seconds'),
  position: vec3.optional(), rotation: vec3.optional().describe('Degrees'), scale: vec3.optional(), visible: z.boolean().optional(),
  ease: z.enum(['linear', 'ease-in-out']).optional(),
})
const xz = z.array(z.number()).length(2).describe('[x, z] on the ground')
const actionSpec = z.discriminatedUnion('type', [
  z.object({ type: z.literal('walk'), to: xz, speed: z.number().optional().describe('m/s, default 1.3') }),
  z.object({ type: z.literal('run'), to: xz, speed: z.number().optional() }),
  z.object({ type: z.literal('turn'), facing: z.number().optional().describe('Yaw degrees; 0 faces +z, 90 faces +x'), toward: xz.optional(), duration: z.number().optional() }),
  z.object({ type: z.literal('sit'), seatHeight: z.number().describe('Height of the seat top (sofa cushion ~0.45, chair ~0.46, table top ~0.75)'), at: xz.optional().describe('Seat centre the pelvis ends over; the character turns its back to it'), facing: z.number().optional(), duration: z.number().optional() }),
  z.object({ type: z.literal('stand'), to: xz.optional().describe('Walk here after standing'), duration: z.number().optional() }),
  z.object({ type: z.literal('idle'), duration: z.number() }),
  z.object({ type: z.literal('wave'), duration: z.number().optional(), side: z.enum(['l', 'r']).optional() }),
  z.object({ type: z.literal('jump'), height: z.number().optional(), duration: z.number().optional() }),
])
const viewSpec = z.enum(['camera', ...VIEWS]).optional().describe('camera (default) = the scene camera, following its camera path')

export const schemas = {
  get_document: z.object({}),
  verify_design: z.object({ ids: z.array(z.string()).optional().describe('Screens or nodes to check; omit to check the whole page') }),
  create_nodes: z.object({ parentId: z.string().optional().describe('Parent frame id; omit for page'), nodes: z.array(nodeSpec) }),
  update_nodes: z.object({ updates: z.array(z.object({ id: z.string(), ...propsShape })) }),
  delete_nodes: z.object({ ids: z.array(z.string()) }),
  create_screen: z.object({
    name: z.string(),
    preset: z.string().optional().describe(`One of: ${FRAME_PRESETS.flatMap((g) => g.items.map((i) => i.name)).join(', ')}`),
    w: z.number().optional(),
    h: z.number().optional(),
    fill: fillSpec.optional(),
    autoLayout: propsShape.autoLayout,
    children: z.array(nodeSpec).optional(),
  }),
  create_page: z.object({ name: z.string() }),
  select_nodes: z.object({ ids: z.array(z.string()) }),
  set_page: z.object({ id: z.string() }),
  list_pages: z.object({}),

  create_scene: z.object({
    name: z.string(),
    parentId: z.string().optional().describe('Frame to place the scene viewport in; omit for the page'),
    x: z.number().optional(), y: z.number().optional(),
    w: z.number().optional().describe('Viewport width in px (default 800)'),
    h: z.number().optional().describe('Viewport height in px (default 600)'),
    ...sceneSettings,
    camera: cameraSpec.optional().describe('Omit to frame everything automatically'),
    objects: z.array(objSpec),
  }),
  add_objects: z.object({ sceneId: z.string(), parent: z.string().optional().describe('Group object id to add into'), objects: z.array(objSpec) }),
  update_objects: z.object({ sceneId: z.string(), updates: z.array(z.object({ id: z.string(), parent: z.string().nullable().optional().describe('Move into a group (null = scene root)'), ...objProps })) }),
  delete_objects: z.object({ sceneId: z.string(), ids: z.array(z.string()).describe('Groups take their children with them') }),
  set_scene: z.object({
    sceneId: z.string(),
    ...sceneSettings,
    camera: cameraSpec.optional(),
    frame: z.enum(VIEWS).optional().describe('Re-aim the camera to frame every object from this view'),
  }),
  get_scene: z.object({ sceneId: z.string() }),
  render_scene: z.object({ sceneId: z.string(), view: z.enum(['camera', ...VIEWS]).optional().describe('camera (default) = what the user sees'), time: z.number().optional().describe('Timeline seconds, default 0') }),

  add_character: z.object({
    sceneId: z.string(),
    id: z.string().optional().describe('Readable id, e.g. "man"; part ids are prefixed with it'),
    name: z.string().optional(),
    position: xz.optional(),
    facing: z.number().optional().describe('Yaw degrees; 0 faces +z (toward the default camera)'),
    height: z.number().optional().describe('Metres, default 1.75'),
    build: z.enum(['male', 'female']).optional(),
    skin: z.string().optional(), shirt: z.string().optional(), pants: z.string().optional(), shoes: z.string().optional(), hair: z.string().optional(),
  }),
  animate_character: z.object({
    sceneId: z.string(),
    characterId: z.string(),
    actions: z.array(actionSpec).describe('Performed in order'),
    start: z.number().optional().describe('Start time in seconds; default continues after the character\'s last action'),
    reset: z.boolean().optional().describe('Clear the character\'s existing motion first'),
  }),
  set_keyframes: z.object({
    sceneId: z.string(),
    tracks: z.array(z.object({ id: z.string().describe('Object id'), keyframes: z.array(keyframeSpec), append: z.boolean().optional().describe('Keep existing keys (default replaces them)') })).optional(),
    camera: z.array(z.object({ t: z.number(), position: vec3, target: vec3, fov: z.number().optional() })).optional().describe('Camera path; [] removes it'),
    duration: z.number().optional().describe('Timeline length in seconds'),
  }),
  render_timeline: z.object({ sceneId: z.string(), times: z.array(z.number()).max(9).optional().describe('Seconds to show; default 6 evenly spaced'), view: viewSpec }),
  capture_image: z.object({
    sceneId: z.string(), time: z.number().optional().describe('Timeline seconds, default 0'), view: viewSpec,
    width: z.number().optional().describe('Pixels, default the scene size, max 4096'), height: z.number().optional(),
    download: z.boolean().optional().describe('Also save to the user\'s downloads'),
  }),
  record_video: z.object({
    sceneId: z.string(), duration: z.number().optional().describe('Seconds, default the timeline length (max 120)'),
    fps: z.number().optional().describe('Default 30'), view: viewSpec,
    width: z.number().optional().describe('Pixels, default the scene size up to 1280'), height: z.number().optional(),
    download: z.boolean().optional(),
  }),

  search_3d_models: z.object({
    query: z.string().describe('Short subject keywords, e.g. "triceratops", "space shuttle", "mask"'),
    collection: z.enum(Object.keys(OWNING_UNITS) as [string, ...string[]]).optional().describe(`Optional Smithsonian unit: ${Object.entries(OWNING_UNITS).map(([k, v]) => `${k}=${v}`).join(', ')}`),
    limit: z.number().optional().describe('Max results (default 12)'),
  }),
  ask_user: z.object({
    question: z.string().describe('What you want the user to decide, in one friendly sentence'),
    options: z.array(z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().optional(),
      image: z.string().optional().describe('Image URL, e.g. a model thumb from search_3d_models'),
    })).min(1),
    multiple: z.boolean().optional().describe('Let the user pick several'),
  }),
  import_3d_model: z.object({
    modelId: z.string().describe('id from search_3d_models'),
    sceneId: z.string().optional().describe('Add into this scene; omit to create a new scene'),
  }),
}

/* ---------- implementation ---------- */

function toFill(f: z.infer<typeof fillSpec>): Fill {
  if (typeof f === 'string') return solid(f)
  return { id: uid(), kind: f.kind, angle: f.angle ?? 180, stops: f.stops, opacity: 1, visible: true }
}

function toPatch(p: Props, base?: SNode): Partial<SNode> {
  const out: Partial<SNode> = {}
  for (const k of ['name', 'x', 'y', 'w', 'h', 'rotation', 'opacity', 'visible', 'sides', 'path', 'shape3d', 'modelColor'] as const) {
    if (p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k]
  }
  if (p.fills) out.fills = p.fills.map(toFill)
  if (p.fill !== undefined) out.fills = p.fill === 'none' ? [] : [toFill(p.fill)]
  if (p.radius !== undefined) out.radius = (typeof p.radius === 'number' ? [p.radius, p.radius, p.radius, p.radius] : p.radius) as SNode['radius']
  if (p.stroke) out.strokes = [stroke(p.stroke.color, p.stroke.width ?? 1)]
  const effects: Effect[] = []
  if (p.shadow) effects.push({ id: uid(), kind: 'drop-shadow', x: p.shadow.x ?? 0, y: p.shadow.y ?? 4, blur: p.shadow.blur ?? 16, spread: 0, color: p.shadow.color ?? 'rgba(0,0,0,0.15)', visible: true })
  if (p.blur) effects.push({ id: uid(), kind: 'glass', blur: p.blur, tint: '#ffffff', visible: true })
  if (effects.length) out.effects = effects
  if (p.autoLayout !== undefined) {
    const a = p.autoLayout
    out.autoLayout = a && { direction: a.direction, gap: a.gap ?? 12, padding: Array(4).fill(a.padding ?? 0) as [number, number, number, number], align: a.align ?? 'start', justify: a.justify ?? 'start', wrap: false }
  }
  if (p.sizing) out.sizing = { h: p.sizing.h ?? base?.sizing.h ?? 'fixed', v: p.sizing.v ?? base?.sizing.v ?? 'fixed' }
  if (base?.text || p.text !== undefined || p.fontSize || p.fontWeight) {
    const t = base?.text
    if (t || p.text !== undefined) {
      out.text = {
        ...(t ?? { content: '', fontFamily: 'Inter Variable', fontSize: 16, fontWeight: 400, italic: false, underline: false, strike: false, lineHeight: 1.3, letterSpacing: 0, align: 'left', verticalAlign: 'top', transform: 'none', autoSize: 'width' }),
        ...(p.text !== undefined && { content: p.text }),
        ...(p.fontSize && { fontSize: p.fontSize }),
        ...(p.fontWeight && { fontWeight: p.fontWeight }),
        ...(p.textAlign && { align: p.textAlign }),
        ...(p.lineHeight && { lineHeight: p.lineHeight }),
      }
    }
  }
  return out
}

/** Every node created during the current run, for zoom-to-fit afterwards. */
export const createdIds: string[] = []
/** Existing nodes the agent changed this reply; with `createdIds` they decide which screens get reviewed. */
export const touchedIds: string[] = []

/** The top-level screens holding these nodes, so a review checks whole screens and not unrelated work on the page. */
export function screensOf(ids: string[]) {
  const { doc } = s()
  const roots = new Set<string>()
  for (const id of ids) {
    let n = doc.nodes[id]
    while (n && doc.nodes[n.parentId]) n = doc.nodes[n.parentId]
    if (n) roots.add(n.id)
  }
  return [...roots]
}

function createTree(specs: NodeSpec[], parentId: string): string[] {
  return specs.map((spec) => {
    const { type, children, ...props } = spec
    const base = s().addNode(type as NodeType, {}, parentId)
    const patch = toPatch(props, base)
    if (type === 'text' && props.w && !patch.text) patch.text = { ...base.text!, autoSize: 'height' }
    if (type === 'text' && patch.text && props.w) patch.text.autoSize = 'height'
    s().updateNodes([base.id], patch)
    createdIds.push(base.id)
    if (children?.length) createTree(children, base.id)
    return base.id
  })
}

function summarize(n: SNode): Record<string, unknown> {
  const fill = n.fills.find((f) => f.visible)
  return {
    id: n.id, type: n.type, name: n.name, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
    ...(fill && { fill: fill.kind === 'solid' ? fill.color : fill.kind }),
    ...(n.text && { text: n.text.content.slice(0, 200), fontSize: n.text.fontSize }),
    ...(n.autoLayout && { autoLayout: n.autoLayout.direction }),
    ...(n.type === 'shape3d' && { scene: n.scene ? `${n.scene.objects.length} objects (get_scene for details)` : `single ${n.shape3d}` }),
    ...(!n.visible && { visible: false }),
    ...(n.children.length && { children: n.children.map((c) => s().doc.nodes[c]).filter(Boolean).map(summarize) }),
  }
}

const parentOk = (id?: string) => {
  if (!id) return s().pageId
  if (!s().doc.nodes[id]) throw new Error(`No node with id ${id}`)
  return id
}

interface Issue { id: string; name: string; problem: string; sceneId?: string }

/** Layout problems a person would spot at a glance: things spilling out of their frame, zero sizes, empty text, text on text. */
function findIssues(n: SNode, issues: Issue[]) {
  const kids = n.children.map((c) => s().doc.nodes[c]).filter((k): k is SNode => !!k && k.visible)
  for (const k of kids) {
    if (k.w < 1 || k.h < 1) issues.push({ id: k.id, name: k.name, problem: `has no size (${Math.round(k.w)}×${Math.round(k.h)})` })
    if (k.type === 'text' && !k.text?.content.trim()) issues.push({ id: k.id, name: k.name, problem: 'is an empty text layer' })
    if (n.type === 'frame' && (k.x < -1 || k.y < -1 || k.x + k.w > n.w + 1 || k.y + k.h > n.h + 1)) {
      issues.push({ id: k.id, name: k.name, problem: `spills out of "${n.name}" (${Math.round(k.x)},${Math.round(k.y)} ${Math.round(k.w)}×${Math.round(k.h)} inside ${Math.round(n.w)}×${Math.round(n.h)})` })
    }
  }
  // Auto-layout places children itself, so only free-placed text can land on other text.
  if (!n.autoLayout) {
    const texts = kids.filter((k) => k.type === 'text')
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i], b = texts[j]
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) issues.push({ id: b.id, name: b.name, problem: `overlaps text "${a.name}"` })
      }
  }
  for (const k of kids) findIssues(k, issues)
}

/* ---------- 3D implementation ---------- */

const round = (v: number) => Math.round(v * 1000) / 1000
const rv = (v: THREE.Vector3): Vec3 => [round(v.x), round(v.y), round(v.z)]

function sceneNode(id: string) {
  const n = s().doc.nodes[id]
  if (!n || (n.type !== 'shape3d' && n.type !== 'model3d')) throw new Error(`No 3D scene with id ${id}`)
  return sceneOf(n)
}

function saveScene(id: string, scene: Scene3D) {
  s().updateNodes([id], { scene, type: 'shape3d' })
  touchedIds.push(id)
}

function toMaterial(p: ObjSpec, base?: Material3D): Material3D | undefined {
  if (!p.material && !p.color && base) return base
  const { preset, ...rest } = p.material ?? {}
  const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  return { ...DEFAULT_MATERIAL, ...base, ...(preset && MATERIAL_PRESETS[preset]), ...defined, ...(p.color && { color: p.color }) }
}

function applyObj(o: Obj3D, p: ObjSpec) {
  if (p.name !== undefined) o.name = p.name
  if (p.geometry) o.geometry = p.geometry
  if (p.params) o.params = { ...o.params, ...Object.fromEntries(Object.entries(p.params).filter(([, v]) => v !== undefined)) } as Obj3D['params']
  if (p.position) o.position = p.position as Vec3
  if (p.rotation) o.rotation = p.rotation as Vec3
  if (p.scale) o.scale = p.scale as Vec3
  if (p.visible !== undefined) o.visible = p.visible
  if (p.castShadow !== undefined) o.castShadow = p.castShadow
  if (p.src !== undefined) o.src = p.src
  if (p.animate !== undefined) o.animate = p.animate ? { kind: p.animate.kind, speed: p.animate.speed ?? 1 } : undefined
  if (o.kind === 'mesh') o.material = toMaterial(p, o.material)
  if (o.kind === 'light' && (p.light || p.color)) {
    const l = { ...(o.light ?? { type: 'point', color: '#ffffff', intensity: 1, castShadow: false }), ...p.light }
    o.light = { ...l, color: p.color ?? l.color ?? '#ffffff', intensity: l.intensity ?? 1, castShadow: l.castShadow ?? (l.type !== 'ambient' && l.type !== 'hemisphere') }
  }
}

/** Adds a spec tree to the scene. Returns the created ids and the top-level ones that should drop onto the ground. */
function addSpecs(scene: Scene3D, specs: ObjSpec[], parent: string | null, out: { ids: Record<string, string>; ground: string[] }) {
  for (const spec of specs) {
    const kind = spec.kind ?? (spec.light ? 'light' : spec.children?.length ? 'group' : spec.src ? 'model' : 'mesh')
    let id = spec.id?.trim() || `${kind}-${uid().slice(0, 6)}`
    while (scene.objects.some((o) => o.id === id)) id = `${id}-${uid().slice(0, 3)}`
    const o: Obj3D = { id, name: spec.name ?? spec.id ?? spec.geometry ?? kind, kind, parent, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true }
    if (kind === 'mesh') o.geometry = 'box'
    if (kind === 'light') o.light = { type: 'point', color: '#ffffff', intensity: 1, castShadow: false }
    applyObj(o, spec)
    scene.objects.push(o)
    out.ids[o.name] = id
    if (!parent && kind !== 'light' && spec.position?.[1] === undefined) out.ground.push(id)
    if (spec.children?.length) addSpecs(scene, spec.children, id, out)
  }
}

/** Lifts or lowers objects so their lowest point touches the ground. */
async function dropToGround(scene: Scene3D, ids: string[]) {
  if (!ids.length) return
  const bounds = await measureScene(scene, objectBounds)
  for (const id of ids) {
    const o = scene.objects.find((x) => x.id === id)
    const b = bounds.get(id)
    if (o && b) o.position = [o.position[0], round(o.position[1] + scene.ground.y - b.min.y), o.position[2]]
  }
}

const descendantsOf = (scene: Scene3D, ids: string[]) => {
  const out = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const o of scene.objects) if (o.parent && out.has(o.parent) && !out.has(o.id)) { out.add(o.id); grew = true }
  }
  return out
}

function applySettings(scene: Scene3D, p: Partial<Pick<z.infer<typeof schemas.set_scene>, 'background' | 'environment' | 'ground' | 'shadows' | 'camera'>>) {
  if (p.background !== undefined) scene.background = p.background
  if (p.environment) scene.environment = p.environment
  if (p.shadows !== undefined) scene.shadows = p.shadows
  if (p.ground) scene.ground = { ...scene.ground, ...Object.fromEntries(Object.entries(p.ground).filter(([, v]) => v !== undefined)) }
  if (p.camera) scene.camera = { ...scene.camera, ...Object.fromEntries(Object.entries(p.camera).filter(([, v]) => v !== undefined)) } as Scene3D['camera']
}

const hasLight = (scene: Scene3D) => scene.environment === 'studio' || scene.objects.some((o) => o.kind === 'light' && o.visible)

/** Problems that make a 3D scene look broken; `warnings` are things that may be deliberate. */
async function sceneIssues(n: SNode, issues: Issue[], warnings: Issue[]) {
  const scene = n.scene
  if (!scene) return
  const at = (o: Obj3D, problem: string) => ({ id: o.id, name: o.name, sceneId: n.id, problem })
  if (!scene.objects.some((o) => o.kind !== 'light')) issues.push({ id: n.id, name: n.name, problem: 'is an empty 3D scene' })
  if (!hasLight(scene)) issues.push({ id: n.id, name: n.name, problem: 'has no lights and no environment, so it renders black' })
  const bounds = await measureScene(scene, objectBounds)
  const cam = makeCamera(scene, n.w / Math.max(n.h, 1))
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
  const camPos = new THREE.Vector3(...scene.camera.position)
  const visible = scene.objects.filter((o) => o.kind !== 'light' && o.visible)
  for (const o of visible) {
    const b = bounds.get(o.id)
    if (o.kind === 'group') {
      if (!scene.objects.some((c) => c.parent === o.id)) warnings.push(at(o, 'is an empty group'))
      continue
    }
    if (!b || o.scale.some((v) => Math.abs(v) < 1e-4)) { issues.push(at(o, 'has no size (check params and scale)')); continue }
    if (b.containsPoint(camPos)) issues.push(at(o, 'surrounds the camera, so it blocks the view'))
    if (scene.ground.visible && b.min.y < scene.ground.y - 0.02 && o.geometry !== 'plane' && o.geometry !== 'circle') issues.push(at(o, `sinks ${round(scene.ground.y - b.min.y)} below the ground (lowest point y=${round(b.min.y)})`))
  }
  // Framing and floating are judged on whole top-level objects, so parts of a group are not reported one by one.
  const tops = visible.filter((o) => !o.parent)
  const topBox = (o: Obj3D) => {
    const box = new THREE.Box3()
    for (const id of descendantsOf(scene, [o.id])) { const b = bounds.get(id); if (b) box.union(b) }
    return box
  }
  for (const o of tops) {
    const b = topBox(o)
    if (b.isEmpty()) continue
    if (!frustum.intersectsBox(b)) issues.push(at(o, 'is outside the camera view (use set_scene frame, or move it)'))
    else {
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z))
      if (!corners.every((c) => frustum.containsPoint(c))) warnings.push(at(o, 'is partly cut off by the frame'))
    }
    if (scene.ground.visible && !o.animate && !o.keyframes?.length && b.min.y > scene.ground.y + 0.05) {
      const near = b.clone().expandByScalar(0.03)
      if (!tops.some((x) => x !== o && near.intersectsBox(topBox(x)))) warnings.push(at(o, `floats ${round(b.min.y - scene.ground.y)} above the ground touching nothing`))
    }
  }
}

/** Stores a rendered image or video and places it on the canvas right of its scene. Returns the new node id. */
async function placeOutput(sceneId: string, blob: Blob, name: string, type: 'image' | 'video') {
  const scene = s().doc.nodes[sceneId]
  const src = await storeFile(blob, name, s().doc.id)
  const w = Math.min(scene.w, 800), h = Math.round((w * scene.h) / scene.w)
  const taken = Object.values(s().doc.nodes).filter((x) => x.parentId === scene.parentId && x.x >= scene.x + scene.w && x.y < scene.y + h && x.y + x.h > scene.y)
  const x = Math.max(scene.x + scene.w, ...taken.map((t) => t.x + t.w)) + 40
  const node = s().addNode(type, { name, src, x, y: scene.y, w, h }, scene.parentId)
  createdIds.push(node.id)
  return node.id
}

/** Search results by id, so imports use the real download URL rather than one the model retyped. */
const found = new Map<string, DiscoverItem>()

export const impl = {
  get_document() {
    const { doc, pageId, selection } = s()
    const page = doc.pages.find((p) => p.id === pageId)!
    return { page: page.name, pageId, selection, nodes: page.children.map((c) => doc.nodes[c]).filter(Boolean).map(summarize) }
  },
  async verify_design({ ids }: z.infer<typeof schemas.verify_design>) {
    const { doc, pageId } = s()
    const roots = ids?.length ? ids.map((id) => doc.nodes[id]).filter((n): n is SNode => !!n) : doc.pages.find((p) => p.id === pageId)!.children.map((c) => doc.nodes[c]).filter((n): n is SNode => !!n)
    const issues: Issue[] = []
    const warnings: Issue[] = []
    for (const root of roots) {
      if (root.w < 1 || root.h < 1) issues.push({ id: root.id, name: root.name, problem: 'has no size' })
      findIssues(root, issues)
      const stack = [root]
      while (stack.length) {
        const n = stack.pop()!
        await sceneIssues(n, issues, warnings)
        stack.push(...n.children.map((c) => doc.nodes[c]).filter(Boolean))
      }
    }
    // A long list helps nobody; the first problems are enough to fix before checking again.
    return { ok: issues.length === 0, checked: roots.map((r) => r.name), issues: issues.slice(0, 20), more: Math.max(0, issues.length - 20), warnings: warnings.slice(0, 10) }
  },
  create_nodes({ parentId, nodes }: z.infer<typeof schemas.create_nodes>) {
    const ids = createTree(nodes, parentOk(parentId))
    return { created: ids }
  },
  update_nodes({ updates }: z.infer<typeof schemas.update_nodes>) {
    for (const { id, ...props } of updates) {
      const n = s().doc.nodes[id]
      if (!n) throw new Error(`No node with id ${id}`)
      s().updateNodes([id], toPatch(props, n))
      touchedIds.push(id)
    }
    return { updated: updates.map((u) => u.id) }
  },
  delete_nodes({ ids }: z.infer<typeof schemas.delete_nodes>) {
    s().deleteNodes(ids)
    return { deleted: ids }
  },
  create_screen({ name, preset, w, h, fill, autoLayout, children }: z.infer<typeof schemas.create_screen>) {
    const p = FRAME_PRESETS.flatMap((g) => g.items).find((i) => i.name.toLowerCase() === preset?.toLowerCase())
    const width = w ?? p?.w ?? 393
    const height = h ?? p?.h ?? 852
    const { doc, pageId } = s()
    const right = childrenOf(doc, pageId).filter((id) => doc.nodes[id]).map((id) => absRect(doc, id)).reduce((m, r) => Math.max(m, r.x + r.w + 80), 0)
    const frame = s().addNode('frame', { name, x: right, y: 0, w: width, h: height }, pageId)
    s().updateNodes([frame.id], toPatch({ fill: fill ?? '#ffffff', autoLayout }, frame))
    createdIds.push(frame.id)
    if (children?.length) createTree(children, frame.id)
    return { id: frame.id, x: right, w: width, h: height }
  },
  create_page({ name }: z.infer<typeof schemas.create_page>) {
    s().addPage()
    s().renamePage(s().pageId, name)
    return { id: s().pageId }
  },
  select_nodes({ ids }: z.infer<typeof schemas.select_nodes>) {
    s().select(ids.filter((id) => s().doc.nodes[id]))
    return { selected: s().selection }
  },
  set_page({ id }: z.infer<typeof schemas.set_page>) {
    if (!s().doc.pages.some((p) => p.id === id)) throw new Error(`No page ${id}`)
    s().setPage(id)
    return { pageId: id }
  },
  list_pages() {
    return s().doc.pages.map((p) => ({ id: p.id, name: p.name, current: p.id === s().pageId, nodes: p.children.length }))
  },

  async create_scene({ name, parentId, x, y, w = 800, h = 600, camera, objects, ...settings }: z.infer<typeof schemas.create_scene>) {
    const parent = parentOk(parentId)
    const { doc, pageId } = s()
    const right = parent === pageId ? childrenOf(doc, pageId).filter((id) => doc.nodes[id]).map((id) => absRect(doc, id)).reduce((m, r) => Math.max(m, r.x + r.w + 80), 0) : 0
    const scene = emptyScene()
    applySettings(scene, settings)
    const out = { ids: {} as Record<string, string>, ground: [] as string[] }
    addSpecs(scene, objects, null, out)
    // Without lights of its own the scene gets a soft key light so shapes read in 3D.
    if (!scene.objects.some((o) => o.kind === 'light')) {
      addSpecs(scene, [
        { id: 'key-light', kind: 'light', light: { type: 'directional', intensity: 2.2, castShadow: true }, position: [4, 7, 5] },
        { id: 'sky-light', kind: 'light', light: { type: 'hemisphere', intensity: 0.6, groundColor: '#94a3b8' }, position: [0, 5, 0] },
      ], null, { ids: {}, ground: [] })
    }
    await dropToGround(scene, out.ground)
    applySettings(scene, { camera })
    if (!camera?.position) scene.camera = await measureScene(scene, (r) => fitCamera(r, w / h, camera?.fov ?? 40))
    const node = s().addNode('shape3d', { name, x: x ?? right, y: y ?? 0, w, h, scene }, parent)
    createdIds.push(node.id)
    return { sceneId: node.id, objects: out.ids, camera: scene.camera }
  },
  async add_objects({ sceneId, parent, objects }: z.infer<typeof schemas.add_objects>) {
    const scene = structuredClone(sceneNode(sceneId))
    if (parent && !scene.objects.some((o) => o.id === parent && o.kind === 'group')) throw new Error(`No group ${parent} in this scene`)
    const out = { ids: {} as Record<string, string>, ground: [] as string[] }
    addSpecs(scene, objects, parent ?? null, out)
    await dropToGround(scene, out.ground)
    saveScene(sceneId, scene)
    return { added: out.ids }
  },
  async update_objects({ sceneId, updates }: z.infer<typeof schemas.update_objects>) {
    const scene = structuredClone(sceneNode(sceneId))
    for (const { id, parent, ...props } of updates) {
      const o = scene.objects.find((x) => x.id === id)
      if (!o) throw new Error(`No object ${id} in this scene`)
      if (parent !== undefined) {
        if (parent && descendantsOf(scene, [id]).has(parent)) throw new Error(`Cannot move ${id} into itself`)
        o.parent = parent
      }
      applyObj(o, props)
    }
    saveScene(sceneId, scene)
    return { updated: updates.map((u) => u.id) }
  },
  delete_objects({ sceneId, ids }: z.infer<typeof schemas.delete_objects>) {
    const scene = structuredClone(sceneNode(sceneId))
    const gone = descendantsOf(scene, ids)
    scene.objects = scene.objects.filter((o) => !gone.has(o.id))
    saveScene(sceneId, scene)
    return { deleted: [...gone] }
  },
  async set_scene({ sceneId, frame, camera, ...settings }: z.infer<typeof schemas.set_scene>) {
    const scene = structuredClone(sceneNode(sceneId))
    applySettings(scene, { ...settings, camera })
    if (frame) {
      const n = s().doc.nodes[sceneId]
      const dirs: Record<(typeof VIEWS)[number], Vec3> = { iso: [1, 0.75, 1.3], front: [0, 0.15, 1], side: [1, 0.15, 0], top: [0.001, 1, 0.001] }
      scene.camera = await measureScene(scene, (r) => fitCamera(r, n.w / Math.max(n.h, 1), scene.camera.fov, dirs[frame]))
    }
    saveScene(sceneId, scene)
    return { camera: scene.camera }
  },
  async get_scene({ sceneId }: z.infer<typeof schemas.get_scene>) {
    const scene = sceneNode(sceneId)
    const bounds = await measureScene(scene, objectBounds)
    const { objects, ...settings } = scene
    return {
      ...settings,
      duration: sceneDuration(scene),
      objects: objects.map((o) => {
        const b = bounds.get(o.id)
        return {
          id: o.id, name: o.name, kind: o.kind, ...(o.parent && { parent: o.parent }),
          ...(o.geometry && { geometry: o.geometry, params: o.params }), position: o.position,
          ...(o.rotation.some(Boolean) && { rotation: o.rotation }), ...(o.scale.some((v) => v !== 1) && { scale: o.scale }),
          ...(o.material && { color: o.material.color, metalness: o.material.metalness, roughness: o.material.roughness }),
          ...(o.light && { light: o.light }), ...(o.animate && { animate: o.animate }), ...(o.keyframes?.length && { keyframes: o.keyframes.length, keyframeSpan: [o.keyframes[0].t, o.keyframes.at(-1)!.t] }), ...(!o.visible && { visible: false }),
          ...(b && { worldMin: rv(b.min), worldMax: rv(b.max) }),
        }
      }),
    }
  },
  async search_3d_models({ query, collection, limit = 12 }: z.infer<typeof schemas.search_3d_models>) {
    const { items } = await searchModels({ q: query, unit: collection })
    for (const i of items) found.set(i.id, i)
    return { count: items.length, models: items.slice(0, limit).map((i) => ({ id: i.id, title: i.title, ...(i.thumb && { thumb: i.thumb }) })), source: 'Smithsonian Open Access (CC0)' }
  },
  async ask_user(req: z.infer<typeof schemas.ask_user>) {
    return askUser(req)
  },
  async import_3d_model({ modelId, sceneId }: z.infer<typeof schemas.import_3d_model>) {
    const item = found.get(modelId)
    if (!item) throw new Error(`Unknown model ${modelId}; call search_3d_models first`)
    const res = await importRemoteModel(item.glb, item.title, sceneId)
    if (res.sceneId) (sceneId ? touchedIds : createdIds).push(res.sceneId)
    return { ...res, title: item.title }
  },
  async render_scene({ sceneId, view, time }: z.infer<typeof schemas.render_scene>) {
    const n = s().doc.nodes[sceneId]
    const image = await renderScene(sceneNode(sceneId), n.w, n.h, view ?? 'camera', time ?? 0)
    return { image, mediaType: 'image/png' }
  },
  add_character({ sceneId, id, name, position, facing, ...look }: z.infer<typeof schemas.add_character>) {
    const scene = structuredClone(sceneNode(sceneId))
    let cid = id?.trim() || `person-${uid().slice(0, 4)}`
    while (scene.objects.some((o) => o.id === cid || o.id.startsWith(`${cid}-`))) cid = `${cid}-${uid().slice(0, 3)}`
    const defined = Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined))
    const parts = buildCharacter(cid, name ?? cid, { ...DEFAULT_LOOK, ...defined }, [position?.[0] ?? 0, scene.ground.y, position?.[1] ?? 0], facing ?? 0)
    scene.objects.push(...parts)
    saveScene(sceneId, scene)
    return { characterId: cid, parts: parts.length, joints: 'hips, spine, neck, shoulder-l/r, elbow-l/r, leg-l/r, knee-l/r (ids prefixed with the character id)' }
  },
  animate_character({ sceneId, characterId, actions, start, reset }: z.infer<typeof schemas.animate_character>) {
    const scene = structuredClone(sceneNode(sceneId))
    if (reset) for (const o of scene.objects) if (o.id === characterId || o.id.startsWith(`${characterId}-`)) delete o.keyframes
    const end = animateCharacter(scene, characterId, actions as never, start)
    scene.duration = Math.max(scene.duration ?? 0, end + 0.5)
    saveScene(sceneId, scene)
    const root = scene.objects.find((o) => o.id === characterId)!
    const last = root.keyframes!.at(-1)!
    return { ends: end, duration: scene.duration, finalPosition: last.position, finalFacing: last.rotation?.[1] }
  },
  set_keyframes({ sceneId, tracks, camera, duration }: z.infer<typeof schemas.set_keyframes>) {
    const scene = structuredClone(sceneNode(sceneId))
    for (const tr of tracks ?? []) {
      const o = scene.objects.find((x) => x.id === tr.id)
      if (!o) throw new Error(`No object ${tr.id} in this scene`)
      const keys = [...(tr.append ? o.keyframes ?? [] : []), ...(tr.keyframes as Keyframe3D[])].sort((a, b) => a.t - b.t)
      o.keyframes = keys.length ? keys : undefined
    }
    if (camera) scene.cameraKeys = camera.length ? [...camera].sort((a, b) => a.t - b.t) as Scene3D['cameraKeys'] : undefined
    if (duration !== undefined) scene.duration = duration || undefined
    saveScene(sceneId, scene)
    return { duration: sceneDuration(scene) }
  },
  async render_timeline({ sceneId, times, view }: z.infer<typeof schemas.render_timeline>) {
    const n = s().doc.nodes[sceneId]
    const scene = sceneNode(sceneId)
    const d = sceneDuration(scene)
    const at = times?.length ? times : Array.from({ length: 6 }, (_, i) => round((d * i) / 5))
    const image = await renderTimeline(scene, n.w, n.h, at, view ?? 'camera')
    return { image, mediaType: 'image/png' }
  },
  async capture_image({ sceneId, time, view, width, height, download }: z.infer<typeof schemas.capture_image>) {
    const n = s().doc.nodes[sceneId]
    const w = width ?? (height ? Math.round((height * n.w) / n.h) : n.w), h = height ?? Math.round((w * n.h) / n.w)
    const image = await renderScene(sceneNode(sceneId), w, h, view ?? 'camera', time ?? 0, 4096)
    const blob = await (await fetch(`data:image/png;base64,${image}`)).blob()
    const name = `${n.name} ${time ? `${time}s` : 'still'}.png`
    const nodeId = await placeOutput(sceneId, blob, name, 'image')
    if (download) downloadBlob(blob, name)
    return { image, mediaType: 'image/png', imageNodeId: nodeId }
  },
  async record_video({ sceneId, duration, fps, view, width, height, download }: z.infer<typeof schemas.record_video>) {
    const n = s().doc.nodes[sceneId]
    const w = width ?? (height ? Math.round((height * n.w) / n.h) : n.w), h = height ?? Math.round((w * n.h) / n.w)
    const toastId = toast.loading('Recording video…')
    try {
      const v = await recordScene(sceneNode(sceneId), w, h, { duration, fps, view: view ?? 'camera', max: 1920, onProgress: (f) => toast.loading(`Recording video… ${Math.round(f * 100)}%`, { id: toastId }) })
      const name = `${n.name}.${v.ext}`
      const nodeId = await placeOutput(sceneId, v.blob, name, 'video')
      if (download) downloadBlob(v.blob, name)
      toast.success('Video recorded', { id: toastId })
      return { videoNodeId: nodeId, seconds: v.duration, fps: v.fps, size: `${v.width}x${v.height}`, format: v.ext, bytes: v.blob.size }
    } catch (e) {
      toast.error('Recording failed', { id: toastId })
      throw e
    }
  },
}

export const DESCRIPTIONS: Record<keyof typeof impl, string> = {
  verify_design: 'Check scenes and screens for problems: 3D objects sinking into the ground, outside the camera, zero-size, unlit scenes; 2D children spilling out of frames, empty or overlapping text. Returns ok, issues to fix (3D issues carry sceneId + object id) and warnings that may be intentional.',
  create_scene: 'Create a 3D scene viewport and build its objects in one call (meshes, groups with children, lights, GLB models). Objects without a y position rest on the ground; the camera frames everything unless given. Returns the sceneId and object ids.',
  add_objects: 'Add objects (or a nested group) to an existing 3D scene.',
  update_objects: 'Change 3D objects by id: geometry, params, position, rotation, scale, material, light, animation, parent group.',
  delete_objects: 'Delete 3D objects (groups take their children).',
  set_scene: 'Change scene background, environment, ground, shadows or camera; frame re-aims the camera to show every object.',
  get_scene: 'Read a 3D scene: settings, camera and every object with its world-space bounds (worldMin/worldMax), to reason about placement and contact.',
  search_3d_models: 'Search the internet (Smithsonian open-access 3D collection) for real scanned 3D models. Returns ids, titles and thumbnail images.',
  ask_user: 'Open a large chooser in front of the user and WAIT for their decision. Use it to let them pick between search results (pass thumbs as images), design directions or variations. Returns { chosen: [option ids], message? } or { dismissed: true }.',
  import_3d_model: 'Download a model found with search_3d_models and add it to a scene (sceneId) or as a new scene.',
  render_scene: 'Render the scene to an image and look at it (optionally at a timeline time). Use it to judge proportions, composition, colour and lighting from the camera or a preset view.',
  add_character: 'Add a rigged person (head, hair, torso, arms, legs, shoes with joint pivots) standing at [x, z]. Set shirt/pants/skin/hair colours, height and build. Returns the characterId for animate_character.',
  animate_character: 'Make a character act over time: walk/run to a point, turn, sit on a seat of given height, stand up, idle, wave, jump. Actions play in order and chain after earlier ones; the timeline grows to fit.',
  set_keyframes: 'Keyframe any object over time (position, rotation degrees, scale, visible at t seconds) — doors opening, cars driving, things appearing — plus an optional camera path and the timeline duration. For endless rotation use update_objects animate spin instead.',
  render_timeline: 'Render several moments of the animation in one contact sheet image to check the motion (positions, poses, contact with seats, framing) before recording.',
  capture_image: 'Capture a still image of the scene at a time and view (any size up to 4096 px), save it as an image on the canvas beside the scene, optionally download it. Returns the image to look at.',
  record_video: 'Record the scene animation (looping motion, keyframes, characters, camera path) to a video file, placed as a video node beside the scene and optionally downloaded. Takes about as long as the clip to record.',
  get_document: 'Read the current page as a node tree (ids, types, names, positions relative to parent, sizes, fills, text) plus the selection.',
  create_nodes: 'Create nested nodes inside a parent (frame id) or on the page. Coordinates are relative to the parent. Children of auto-layout frames are positioned automatically.',
  update_nodes: 'Change properties of existing nodes by id.',
  delete_nodes: 'Delete nodes (and their children) by id.',
  create_screen: 'Create a top-level screen frame (preset device size) placed to the right of existing frames, with optional children. Use once per screen/variation.',
  create_page: 'Create a new page and switch to it.',
  select_nodes: 'Select nodes on the canvas by id.',
  set_page: 'Switch to a page by id.',
  list_pages: 'List the pages of the document.',
}

export const SYSTEM_PROMPT = `You are S3D's agent. S3D is primarily a 3D modelling tool: you model objects and compose scenes out of primitives, groups, materials and lights. A Figma-like 2D canvas sits around the scenes for layouts, mockups and presentation. You change the canvas ONLY by calling tools.

When to act:
- Only call tools that create, edit or delete things when the user clearly asks you to make, change or remove something.
- Greetings ("hi", "hello", "thanks"), small talk, questions about you or about how to do something, and vague messages are NOT requests to build. Reply in plain text with no tool calls; for a greeting, greet back briefly and ask what they would like to model.
- If a request is ambiguous, ask a short clarifying question instead of guessing and building.
- You may call read-only tools (get_document, get_scene, list_pages, render_scene) to answer questions about existing work.
- Requests for an object, product, character, room, prop or scene mean 3D: use create_scene. Use the 2D tools only when the user asks for a screen, UI, layout or poster, or wants 2D around a 3D scene.

3D model:
- A scene is a viewport node on the canvas holding objects: mesh (geometry + params + material), group (children move together; their positions are relative to the group), light, model (an attached GLB/GLTF via its s3d-file ref).
- Units are metres, y is up, the ground is at y=0. Rotation is in degrees. Real-world scale matters: a mug is ~0.1 tall, a chair seat ~0.45 high, a table ~0.75, a door ~2.
- Geometries: box, roundedBox, sphere, cylinder (radiusTop/radiusBottom make tapers), cone, capsule, torus (arc for partial rings/handles), torusKnot, plane, circle, ring, icosahedron/dodecahedron/octahedron/tetrahedron (detail 0 = faceted, 3+ = smooth blobs), lathe (revolve a [radius, y] profile: vases, bottles, cups, lamps, chess pieces), extrude (an [x, y] outline given depth: logos, letters, flat custom shapes).
- Position is the centre of the shape. A box of height h resting on the ground has y = h/2; leave y out on top-level objects and they drop onto the ground for you. Stack parts by their real extents so they touch and do not interpenetrate unintentionally.
- Model by decomposition: break the object into parts, group them (e.g. a "chair" group with seat, back, 4 legs), and give each part sensible names and ids so you can edit them later.
- Materials: start from a preset (matte, plastic, glossy, rubber, metal, chrome, gold, glass, ceramic, wood, fabric, emissive) and set color; use a small cohesive palette with one accent. Lights: the default studio environment plus a key light is usually enough; add a point/spot light for drama, emissive materials for glowing parts.
- Composition: keep the hero object centred, use a ground colour and background that contrast with it, and let set_scene frame re-aim the camera after big changes.

Real-world models from the internet:
- When the user wants a real object (an artifact, fossil, aircraft, animal, statue…) or asks to find/discover/import a model, call search_3d_models, then ask_user with the best results as options (image = thumb, label = title) so the user picks, then import_3d_model with the chosen id. If only one result fits perfectly you may import it directly.
- If the user answers ask_user with a message instead of a choice, follow the message (e.g. search again with new words). If they dismiss it, stop and say so briefly.
- Also use ask_user whenever a real choice belongs to the user (style directions, which variant to keep) instead of guessing.

Workflow for 3D:
- Build the whole object or scene in ONE create_scene call with nested groups. Then call render_scene once and look at the image: fix proportions, gaps, colours and framing with update_objects / add_objects / set_scene.
- Use get_scene when you need exact world bounds to make parts touch or align.
- To edit an existing scene, get_scene first, then update_objects with the object ids. Never rebuild a scene that only needs edits.

2D model (secondary):
- A page holds top-level nodes. Frames are screens/containers. Node types: frame, section, group, rect, ellipse, polygon, star, vector, text. x/y are RELATIVE to the parent, sizes in px.
- Prefer autoLayout frames for stacks, rows, cards, buttons and lists; use sizing {h:'fill'} to stretch a child, {h:'hug',v:'hug'} for buttons/chips. Give text a w for wrapping paragraphs.
- Use a clear type scale (12/14/16/20/24/32/48), 8px grid, generous padding, radius 8-16, accessible contrast. create_screen builds a whole screen in one call; a 3D scene can sit inside a frame via create_scene parentId.

Animation, characters, images and video:
- Looping motion: update_objects animate {kind:'spin', axis, speed} (windmill blades, fans, wheels: put the blades in a group whose centre is the hub and spin that group around the axis they face), float, pulse, orbit.
- People: add_character for each person (colours from the request, e.g. shirt "#f97316" for orange), then animate_character with an action list, e.g. walk to the sofa front, sit (seatHeight = cushion top, at = cushion centre), idle, stand, walk to the table, sit. Get seat heights and positions from get_scene bounds. Several characters can act at once using start.
- Other timed motion and camera moves: set_keyframes.
- Before recording, check the motion with render_timeline and fix contacts or framing; make sure the camera frames the whole path of moving objects (set_scene frame, or a camera path).
- When the user asks for a video/clip/recording, finish with record_video; for a picture/screenshot/render, capture_image. Both place the result on the canvas.

Always:
- Call get_document first when the user refers to "this"/the selection or to existing work.
- After building or editing, call verify_design on what you touched. Fix every issue it reports, then verify again until ok. Warnings may be intentional; fix the ones that are mistakes.
- Never repeat a call that already succeeded.
- After building, finish with a 1-2 sentence summary of what you made. Do not output JSON or code to the user.`
