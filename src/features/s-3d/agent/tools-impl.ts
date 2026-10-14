import { toast } from 'sonner'
import * as THREE from 'three'
import { z } from 'zod'

import { uid } from '../db'
import { type DiscoverItem, OWNING_UNITS, searchModels } from '../discover/smithsonian'
import { exportNodes } from '../export/exporter'
import { downloadBlob, readFile, storeFile } from '../files'
import { importRemoteModel } from '../io'
import { FRAME_PRESETS, absRect, childrenOf, solid, stroke } from '../model'
import { translatePath } from '../model'
import {
  activeSelection,
  cropCanvas,
  decode,
  editPixels,
  extendCanvas,
  readPixels,
  resizeCanvas,
  revertImages,
  selectPixels,
  straightenCanvas,
  transformImages,
} from '../raster/bake'
import {
  type Pixels,
  type Point,
  type RGB,
  type Selection,
  backgroundEraseStroke,
  cloneStroke,
  fillMask,
  healSpot,
  hexRgb,
  hueSaturation,
  maskSummary,
  paintStroke,
  pickColor,
  vibrance,
} from '../raster/pixels'
import { removeBackground, restoreBackground } from '../remove-background'
import {
  type PaintOp,
  cleanMesh,
  joinPieces,
  paintMesh,
  piecesOf,
  sculptMesh,
  signedVolume,
  smoothMesh,
  subdivideMesh,
  voxelMesh,
} from '../render/mesh-ops'
import {
  ALL_ANGLES,
  DEFAULT_MATERIAL,
  GEOMETRY_PARAMS,
  MATERIAL_PRESETS,
  VIEW_DIRS,
  buildScene,
  disposeTree,
  emptyScene,
  fitCamera,
  makeCamera,
  measureScene,
  objectBounds,
  recordScene,
  renderScene,
  renderTimeline,
  renderViews,
  sceneDuration,
  sceneOf,
} from '../render/scene3d'
import { clearSnapshot, compareImages, getSnapshot, setSnapshot } from '../render/snapshots'
import { openSceneEditor } from '../scene-editor/edit'
import { exportScene } from '../scene-editor/scene-export'
import { useS3D } from '../store'
import type {
  Effect,
  Fill,
  Geometry3D,
  ImageAdjust,
  Keyframe3D,
  Light3D,
  Material3D,
  MeshData3D,
  NodeType,
  Obj3D,
  SNode,
  Scene3D,
  Vec3,
} from '../types'
import { askUser } from './ask-user-store'
import { DEFAULT_LOOK, animateCharacter, buildCharacter } from './character'

const s = () => useS3D.getState()

/* ---------- schemas ---------- */

/** An [x, y] pair. Not z.tuple: that becomes a tuple schema (`items` as an array), which Gemini and OpenAI reject. */
const pair = z.array(z.number()).length(2)

const NODE_TYPES = ['frame', 'section', 'group', 'rect', 'ellipse', 'polygon', 'star', 'vector', 'text', 'shape3d'] as const

const fillSpec = z.union([
  z.string().describe('Hex color, e.g. "#1e293b"'),
  z.object({
    kind: z.enum(['linear', 'radial']),
    angle: z.number().optional(),
    stops: z.array(z.object({ offset: z.number(), color: z.string() })),
  }),
])

/** A pixel selection shape in source pixels (the marquee, lasso and magic wand tools). */
const selectionSpec = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('rect'), x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
    .describe('Rectangular marquee'),
  z
    .object({ type: z.literal('ellipse'), x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
    .describe('Elliptical marquee; x, y, w, h are the bounding box'),
  z
    .object({
      type: z.literal('lasso'),
      points: z.array(pair).min(3).describe('Polygon corners in source pixels'),
    })
    .describe('Lasso'),
  z
    .object({
      type: z.literal('wand'),
      x: z.number().describe('Seed pixel x'),
      y: z.number().describe('Seed pixel y'),
      tolerance: z.number().min(0).max(255).optional().describe('Colour difference allowed per channel (default 32)'),
      contiguous: z.boolean().optional().describe('Only pixels connected to the seed (default true)'),
    })
    .describe('Magic wand: selects pixels of similar colour to the seed'),
])

/** Selection spec with defaults applied (WebMCP calls skip zod parsing). */
const toSelection = (spec: z.infer<typeof selectionSpec>): Selection =>
  spec.type === 'wand'
    ? { type: 'wand', x: spec.x, y: spec.y, tolerance: spec.tolerance ?? 32, contiguous: spec.contiguous ?? true }
    : spec.type === 'lasso'
      ? { type: 'lasso', points: spec.points as Point[] }
      : spec

/** Default swatches, a small set of common colours (Photoshop's swatch panel starts from a similar grid). */
export const SWATCHES = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#78716c',
  '#e7e5e4',
]

/** Photoshop-style custom shapes as paths on a 100×100 grid, scaled to the node size by add_shape. */
const SHAPE_PATHS: Record<string, string> = {
  heart: 'M50,90 C20,65 0,45 0,25 C0,10 12,0 27,0 C38,0 46,7 50,15 C54,7 62,0 73,0 C88,0 100,10 100,25 C100,45 80,65 50,90 Z',
  arrow: 'M0,35 L60,35 L60,10 L100,50 L60,90 L60,65 L0,65 Z',
  cross: 'M35,0 L65,0 L65,35 L100,35 L100,65 L65,65 L65,100 L35,100 L35,65 L0,65 L0,35 L35,35 Z',
  lightning: 'M60,0 L15,55 L45,55 L35,100 L85,40 L55,40 L70,0 Z',
  chevron: 'M0,20 L50,70 L100,20 L100,45 L50,95 L0,45 Z',
  'speech-bubble': 'M10,0 L90,0 Q100,0 100,10 L100,70 Q100,80 90,80 L55,80 L30,100 L35,80 L10,80 Q0,80 0,70 L0,10 Q0,0 10,0 Z',
  star: 'M50,0 L61,35 L98,35 L68,57 L79,91 L50,70 L21,91 L32,57 L2,35 L39,35 Z',
  burst:
    'M50,0 L58,22 L80,8 L76,33 L100,35 L84,52 L100,70 L76,71 L80,96 L58,82 L50,100 L42,82 L20,96 L24,71 L0,70 L16,52 L0,35 L24,33 L20,8 L42,22 Z',
}

const IMAGE_PRESETS: Record<string, ImageAdjust> = {
  original: {},
  vivid: { saturation: 40, contrast: 15 },
  'black-and-white': { grayscale: 100, contrast: 10 },
  vintage: { sepia: 50, contrast: -10, brightness: 5 },
  warm: { temperature: 40, saturation: 10 },
  cool: { temperature: -40 },
  faded: { contrast: -25, brightness: 10, saturation: -20 },
  dramatic: { contrast: 40, saturation: -15, brightness: -10 },
}

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
  shadow: z
    .object({ x: z.number().optional(), y: z.number().optional(), blur: z.number().optional(), color: z.string().optional() })
    .optional(),
  blur: z.number().optional().describe('Background blur (glass) radius'),
  adjust: z
    .object({
      brightness: z.number().optional(),
      contrast: z.number().optional(),
      saturation: z.number().optional(),
      temperature: z.number().optional(),
      hue: z.number().optional(),
      blur: z.number().optional(),
      grayscale: z.number().optional(),
      sepia: z.number().optional(),
      invert: z.boolean().optional(),
    })
    .optional()
    .describe(
      'Image/video adjustments: brightness, contrast, saturation, temperature in -100..100; hue -180..180 degrees; blur px; grayscale and sepia 0..100',
    ),
  text: z.string().optional().describe('Text content (text nodes)'),
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  textVertical: z.boolean().optional().describe('Vertical type: characters run top to bottom (Photoshop Vertical Type tool)'),
  lineHeight: z.number().optional(),
  autoLayout: z
    .object({
      direction: z.enum(['horizontal', 'vertical']),
      gap: z.number().optional(),
      padding: z.number().optional(),
      align: z.enum(['start', 'center', 'end']).optional(),
      justify: z.enum(['start', 'center', 'end', 'space-between']).optional(),
    })
    .nullable()
    .optional(),
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

// 'mesh' is made by the mesh tools from existing objects; it cannot be created from parameters.
const GEOMETRIES = Object.keys(GEOMETRY_PARAMS).filter((g) => g !== 'mesh') as [Geometry3D, ...Geometry3D[]]
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
  vertexColors: z.boolean().optional().describe('Use the colours stored on a joined/fused mesh instead of `color`'),
  sheen: z.number().optional().describe('0..1 soft grazing-angle highlight: fur, fabric, velvet, soft skin'),
  sheenColor: z.string().optional(),
  specularIntensity: z.number().optional().describe('0..1 strength of reflections; lower for fur and skin, 1 for gloss'),
  normalImage: z.string().optional().describe('Normal map (s3d-file: ref or URL), tiled with patternScale'),
  roughnessImage: z.string().optional().describe('Roughness map: dark = shiny, light = matte'),
  aoImage: z.string().optional().describe('Ambient-occlusion map'),
  normalScale: z.number().optional().describe('Normal map strength, default 1'),
  pattern: z
    .enum(['checker', 'stripes', 'ridges', 'dots', 'grid', 'bricks', 'noise', 'wood', 'waves', 'weave', 'fur', 'pores', 'hide'])
    .optional()
    .describe('Procedural surface texture tinted by color; combine with bump for relief'),
  image: z.string().optional().describe('Image texture: an s3d-file: ref or URL (ignored when pattern is set)'),
  patternScale: z.number().optional().describe('Texture repeats across the surface, default 1'),
  bump: z.number().optional().describe('0..1 relief depth of the pattern/image: ridges, grooves, bumps'),
})

const paramsSpec = z
  .object({
    width: z.number().optional(),
    height: z.number().optional(),
    depth: z.number().optional(),
    radius: z.number().optional(),
    radiusTop: z.number().optional(),
    radiusBottom: z.number().optional(),
    length: z.number().optional(),
    tube: z.number().optional(),
    arc: z.number().optional().describe('Torus arc in degrees'),
    p: z.number().optional(),
    q: z.number().optional(),
    innerRadius: z.number().optional(),
    outerRadius: z.number().optional(),
    detail: z.number().optional(),
    segments: z.number().optional(),
    bevel: z.number().optional(),
    turns: z.number().optional(),
    amplitude: z.number().optional(),
    frequency: z.number().optional(),
    closed: z.number().optional().describe('tube: 1 closes the curve into a loop'),
    points: z
      .array(z.array(z.number()).min(2).max(3))
      .optional()
      .describe(
        'lathe: [radius, y] profile revolved around Y (vases, bottles, cups). extrude: [x, y] outline extruded along Z by depth. tube: [x, y, z] path points; a smooth curve is swept with a round pipe of `radius` (cables, rails, handles). helix: coil/spring. wave: rippled surface',
      ),
  })
  .describe(
    `Geometry dimensions in scene units. Keys per geometry: ${Object.entries(GEOMETRY_PARAMS)
      .filter(([g]) => g !== 'mesh')
      .map(([g, p]) => `${g}(${Object.keys(p).join(',')}${g === 'lathe' || g === 'extrude' || g === 'tube' ? ',points' : ''})`)
      .join('; ')}`,
  )

const lightSpec = z.object({
  type: z.enum(['ambient', 'hemisphere', 'directional', 'point', 'spot']),
  color: z.string().optional(),
  intensity: z.number().optional(),
  groundColor: z.string().optional(),
  angle: z.number().optional().describe('Spot cone angle in degrees'),
  castShadow: z.boolean().optional(),
  size: z.number().optional().describe('0..10 softness of the shadow edge, like a bigger light: ~4-8 for a soft key light'),
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
  src: z
    .string()
    .optional()
    .describe('model: s3d-file ref or URL of a GLB/GLTF (normalized to fit a 1-unit cube on the ground; use scale to size it)'),
  castShadow: z.boolean().optional(),
  visible: z.boolean().optional(),
  animate: z
    .object({
      kind: z.enum(['spin', 'float', 'pulse', 'orbit']),
      speed: z.number().optional().describe('Radians per second for spin'),
      axis: z
        .enum(['x', 'y', 'z'])
        .optional()
        .describe("Spin axis in the object's own frame (default y). Windmill/fan blades facing +z spin around z"),
    })
    .nullable()
    .optional()
    .describe('Looping motion; null removes it'),
}

export type ObjSpec = { id?: string; kind?: Obj3D['kind']; children?: ObjSpec[] } & {
  [K in keyof typeof objProps]?: z.infer<(typeof objProps)[K]>
}
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
  shadowQuality: z.enum(['normal', 'high', 'ultra']).optional().describe('Shadow map detail: sharper contact shadows under feet and belly'),
  exposure: z.number().optional().describe('Overall brightness, default 1'),
  envIntensity: z.number().optional().describe('Strength of environment light and reflections, default 0.6'),
  envRotation: z.number().optional().describe('Turn the environment lighting around, degrees'),
  toneMapping: z
    .enum(['aces', 'neutral', 'linear', 'none'])
    .optional()
    .describe('aces (default, filmic contrast), neutral (truer colours), linear, none'),
  post: z
    .object({ contrast: z.number().optional(), saturation: z.number().optional(), sharpen: z.number().optional().describe('0..1') })
    .optional()
    .describe('Applied to still renders and captures: contrast/saturation 1 = unchanged'),
}
const VIEWS = ['iso', 'front', 'side', 'top', 'back', 'left', 'iso-back'] as const

const keyframeSpec = z.object({
  t: z.number().describe('Seconds'),
  position: vec3.optional(),
  rotation: vec3.optional().describe('Degrees'),
  scale: vec3.optional(),
  visible: z.boolean().optional(),
  ease: z.enum(['linear', 'ease-in-out']).optional(),
})
const xz = z.array(z.number()).length(2).describe('[x, z] on the ground')
const actionSpec = z.discriminatedUnion('type', [
  z.object({ type: z.literal('walk'), to: xz, speed: z.number().optional().describe('m/s, default 1.3') }),
  z.object({ type: z.literal('run'), to: xz, speed: z.number().optional() }),
  z.object({
    type: z.literal('turn'),
    facing: z.number().optional().describe('Yaw degrees; 0 faces +z, 90 faces +x'),
    toward: xz.optional(),
    duration: z.number().optional(),
  }),
  z.object({
    type: z.literal('sit'),
    seatHeight: z.number().describe('Height of the seat top (sofa cushion ~0.45, chair ~0.46, table top ~0.75)'),
    at: xz.optional().describe('Seat centre the pelvis ends over; the character turns its back to it'),
    facing: z.number().optional(),
    duration: z.number().optional(),
  }),
  z.object({ type: z.literal('stand'), to: xz.optional().describe('Walk here after standing'), duration: z.number().optional() }),
  z.object({ type: z.literal('idle'), duration: z.number() }),
  z.object({ type: z.literal('wave'), duration: z.number().optional(), side: z.enum(['l', 'r']).optional() }),
  z.object({ type: z.literal('jump'), height: z.number().optional(), duration: z.number().optional() }),
])
const viewSpec = z
  .enum(['camera', ...VIEWS])
  .optional()
  .describe('camera (default) = the scene camera, following its camera path')

export const schemas = {
  get_document: z.object({}),
  verify_design: z.object({ ids: z.array(z.string()).optional().describe('Screens or nodes to check; omit to check the whole page') }),
  create_nodes: z.object({ parentId: z.string().optional().describe('Parent frame id; omit for page'), nodes: z.array(nodeSpec) }),
  update_nodes: z.object({ updates: z.array(z.object({ id: z.string(), ...propsShape })) }),
  delete_nodes: z.object({ ids: z.array(z.string()) }),
  create_screen: z.object({
    name: z.string(),
    preset: z
      .string()
      .optional()
      .describe(`One of: ${FRAME_PRESETS.flatMap((g) => g.items.map((i) => i.name)).join(', ')}`),
    w: z.number().optional(),
    h: z.number().optional(),
    fill: fillSpec.optional(),
    autoLayout: propsShape.autoLayout,
    children: z.array(nodeSpec).optional(),
  }),
  create_page: z.object({ name: z.string() }),
  select_nodes: z.object({ ids: z.array(z.string()) }),
  remove_background: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    restore: z.boolean().optional().describe('Bring back the original image instead of removing the background'),
  }),
  adjust_image: z.object({
    ids: z.array(z.string()).optional().describe('Image or video node ids; defaults to the selection'),
    preset: z
      .enum(['original', 'vivid', 'black-and-white', 'vintage', 'warm', 'cool', 'faded', 'dramatic'])
      .optional()
      .describe('Starting look; the other fields are applied on top'),
    brightness: z.number().min(-100).max(100).optional(),
    contrast: z.number().min(-100).max(100).optional(),
    saturation: z.number().min(-100).max(100).optional(),
    temperature: z.number().min(-100).max(100).optional().describe('Warm (+) to cool (-)'),
    hue: z.number().min(-180).max(180).optional().describe('Degrees'),
    blur: z.number().min(0).max(40).optional().describe('px'),
    grayscale: z.number().min(0).max(100).optional(),
    sepia: z.number().min(0).max(100).optional(),
    invert: z.boolean().optional(),
    reset: z.boolean().optional().describe('Clear all adjustments first'),
  }),
  place_image: z.object({
    src: z
      .string()
      .describe('Image URL, data: URL or s3d-file: ref (such as one from export_file) to place. It is stored with the document.'),
    name: z.string().optional(),
    parentId: z.string().optional().describe('Frame to place it in; omit for the page'),
    x: z.number().optional().describe('Relative to the parent'),
    y: z.number().optional(),
    w: z.number().positive().optional().describe('Width in design px; defaults to the image width in pixels'),
    h: z.number().positive().optional().describe('Height in design px; defaults to the width times the image aspect'),
  }),
  inspect_image: z.object({ ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection') }),
  crop_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    x: z.number().min(0).describe('Left edge in source pixels (see inspect_image for the size)'),
    y: z.number().min(0).describe('Top edge in source pixels'),
    w: z.number().positive().describe('Width in source pixels'),
    h: z.number().positive().describe('Height in source pixels'),
  }),
  straighten_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    degrees: z.number().min(-45).max(45).describe('Rotation; positive turns counter-clockwise, as in Photoshop'),
    crop: z.boolean().optional().describe('Trim to the largest upright rectangle so no transparent corners remain (default true)'),
  }),
  resize_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    width: z.number().positive().optional().describe('New width in source pixels; the height follows the aspect when only one is given'),
    height: z.number().positive().optional().describe('New height in source pixels'),
    resample: z
      .boolean()
      .optional()
      .describe('true (default) changes the pixel count; false keeps the pixels and only changes the print size through resolution'),
    smooth: z.boolean().optional().describe('Smooth resampling (default) or hard-edged nearest neighbour for pixel art'),
    resolution: z.number().positive().optional().describe('Pixels per inch when resample is false (default 300)'),
  }),
  canvas_size: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    width: z.number().optional().describe('New canvas width in source pixels; with relative, the amount to add (negative removes)'),
    height: z.number().optional().describe('New canvas height in source pixels; with relative, the amount to add'),
    anchor: z
      .enum(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'])
      .optional()
      .describe('Where the image sits on the new canvas (default center)'),
    relative: z.boolean().optional(),
  }),
  paint_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    target: z
      .enum(['pixels', 'mask'])
      .optional()
      .describe(
        'pixels (default) paints the image. mask paints its layer mask: opaque shows the image, transparent hides it, like Photoshop white and black on a mask.',
      ),
    initial: z.enum(['reveal', 'hide']).optional().describe('Mask only, when the mask is first created: reveal (default) shows everything'),
    strokes: z
      .array(
        z.object({
          mode: z.enum(['paint', 'erase']).describe('paint adds colour; erase removes pixels (eraser tool)'),
          color: z.string().optional().describe('Hex colour for paint, e.g. "#ff0000"; ignored for erase and masks'),
          key: z
            .string()
            .optional()
            .describe('Erase only: background eraser. Hex colour sampled from the background; only pixels close to it are removed'),
          tolerance: z
            .number()
            .min(0)
            .max(255)
            .optional()
            .describe('Background eraser: colour difference allowed per channel (default 32)'),
          size: z.number().positive().describe('Brush diameter in source pixels'),
          hardness: z.number().min(0).max(1).optional().describe('0 soft edge to 1 hard edge (default 0.8)'),
          opacity: z.number().min(0).max(1).optional().describe('Flow per stamp, 0 to 1 (default 1)'),
          points: z.array(pair).min(1).describe('Stroke path in source pixels'),
        }),
      )
      .min(1),
  }),
  clone_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    strokes: z
      .array(
        z.object({
          from: z
            .array(z.number())
            .length(2)
            .describe('Sample point in source pixels (Alt-click in Photoshop); the clone keeps this offset'),
          points: z.array(pair).min(1).describe('Where to paint, in source pixels'),
          size: z.number().positive().describe('Brush diameter in source pixels'),
          hardness: z.number().min(0).max(1).optional(),
          opacity: z.number().min(0).max(1).optional(),
        }),
      )
      .min(1),
  }),
  heal_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    spots: z
      .array(
        z.object({
          x: z.number().describe('Centre of the blemish in source pixels'),
          y: z.number(),
          size: z.number().positive().describe('Diameter of the blemish in source pixels'),
        }),
      )
      .min(1),
  }),
  fill_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    selection: selectionSpec.optional().describe('Area to fill; defaults to the active selection from select_pixels'),
  }),
  pick_color: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection (first one is used)'),
    x: z.number().describe('Source pixel x'),
    y: z.number().describe('Source pixel y'),
  }),
  vibrance_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    amount: z.number().min(-100).max(100).describe('-100 desaturates; positive values boost muted colours more than saturated ones'),
  }),
  hue_saturation_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    hue: z.number().min(-180).max(180).optional().describe('Degrees'),
    saturation: z.number().min(-100).max(100).optional(),
    lightness: z.number().min(-100).max(100).optional(),
  }),
  add_shape: z.object({
    shape: z.enum(Object.keys(SHAPE_PATHS) as [string, ...string[]]).describe('Custom shape preset'),
    name: z.string().optional(),
    parentId: z.string().optional().describe('Frame to place it in; omit for the page'),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().positive().optional().describe('Width in px (default 120)'),
    h: z.number().positive().optional().describe('Height in px (default 120)'),
    fill: z.string().optional().describe('Hex fill colour (default #111111)'),
  }),
  arrange_nodes: z.object({
    ids: z.array(z.string()).optional().describe('Node ids; defaults to the selection'),
    direction: z
      .enum(['forward', 'backward', 'front', 'back'])
      .describe('Move one step forward/backward or to the front/back of the layer stack'),
  }),
  group_nodes: z.object({
    ids: z.array(z.string()).optional().describe('Node ids; defaults to the selection'),
    ungroup: z.boolean().optional().describe('Ungroup the given groups instead of grouping'),
  }),
  get_history: z.object({}),
  set_colors: z.object({
    foreground: z.string().optional().describe('Hex foreground colour, used by brush, shape and fill tools'),
    background: z.string().optional().describe('Hex background colour'),
    swap: z.boolean().optional().describe('Swap foreground and background (X in Photoshop)'),
  }),
  list_swatches: z.object({}),
  revert_image: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    layerMask: z.boolean().optional().describe('Remove only the layer mask and keep the pixel edits'),
  }),
  select_pixels: z.object({
    ids: z.array(z.string()).optional().describe('Image node ids; defaults to the selection'),
    mode: z
      .enum(['replace', 'add', 'subtract', 'intersect', 'invert', 'deselect', 'layerMask'])
      .optional()
      .describe(
        'replace (default) makes a new selection; add, subtract and intersect combine with the current one; invert flips it (or selects everything when there is none); layerMask turns the selection into the layer mask (reveal selection) and clears it; deselect clears it',
      ),
    selection: selectionSpec.optional(),
    refine: z
      .object({
        grow: z.number().min(-50).max(50).optional().describe('Pixels to grow (positive) or contract (negative) the edge'),
        feather: z.number().min(0).max(50).optional().describe('Soft edge radius in pixels'),
      })
      .optional()
      .describe('Select & Mask edge refinement, applied after the selection is combined'),
  }),
  undo: z.object({}),
  redo: z.object({}),
  set_view: z.object({
    zoom: z.number().min(0.05).max(16).optional().describe('Zoom level, 1 is 100%'),
    fit: z.boolean().optional().describe('Zoom to fit the selection, or the page when nothing is selected'),
  }),
  export_image: z.object({
    ids: z.array(z.string()).optional().describe('Node ids; defaults to the selection'),
    format: z.enum(['png', 'jpg', 'svg', 'pdf']).optional().describe('Default png'),
    scale: z.number().positive().max(8).optional().describe('Pixel scale, default 1'),
  }),
  set_page: z.object({ id: z.string() }),
  list_pages: z.object({}),

  create_scene: z.object({
    name: z.string(),
    parentId: z.string().optional().describe('Frame to place the scene viewport in; omit for the page'),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional().describe('Viewport width in px (default 800)'),
    h: z.number().optional().describe('Viewport height in px (default 600)'),
    ...sceneSettings,
    camera: cameraSpec.optional().describe('Omit to frame everything automatically'),
    objects: z.array(objSpec),
  }),
  add_objects: z.object({
    sceneId: z.string(),
    parent: z.string().optional().describe('Group object id to add into'),
    objects: z.array(objSpec),
  }),
  update_objects: z.object({
    sceneId: z.string(),
    updates: z.array(
      z.object({ id: z.string(), parent: z.string().nullable().optional().describe('Move into a group (null = scene root)'), ...objProps }),
    ),
  }),
  delete_objects: z.object({ sceneId: z.string(), ids: z.array(z.string()).describe('Groups take their children with them') }),
  set_scene: z.object({
    sceneId: z.string(),
    ...sceneSettings,
    camera: cameraSpec.optional(),
    frame: z.enum(VIEWS).optional().describe('Re-aim the camera to frame every object from this view'),
  }),
  get_scene: z.object({ sceneId: z.string() }),
  render_scene: z.object({
    sceneId: z.string(),
    view: z
      .enum(['camera', ...VIEWS])
      .optional()
      .describe('camera (default) = what the user sees'),
    time: z.number().optional().describe('Timeline seconds, default 0'),
    width: z.number().optional().describe('Output width in px, up to 4096 (default 768): use a large one to inspect fine detail'),
    supersample: z.number().optional().describe('1..3: render bigger and shrink for smoother, sharper edges'),
    wireframe: z.boolean().optional().describe('Show mesh edges to inspect topology and faceting'),
    only: z.array(z.string()).optional().describe('Isolate: show only these object ids'),
    projection: z.enum(['perspective', 'orthographic']).optional().describe('orthographic removes perspective, for judging proportions'),
  }),

  add_character: z.object({
    sceneId: z.string(),
    id: z.string().optional().describe('Readable id, e.g. "man"; part ids are prefixed with it'),
    name: z.string().optional(),
    position: xz.optional(),
    facing: z.number().optional().describe('Yaw degrees; 0 faces +z (toward the default camera)'),
    height: z.number().optional().describe('Metres, default 1.75'),
    build: z.enum(['male', 'female']).optional(),
    skin: z.string().optional(),
    shirt: z.string().optional(),
    pants: z.string().optional(),
    shoes: z.string().optional(),
    hair: z.string().optional(),
  }),
  animate_character: z.object({
    sceneId: z.string(),
    characterId: z.string(),
    actions: z.array(actionSpec).describe('Performed in order'),
    start: z.number().optional().describe("Start time in seconds; default continues after the character's last action"),
    reset: z.boolean().optional().describe("Clear the character's existing motion first"),
  }),
  set_keyframes: z.object({
    sceneId: z.string(),
    tracks: z
      .array(
        z.object({
          id: z.string().describe('Object id'),
          keyframes: z.array(keyframeSpec),
          append: z.boolean().optional().describe('Keep existing keys (default replaces them)'),
        }),
      )
      .optional(),
    camera: z
      .array(z.object({ t: z.number(), position: vec3, target: vec3, fov: z.number().optional() }))
      .optional()
      .describe('Camera path; [] removes it'),
    duration: z.number().optional().describe('Timeline length in seconds'),
  }),
  render_views: z.object({
    sceneId: z.string(),
    views: z.array(z.enum(VIEWS)).min(1).max(9).optional().describe('Angles to show; default front, side, back, left, top, iso'),
    time: z.number().optional().describe('Timeline seconds, default 0'),
  }),
  snapshot_view: z.object({
    sceneId: z.string(),
    label: z
      .string()
      .describe(
        'Name of this viewpoint, e.g. "front-door" or "seat-closeup". Taking another picture with the same label compares it with the last one.',
      ),
    camera: z
      .object({ position: vec3, target: vec3, fov: z.number().optional() })
      .optional()
      .describe('An exact camera. Omit to reuse the last camera of this label, or to use `look`'),
    look: z
      .object({
        object: z.string().optional().describe('Object id to frame; omit for the whole scene'),
        azimuth: z
          .number()
          .optional()
          .describe('Degrees around the subject: 0 = from the front (+z), 90 = from the right (+x), 180 = behind, 270 = left. Default 35'),
        elevation: z.number().optional().describe('Degrees above the horizon, -80..89. Default 20'),
        zoom: z.number().optional().describe('Distance multiplier: below 1 closer, above 1 farther. Default 1'),
      })
      .optional()
      .describe('Aim at an object from an angle; the app works out the camera'),
    time: z.number().optional().describe('Timeline seconds, default 0'),
    reset: z.boolean().optional().describe('Forget the earlier picture of this label and start a new baseline'),
  }),
  join_meshes: z.object({
    sceneId: z.string(),
    ids: z.array(z.string()).min(1).describe('Objects or groups to combine; groups bring all their meshes'),
    name: z.string().optional(),
    removeOriginals: z.boolean().optional().describe('Delete the originals (default hides them, so you can still go back)'),
  }),
  fuse_objects: z.object({
    sceneId: z.string(),
    ids: z.array(z.string()).min(1).describe('Objects or groups, in order. Where pieces overlap, later ones decide the colour'),
    operation: z
      .enum(['union', 'subtract', 'intersect'])
      .optional()
      .describe(
        'union (default) fuses everything into one continuous surface; subtract cuts the other objects out of the first; intersect keeps only the overlap of all',
      ),
    resolution: z
      .number()
      .optional()
      .describe('Voxels along the longest side, 16..128, default 64. Higher keeps finer detail and costs more triangles'),
    smooth: z.number().optional().describe('Smoothing passes on the voxels, 0..4, default 1; higher rounds joints and blends parts more'),
    name: z.string().optional(),
    removeOriginals: z.boolean().optional().describe('Delete the originals (default hides them, so you can still go back)'),
  }),
  smooth_mesh: z.object({
    sceneId: z.string(),
    id: z.string().describe('A mesh object made by join_meshes or fuse_objects'),
    iterations: z.number().optional().describe('1..20, default 3'),
    strength: z.number().optional().describe('0..1, default 0.5'),
  }),
  clean_mesh: z.object({
    sceneId: z.string(),
    id: z.string().describe('A mesh object made by join_meshes or fuse_objects'),
    weldDistance: z.number().optional().describe('Vertices closer than this are merged; default 0.001 of the mesh size'),
  }),
  export_mesh: z.object({
    sceneId: z.string(),
    format: z
      .enum(['glb', 'obj', 'stl'])
      .describe('glb keeps colours, materials and lights; obj and stl are geometry only (stl for 3D printing)'),
  }),
  render_turntable: z.object({
    sceneId: z.string(),
    count: z.number().optional().describe('Angles around the subject, 4..12, default 8'),
    object: z.string().optional().describe('Object id to circle; omit for the whole scene'),
    elevation: z.number().optional().describe('Degrees above the horizon, default 15'),
    zoom: z.number().optional(),
    time: z.number().optional(),
    only: z.array(z.string()).optional(),
  }),
  subdivide_mesh: z.object({
    sceneId: z.string(),
    id: z.string().describe('A mesh object made by join_meshes or fuse_objects'),
    levels: z.number().optional().describe('1..3, default 1; each level makes four times the triangles and rounds the surface'),
  }),
  sculpt_mesh: z.object({
    sceneId: z.string(),
    id: z.string().describe('A mesh object'),
    strokes: z
      .array(
        z.object({
          brush: z
            .enum(['inflate', 'deflate', 'smooth', 'pinch', 'crease'])
            .describe('inflate/deflate push out/in; smooth relaxes; pinch draws the surface together; crease cuts a groove'),
          at: vec3.describe('World position of the stroke, on or near the surface'),
          radius: z.number().describe('World units'),
          strength: z.number().optional().describe('0..1, default 0.5'),
        }),
      )
      .min(1)
      .max(40),
  }),
  paint_mesh: z.object({
    sceneId: z.string(),
    id: z.string().describe('A mesh object; use fuse_objects/join_meshes first. Subdivide first for crisp patch edges'),
    ops: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('brush'),
            at: vec3,
            radius: z.number(),
            color: z.string(),
            strength: z.number().optional().describe('0..1'),
            noise: z.number().optional().describe('0..1 grain so the stroke is not flat'),
          }),
          z.object({
            kind: z.literal('patches'),
            color: z.string(),
            coverage: z.number().optional().describe('0..1 share of the surface covered, default 0.4'),
            scale: z.number().optional().describe('Patch size in world units, default 0.3'),
            seed: z.number().optional().describe('Change for a different pattern'),
            softness: z.number().optional().describe('Edge softness 0.005..0.3, default 0.04'),
            region: z.object({ at: vec3, radius: z.number() }).optional().describe('Only inside this sphere'),
            yRange: z.array(z.number()).length(2).optional().describe('Only between these world heights [min, max]'),
          }),
          z.object({
            kind: z.literal('variation'),
            amount: z.number().optional().describe('0..0.3 brightness variation, default 0.08: dirt, natural imperfections'),
            scale: z.number().optional(),
            seed: z.number().optional(),
          }),
        ]),
      )
      .min(1)
      .max(30),
  }),
  set_fur: z.object({
    sceneId: z.string(),
    id: z.string().describe('A mesh object (any geometry, best on a fused mesh)'),
    remove: z.boolean().optional(),
    length: z.number().optional().describe('Strand length in scene units, default 0.015 for short fur'),
    layers: z.number().optional().describe('4..16 shells, default 10'),
    density: z.number().optional().describe('Strands per unit: higher is finer, default 40'),
    tipColor: z.string().optional().describe('Colour at the strand tips (defaults to the base colour)'),
  }),
  set_lighting: z.object({
    sceneId: z.string(),
    preset: z
      .enum(['three-point', 'soft-studio', 'dramatic', 'product'])
      .describe(
        'three-point: warm soft key, cool fill, rim light. soft-studio: very large soft key. dramatic: hard side key, strong rim, dark ambient. product: big top softbox plus side fills and rim',
      ),
    subject: z.string().optional().describe('Object id to light; omit for the whole scene'),
    intensity: z.number().optional().describe('Multiplier for all lights, default 1'),
    replace: z.boolean().optional().describe('Remove the existing lights first (default true)'),
  }),
  render_timeline: z.object({
    sceneId: z.string(),
    times: z.array(z.number()).max(9).optional().describe('Seconds to show; default 6 evenly spaced'),
    view: viewSpec,
  }),
  capture_image: z.object({
    sceneId: z.string(),
    time: z.number().optional().describe('Timeline seconds, default 0'),
    view: viewSpec,
    width: z.number().optional().describe('Pixels, default the scene size, max 4096'),
    height: z.number().optional(),
    download: z.boolean().optional().describe("Also save to the user's downloads"),
  }),
  record_video: z.object({
    sceneId: z.string(),
    duration: z.number().optional().describe('Seconds, default the timeline length (max 120)'),
    fps: z.number().optional().describe('Default 30'),
    view: viewSpec,
    width: z.number().optional().describe('Pixels, default the scene size up to 1280'),
    height: z.number().optional(),
    download: z.boolean().optional(),
  }),

  search_3d_models: z.object({
    query: z.string().describe('Short subject keywords, e.g. "triceratops", "space shuttle", "mask"'),
    collection: z
      .enum(Object.keys(OWNING_UNITS) as [string, ...string[]])
      .optional()
      .describe(
        `Optional Smithsonian unit: ${Object.entries(OWNING_UNITS)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`,
      ),
    limit: z.number().optional().describe('Max results (default 12)'),
  }),
  ask_user: z.object({
    question: z.string().describe('What you want the user to decide, in one friendly sentence'),
    options: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
          image: z.string().optional().describe('Image URL, e.g. a model thumb from search_3d_models'),
        }),
      )
      .min(1),
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
  if (p.adjust) out.adjust = { ...base?.adjust, ...p.adjust }
  if (p.fills) out.fills = p.fills.map(toFill)
  if (p.fill !== undefined) out.fills = p.fill === 'none' ? [] : [toFill(p.fill)]
  if (p.radius !== undefined)
    out.radius = (typeof p.radius === 'number' ? [p.radius, p.radius, p.radius, p.radius] : p.radius) as SNode['radius']
  if (p.stroke) out.strokes = [stroke(p.stroke.color, p.stroke.width ?? 1)]
  const effects: Effect[] = []
  if (p.shadow)
    effects.push({
      id: uid(),
      kind: 'drop-shadow',
      x: p.shadow.x ?? 0,
      y: p.shadow.y ?? 4,
      blur: p.shadow.blur ?? 16,
      spread: 0,
      color: p.shadow.color ?? 'rgba(0,0,0,0.15)',
      visible: true,
    })
  if (p.blur) effects.push({ id: uid(), kind: 'glass', blur: p.blur, tint: '#ffffff', visible: true })
  if (effects.length) out.effects = effects
  if (p.autoLayout !== undefined) {
    const a = p.autoLayout
    out.autoLayout = a && {
      direction: a.direction,
      gap: a.gap ?? 12,
      padding: Array(4).fill(a.padding ?? 0) as [number, number, number, number],
      align: a.align ?? 'start',
      justify: a.justify ?? 'start',
      wrap: false,
    }
  }
  if (p.sizing) out.sizing = { h: p.sizing.h ?? base?.sizing.h ?? 'fixed', v: p.sizing.v ?? base?.sizing.v ?? 'fixed' }
  if (base?.text || p.text !== undefined || p.fontSize || p.fontWeight) {
    const t = base?.text
    if (t || p.text !== undefined) {
      out.text = {
        ...(t ?? {
          content: '',
          fontFamily: 'Inter Variable',
          fontSize: 16,
          fontWeight: 400,
          italic: false,
          underline: false,
          strike: false,
          lineHeight: 1.3,
          letterSpacing: 0,
          align: 'left',
          verticalAlign: 'top',
          transform: 'none',
          autoSize: 'width',
        }),
        ...(p.text !== undefined && { content: p.text }),
        ...(p.fontSize && { fontSize: p.fontSize }),
        ...(p.fontWeight && { fontWeight: p.fontWeight }),
        ...(p.textAlign && { align: p.textAlign }),
        ...(p.textVertical !== undefined && { vertical: p.textVertical }),
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
    id: n.id,
    type: n.type,
    name: n.name,
    x: Math.round(n.x),
    y: Math.round(n.y),
    w: Math.round(n.w),
    h: Math.round(n.h),
    ...(fill && { fill: fill.kind === 'solid' ? fill.color : fill.kind }),
    ...(n.text && { text: n.text.content.slice(0, 200), fontSize: n.text.fontSize }),
    ...(n.autoLayout && { autoLayout: n.autoLayout.direction }),
    ...(n.type === 'shape3d' && { scene: n.scene ? `${n.scene.objects.length} objects (get_scene for details)` : `single ${n.shape3d}` }),
    ...(!n.visible && { visible: false }),
    ...(n.children.length && {
      children: n.children
        .map((c) => s().doc.nodes[c])
        .filter(Boolean)
        .map(summarize),
    }),
  }
}

const parentOk = (id?: string) => {
  if (!id) return s().pageId
  if (!s().doc.nodes[id]) throw new Error(`No node with id ${id}`)
  return id
}

interface Issue {
  id: string
  name: string
  problem: string
  sceneId?: string
}

/** Layout problems a person would spot at a glance: things spilling out of their frame, zero sizes, empty text, text on text. */
function findIssues(n: SNode, issues: Issue[]) {
  const kids = n.children.map((c) => s().doc.nodes[c]).filter((k): k is SNode => !!k && k.visible)
  for (const k of kids) {
    if (k.w < 1 || k.h < 1) issues.push({ id: k.id, name: k.name, problem: `has no size (${Math.round(k.w)}×${Math.round(k.h)})` })
    if (k.type === 'text' && !k.text?.content.trim()) issues.push({ id: k.id, name: k.name, problem: 'is an empty text layer' })
    if (n.type === 'frame' && (k.x < -1 || k.y < -1 || k.x + k.w > n.w + 1 || k.y + k.h > n.h + 1)) {
      issues.push({
        id: k.id,
        name: k.name,
        problem: `spills out of "${n.name}" (${Math.round(k.x)},${Math.round(k.y)} ${Math.round(k.w)}×${Math.round(k.h)} inside ${Math.round(n.w)}×${Math.round(n.h)})`,
      })
    }
  }
  // Auto-layout places children itself, so only free-placed text can land on other text.
  if (!n.autoLayout) {
    const texts = kids.filter((k) => k.type === 'text')
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i],
          b = texts[j]
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
          issues.push({ id: b.id, name: b.name, problem: `overlaps text "${a.name}"` })
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

/** A camera aimed at an object (or everything) from an angle: azimuth 0 = from +z, 90 = from +x. */
async function lookCamera(
  scene: Scene3D,
  aspect: number,
  look?: { object?: string; azimuth?: number; elevation?: number; zoom?: number },
): Promise<Scene3D['camera']> {
  const az = THREE.MathUtils.degToRad(look?.azimuth ?? 35),
    el = THREE.MathUtils.degToRad(Math.max(-80, Math.min(89, look?.elevation ?? 20)))
  const dir: Vec3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
  return measureScene(scene, (root) => {
    const all = new THREE.Box3()
    const map = objectBounds(root)
    if (look?.object) {
      const box = map.get(look.object)
      if (!box) throw new Error(`No object ${look.object} in this scene`)
      all.copy(box)
    } else for (const b of map.values()) all.union(b)
    if (all.isEmpty()) all.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1))
    const sphere = all.getBoundingSphere(new THREE.Sphere())
    const vfov = THREE.MathUtils.degToRad(scene.camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const dist = ((sphere.radius * 1.2) / Math.sin(Math.min(vfov, hfov) / 2)) * (look?.zoom ?? 1)
    const p = new THREE.Vector3(...dir).multiplyScalar(dist).add(sphere.center)
    const r = (v: number) => Math.round(v * 100) / 100
    return {
      position: [r(p.x), r(p.y), r(p.z)] as Vec3,
      target: [r(sphere.center.x), r(sphere.center.y), r(sphere.center.z)] as Vec3,
      fov: scene.camera.fov,
    }
  })
}

/** An object's local-to-scene transform, through its parent groups. */
function worldMatrix(scene: Scene3D, o: Obj3D): THREE.Matrix4 {
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...o.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3))),
    new THREE.Vector3(...o.scale),
  )
  const parent = o.parent ? scene.objects.find((x) => x.id === o.parent) : undefined
  return parent ? worldMatrix(scene, parent).multiply(local) : local
}

/** The world-space pieces of these objects, as they stand in `scene`. */
async function piecesFor(scene: Scene3D, ids: string[]) {
  for (const id of ids) {
    const o = scene.objects.find((x) => x.id === id)
    if (!o) throw new Error(`No object ${id} in this scene`)
    if (o.kind === 'light') throw new Error(`${id} is a light; mesh tools work on meshes, groups and models`)
  }
  const root = await buildScene(scene)
  try {
    root.updateMatrixWorld(true)
    const pieces = ids.flatMap((id) => piecesOf(root, id))
    if (!pieces.length) throw new Error('Those objects have no visible mesh')
    return pieces
  } finally {
    disposeTree(root)
  }
}

function addMeshObject(scene: Scene3D, mesh: MeshData3D, name: string, color: THREE.Color) {
  const id = `mesh-${uid().slice(0, 6)}`
  scene.objects.push({
    id,
    name,
    kind: 'mesh',
    parent: null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    geometry: 'mesh',
    mesh,
    castShadow: true,
    material: { ...DEFAULT_MATERIAL, color: `#${color.getHexString()}`, roughness: 0.6, vertexColors: !!mesh.colors },
  })
  return id
}

/** Hides the originals a mesh tool replaced (or removes them), so the result is what shows. */
function retire(scene: Scene3D, ids: string[], remove?: boolean) {
  if (remove) {
    const gone = descendantsOf(scene, ids)
    for (const id of ids) gone.add(id)
    scene.objects = scene.objects.filter((o) => !gone.has(o.id))
  } else for (const o of scene.objects) if (ids.includes(o.id)) o.visible = false
}

function meshObject(scene: Scene3D, id: string) {
  const o = scene.objects.find((x) => x.id === id)
  if (!o) throw new Error(`No object ${id} in this scene`)
  if (!o.mesh) throw new Error(`${id} is not a mesh object. Make one with join_meshes or fuse_objects first.`)
  return o
}

const meshStats = (m: MeshData3D) => ({
  vertices: m.positions.length / 3,
  triangles: m.indices.length / 3,
  coloured: !!m.colors,
  closedVolume: Math.round(signedVolume(m) * 1000) / 1000,
})

/** In S3D the viewer shows one scene; switch it to the scene the agent is working on, so the user sees the latest. */
function showScene(id: string) {
  const st = s()
  if (st.service === '3d' && st.sceneEdit?.nodeId !== id) openSceneEditor(id)
}

function saveScene(id: string, scene: Scene3D) {
  s().updateNodes([id], { scene, type: 'shape3d' })
  touchedIds.push(id)
  showScene(id)
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
  if (p.params)
    o.params = { ...o.params, ...Object.fromEntries(Object.entries(p.params).filter(([, v]) => v !== undefined)) } as Obj3D['params']
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
    o.light = {
      ...l,
      color: p.color ?? l.color ?? '#ffffff',
      intensity: l.intensity ?? 1,
      castShadow: l.castShadow ?? (l.type !== 'ambient' && l.type !== 'hemisphere'),
    }
  }
}

/** Adds a spec tree to the scene. Returns the created ids and the top-level ones that should drop onto the ground. */
function addSpecs(scene: Scene3D, specs: ObjSpec[], parent: string | null, out: { ids: Record<string, string>; ground: string[] }) {
  for (const spec of specs) {
    const kind = spec.kind ?? (spec.light ? 'light' : spec.children?.length ? 'group' : spec.src ? 'model' : 'mesh')
    let id = spec.id?.trim() || `${kind}-${uid().slice(0, 6)}`
    while (scene.objects.some((o) => o.id === id)) id = `${id}-${uid().slice(0, 3)}`
    const o: Obj3D = {
      id,
      name: spec.name ?? spec.id ?? spec.geometry ?? kind,
      kind,
      parent,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    }
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
    for (const o of scene.objects)
      if (o.parent && out.has(o.parent) && !out.has(o.id)) {
        out.add(o.id)
        grew = true
      }
  }
  return out
}

function applySettings(
  scene: Scene3D,
  p: Partial<
    Pick<
      z.infer<typeof schemas.set_scene>,
      | 'background'
      | 'environment'
      | 'ground'
      | 'shadows'
      | 'camera'
      | 'shadowQuality'
      | 'exposure'
      | 'envIntensity'
      | 'envRotation'
      | 'toneMapping'
      | 'post'
    >
  >,
) {
  if (p.background !== undefined) scene.background = p.background
  if (p.environment) scene.environment = p.environment
  if (p.shadows !== undefined) scene.shadows = p.shadows
  if (p.shadowQuality) scene.shadowQuality = p.shadowQuality
  if (p.exposure !== undefined) scene.exposure = p.exposure
  if (p.envIntensity !== undefined) scene.envIntensity = p.envIntensity
  if (p.envRotation !== undefined) scene.envRotation = p.envRotation
  if (p.toneMapping) scene.toneMapping = p.toneMapping
  if (p.post) scene.post = { ...scene.post, ...Object.fromEntries(Object.entries(p.post).filter(([, v]) => v !== undefined)) }
  if (p.ground) scene.ground = { ...scene.ground, ...Object.fromEntries(Object.entries(p.ground).filter(([, v]) => v !== undefined)) }
  if (p.camera)
    scene.camera = {
      ...scene.camera,
      ...Object.fromEntries(Object.entries(p.camera).filter(([, v]) => v !== undefined)),
    } as Scene3D['camera']
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
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
  )
  const camPos = new THREE.Vector3(...scene.camera.position)
  const visible = scene.objects.filter((o) => o.kind !== 'light' && o.visible)
  for (const o of visible) {
    const b = bounds.get(o.id)
    if (o.kind === 'group') {
      if (!scene.objects.some((c) => c.parent === o.id)) warnings.push(at(o, 'is an empty group'))
      continue
    }
    if (!b || o.scale.some((v) => Math.abs(v) < 1e-4)) {
      issues.push(at(o, 'has no size (check params and scale)'))
      continue
    }
    if (b.containsPoint(camPos)) issues.push(at(o, 'surrounds the camera, so it blocks the view'))
    if (scene.ground.visible && b.min.y < scene.ground.y - 0.02 && o.geometry !== 'plane' && o.geometry !== 'circle')
      issues.push(at(o, `sinks ${round(scene.ground.y - b.min.y)} below the ground (lowest point y=${round(b.min.y)})`))
  }
  // Framing and floating are judged on whole top-level objects, so parts of a group are not reported one by one.
  const tops = visible.filter((o) => !o.parent)
  const topBox = (o: Obj3D) => {
    const box = new THREE.Box3()
    for (const id of descendantsOf(scene, [o.id])) {
      const b = bounds.get(id)
      if (b) box.union(b)
    }
    return box
  }
  for (const o of tops) {
    const b = topBox(o)
    if (b.isEmpty()) continue
    if (!frustum.intersectsBox(b)) issues.push(at(o, 'is outside the camera view (use set_scene frame, or move it)'))
    else {
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
        (i) => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z),
      )
      if (!corners.every((c) => frustum.containsPoint(c))) warnings.push(at(o, 'is partly cut off by the frame'))
    }
    if (scene.ground.visible && !o.animate && !o.keyframes?.length && b.min.y > scene.ground.y + 0.05) {
      const near = b.clone().expandByScalar(0.03)
      if (!tops.some((x) => x !== o && near.intersectsBox(topBox(x))))
        warnings.push(at(o, `floats ${round(b.min.y - scene.ground.y)} above the ground touching nothing`))
    }
  }
}

/** Stores a rendered image or video and places it on the canvas right of its scene. Returns the new node id. */
async function placeOutput(sceneId: string, blob: Blob, name: string, type: 'image' | 'video') {
  const scene = s().doc.nodes[sceneId]
  const src = await storeFile(blob, name, s().doc.id)
  const w = Math.min(scene.w, 800),
    h = Math.round((w * scene.h) / scene.w)
  const taken = Object.values(s().doc.nodes).filter(
    (x) => x.parentId === scene.parentId && x.x >= scene.x + scene.w && x.y < scene.y + h && x.y + x.h > scene.y,
  )
  const x = Math.max(scene.x + scene.w, ...taken.map((t) => t.x + t.w)) + 40
  const node = s().addNode(type, { name, src, x, y: scene.y, w, h }, scene.parentId)
  createdIds.push(node.id)
  return node.id
}

/** Search results by id, so imports use the real download URL rather than one the model retyped. */
const found = new Map<string, DiscoverItem>()

/** Image node ids to act on: the given ones, else the selection. Throws when none are images. */
const imageIds = (ids?: string[]) => {
  const targets = (ids?.length ? ids : s().selection).filter((id) => s().doc.nodes[id]?.type === 'image')
  if (!targets.length) throw new Error('No image nodes: pass ids or select an image')
  return targets
}

const brushOf = (b: { size: number; hardness?: number; opacity?: number }) => ({
  size: b.size,
  hardness: b.hardness ?? 0.8,
  opacity: b.opacity ?? 1,
})

const implFns = {
  get_document() {
    const { doc, pageId, selection } = s()
    const page = doc.pages.find((p) => p.id === pageId)!
    return {
      page: page.name,
      pageId,
      selection,
      nodes: page.children
        .map((c) => doc.nodes[c])
        .filter(Boolean)
        .map(summarize),
    }
  },
  async verify_design({ ids }: z.infer<typeof schemas.verify_design>) {
    const { doc, pageId } = s()
    const roots = ids?.length
      ? ids.map((id) => doc.nodes[id]).filter((n): n is SNode => !!n)
      : doc.pages
          .find((p) => p.id === pageId)!
          .children.map((c) => doc.nodes[c])
          .filter((n): n is SNode => !!n)
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
    return {
      ok: issues.length === 0,
      checked: roots.map((r) => r.name),
      issues: issues.slice(0, 20),
      more: Math.max(0, issues.length - 20),
      warnings: warnings.slice(0, 10),
    }
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
    const right = childrenOf(doc, pageId)
      .filter((id) => doc.nodes[id])
      .map((id) => absRect(doc, id))
      .reduce((m, r) => Math.max(m, r.x + r.w + 80), 0)
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
  async remove_background({ ids, restore }: z.infer<typeof schemas.remove_background>) {
    const targets = (ids?.length ? ids : s().selection).filter((id) => s().doc.nodes[id]?.type === 'image')
    if (!targets.length) throw new Error('No image nodes to process: pass ids or select one')
    if (restore) return { restored: restoreBackground(targets) }
    return {
      cutOut: await removeBackground(targets),
      note: 'Background is now transparent; the original is kept and can be restored with restore: true.',
    }
  },
  adjust_image({ ids, preset, reset, ...values }: z.infer<typeof schemas.adjust_image>) {
    const targets = (ids?.length ? ids : s().selection).filter((id) => ['image', 'video'].includes(s().doc.nodes[id]?.type ?? ''))
    if (!targets.length) throw new Error('No image or video nodes to adjust: pass ids or select one')
    const base = preset ? IMAGE_PRESETS[preset] : undefined
    s().updateNodes(targets, (n) => void (n.adjust = { ...(reset || base ? base : n.adjust), ...values }))
    return { adjusted: targets, adjust: s().doc.nodes[targets[0]].adjust ?? {} }
  },
  async place_image({ src, name, parentId, x, y, w, h }: z.infer<typeof schemas.place_image>) {
    const blob = await readFile(src)
    if (!blob) throw new Error('Could not read the image')
    if (!blob.type.startsWith('image/')) throw new Error(`The file is not an image (${blob.type || 'unknown type'})`)
    const bitmap = await createImageBitmap(blob)
    const natural = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    const width = w ?? natural.width
    const height = h ?? (width * natural.height) / natural.width
    const ref = await storeFile(blob, name ?? src.split('/').pop()?.split('?')[0] ?? 'image', s().doc.id)
    const node = s().addNode('image', { name: name ?? 'Image', src: ref, x: x ?? 0, y: y ?? 0, w: width, h: height }, parentOk(parentId))
    return { id: node.id, w: width, h: height, pixels: natural }
  },
  async inspect_image({ ids }: z.infer<typeof schemas.inspect_image>) {
    const images = []
    for (const id of imageIds(ids)) {
      const n = s().doc.nodes[id]
      const { canvas } = await readPixels(id)
      const sel = activeSelection(id)
      images.push({
        id,
        name: n.name,
        pixels: { width: canvas.width, height: canvas.height },
        scale: +(n.w / canvas.width).toFixed(4),
        adjust: n.adjust ?? {},
        hasLayerMask: !!n.layerMask,
        hasOriginal: !!n.origSrc,
        selection: sel ? maskSummary(sel) : null,
      })
    }
    return { images }
  },
  async crop_image({ ids, x, y, w, h }: z.infer<typeof schemas.crop_image>) {
    const cropped = await transformImages(imageIds(ids), (c) => {
      const left = Math.floor(Math.min(x, c.width - 1))
      const top = Math.floor(Math.min(y, c.height - 1))
      const width = Math.floor(Math.min(w, c.width - left))
      const height = Math.floor(Math.min(h, c.height - top))
      if (width < 1 || height < 1) throw new Error('The crop is outside the image')
      return cropCanvas(c, left, top, width, height)
    })
    return { cropped }
  },
  async straighten_image({ ids, degrees, crop }: z.infer<typeof schemas.straighten_image>) {
    const straightened = await transformImages(imageIds(ids), (c) => straightenCanvas(c, degrees, crop ?? true))
    return { straightened, degrees }
  },
  async resize_image({ ids, width, height, resample, smooth, resolution }: z.infer<typeof schemas.resize_image>) {
    const targets = imageIds(ids)
    if (resample === false) {
      // Image size without resampling: the pixels stay, and the print size follows the resolution.
      const dpi = resolution ?? 300
      const sized = []
      for (const id of targets) {
        const canvas = await decode(s().doc.nodes[id].src)
        s().updateNodes([id], { w: (canvas.width / dpi) * 96, h: (canvas.height / dpi) * 96 })
        sized.push(id)
      }
      return { resized: sized, resolution: dpi }
    }
    if (!width && !height) throw new Error('Give a width or a height')
    const resized = await transformImages(
      targets,
      (c) => {
        const w = width ?? Math.round((c.width * (height as number)) / c.height)
        const h = height ?? Math.round((c.height * width!) / c.width)
        return resizeCanvas(c, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), smooth ?? true)
      },
      { keepSize: true },
    )
    return { resized }
  },
  async canvas_size({ ids, width, height, anchor, relative }: z.infer<typeof schemas.canvas_size>) {
    const sized = await transformImages(imageIds(ids), (c) => {
      const w = relative ? c.width + (width ?? 0) : (width ?? c.width)
      const h = relative ? c.height + (height ?? 0) : (height ?? c.height)
      if (w < 1 || h < 1) throw new Error('The canvas must stay at least 1 px')
      return extendCanvas(c, w, h, anchor ?? 'center')
    })
    return { canvas: sized }
  },
  async paint_image({ ids, target, initial, strokes }: z.infer<typeof schemas.paint_image>) {
    const painted = await editPixels(
      imageIds(ids),
      (px) => {
        for (const st of strokes) {
          if (st.mode === 'erase' && st.key) {
            backgroundEraseStroke(px, st.points as Point[], brushOf(st), hexRgb(st.key), st.tolerance ?? 32)
            continue
          }
          const color: RGB | undefined =
            st.mode === 'erase' ? undefined : target === 'mask' ? [255, 255, 255] : hexRgb(st.color ?? s().foregroundColor)
          paintStroke(px, st.points as Point[], brushOf(st), color)
        }
      },
      { target, initial },
    )
    return {
      painted,
      strokes: strokes.length,
      note: target === 'mask' ? 'Layer mask updated: opaque shows the image, transparent hides it.' : undefined,
    }
  },
  async clone_image({ ids, strokes }: z.infer<typeof schemas.clone_image>) {
    const cloned = await editPixels(imageIds(ids), (px) => {
      for (const st of strokes) {
        // Each stroke samples the pixels as they were before it, so a stroke never clones its own output.
        const source: Pixels = { width: px.width, height: px.height, data: px.data.slice() }
        cloneStroke(px, source, st.points as Point[], st.from as Point, brushOf(st))
      }
    })
    return { cloned }
  },
  async heal_image({ ids, spots }: z.infer<typeof schemas.heal_image>) {
    const healed = await editPixels(imageIds(ids), (px) => {
      for (const sp of spots) healSpot(px, sp.x, sp.y, sp.size / 2)
    })
    return { healed, spots: spots.length }
  },
  async fill_image({ ids, selection }: z.infer<typeof schemas.fill_image>) {
    const targets = imageIds(ids)
    if (selection) for (const id of targets) await selectPixels(id, 'replace', toSelection(selection))
    const withSelection = targets.filter((id) => activeSelection(id))
    if (!withSelection.length) throw new Error('Nothing selected to fill: pass a selection or use select_pixels first')
    const filled = await editPixels(withSelection, (px, sel) => {
      if (sel) fillMask(px, sel)
    })
    return { filled, note: 'Smooth fill from the surroundings. For texture, use clone_image or heal_image.' }
  },
  async pick_color({ ids, x, y }: z.infer<typeof schemas.pick_color>) {
    const [id] = imageIds(ids)
    const { px } = await readPixels(id)
    return { id, x, y, ...pickColor(px, Math.floor(x), Math.floor(y)) }
  },
  async vibrance_image({ ids, amount }: z.infer<typeof schemas.vibrance_image>) {
    const adjusted = await editPixels(imageIds(ids), (px) => vibrance(px, amount))
    return { adjusted }
  },
  async hue_saturation_image({ ids, hue, saturation, lightness }: z.infer<typeof schemas.hue_saturation_image>) {
    const adjusted = await editPixels(imageIds(ids), (px) => hueSaturation(px, hue ?? 0, saturation ?? 0, lightness ?? 0))
    return { adjusted }
  },
  add_shape({ shape, name, parentId, x, y, w, h, fill }: z.infer<typeof schemas.add_shape>) {
    const width = w ?? 120
    const height = h ?? 120
    const node = s().addNode(
      'vector',
      {
        name: name ?? shape,
        x: x ?? 0,
        y: y ?? 0,
        w: width,
        h: height,
        path: translatePath(SHAPE_PATHS[shape], 0, 0, width / 100, height / 100),
        fills: [solid(fill ?? '#111111')],
      },
      parentOk(parentId),
    )
    return { id: node.id, w: width, h: height }
  },
  arrange_nodes({ ids, direction }: z.infer<typeof schemas.arrange_nodes>) {
    const targets = ids?.length ? ids : s().selection
    if (!targets.length) throw new Error('Nothing to arrange: pass ids or select nodes')
    s().select(targets)
    s().arrange(direction)
    return { arranged: targets, direction }
  },
  group_nodes({ ids, ungroup }: z.infer<typeof schemas.group_nodes>) {
    const targets = ids?.length ? ids : s().selection
    if (!targets.length) throw new Error('Nothing to group: pass ids or select nodes')
    s().select(targets)
    if (ungroup) {
      s().ungroup(targets)
      return { ungrouped: targets }
    }
    s().group(targets)
    return { grouped: s().selection }
  },
  get_history() {
    return { undoSteps: s().past.length, redoSteps: s().future.length }
  },
  set_colors({ foreground, background, swap }: z.infer<typeof schemas.set_colors>) {
    const st = s()
    let fg = foreground ?? st.foregroundColor
    let bg = background ?? st.backgroundColor
    hexRgb(fg)
    hexRgb(bg)
    if (swap) [fg, bg] = [bg, fg]
    st.set({ foregroundColor: fg, backgroundColor: bg })
    return { foreground: fg, background: bg }
  },
  list_swatches() {
    return { swatches: SWATCHES }
  },
  revert_image({ ids, layerMask }: z.infer<typeof schemas.revert_image>) {
    return { reverted: revertImages(imageIds(ids), { mask: layerMask }) }
  },
  async select_pixels({ ids, mode, selection, refine }: z.infer<typeof schemas.select_pixels>) {
    const results: Record<string, ReturnType<typeof maskSummary> | null> = {}
    for (const id of imageIds(ids)) {
      const mask = await selectPixels(id, mode ?? 'replace', selection && toSelection(selection), refine)
      results[id] = mask ? maskSummary(mask) : null
    }
    return { selections: results, ...(mode === 'layerMask' && { layerMask: 'set from the selection' }) }
  },
  undo() {
    s().undo()
    return { undone: true }
  },
  redo() {
    s().redo()
    return { redone: true }
  },
  set_view({ zoom, fit }: z.infer<typeof schemas.set_view>) {
    const st = s()
    if (fit) st.zoomToFit(st.selection.length ? st.selection : undefined)
    else if (zoom !== undefined) st.zoomTo(zoom)
    return { zoom: s().camera.zoom }
  },
  async export_image({ ids, format, scale }: z.infer<typeof schemas.export_image>) {
    const targets = ids?.length ? ids : s().selection
    if (!targets.length) throw new Error('Nothing to export: pass ids or select nodes')
    await exportNodes(targets, [{ id: uid(), format: format ?? 'png', scale: scale ?? 1, suffix: '' }])
    return { exported: targets, format: format ?? 'png' }
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
    const right =
      parent === pageId
        ? childrenOf(doc, pageId)
            .filter((id) => doc.nodes[id])
            .map((id) => absRect(doc, id))
            .reduce((m, r) => Math.max(m, r.x + r.w + 80), 0)
        : 0
    const scene = emptyScene()
    applySettings(scene, settings)
    const out = { ids: {} as Record<string, string>, ground: [] as string[] }
    addSpecs(scene, objects, null, out)
    // Without lights of its own the scene gets a soft key light so shapes read in 3D.
    if (!scene.objects.some((o) => o.kind === 'light')) {
      addSpecs(
        scene,
        [
          { id: 'key-light', kind: 'light', light: { type: 'directional', intensity: 2.2, castShadow: true }, position: [4, 7, 5] },
          { id: 'sky-light', kind: 'light', light: { type: 'hemisphere', intensity: 0.6, groundColor: '#94a3b8' }, position: [0, 5, 0] },
        ],
        null,
        { ids: {}, ground: [] },
      )
    }
    await dropToGround(scene, out.ground)
    applySettings(scene, { camera })
    if (!camera?.position) scene.camera = await measureScene(scene, (r) => fitCamera(r, w / h, camera?.fov ?? 40))
    const node = s().addNode('shape3d', { name, x: x ?? right, y: y ?? 0, w, h, scene }, parent)
    createdIds.push(node.id)
    showScene(node.id)
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
      scene.camera = await measureScene(scene, (r) => fitCamera(r, n.w / Math.max(n.h, 1), scene.camera.fov, VIEW_DIRS[frame]))
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
          id: o.id,
          name: o.name,
          kind: o.kind,
          ...(o.parent && { parent: o.parent }),
          ...(o.geometry && { geometry: o.geometry, params: o.params }),
          ...(o.mesh && { mesh: `${o.mesh.positions.length / 3} vertices, ${o.mesh.indices.length / 3} triangles` }),
          position: o.position,
          ...(o.rotation.some(Boolean) && { rotation: o.rotation }),
          ...(o.scale.some((v) => v !== 1) && { scale: o.scale }),
          ...(o.material && { color: o.material.color, metalness: o.material.metalness, roughness: o.material.roughness }),
          ...(o.light && { light: o.light }),
          ...(o.animate && { animate: o.animate }),
          ...(o.keyframes?.length && { keyframes: o.keyframes.length, keyframeSpan: [o.keyframes[0].t, o.keyframes.at(-1)!.t] }),
          ...(!o.visible && { visible: false }),
          ...(b && { worldMin: rv(b.min), worldMax: rv(b.max) }),
        }
      }),
    }
  },
  async search_3d_models({ query, collection, limit = 12 }: z.infer<typeof schemas.search_3d_models>) {
    const { items } = await searchModels({ q: query, unit: collection })
    for (const i of items) found.set(i.id, i)
    return {
      count: items.length,
      models: items.slice(0, limit).map((i) => ({ id: i.id, title: i.title, ...(i.thumb && { thumb: i.thumb }) })),
      source: 'Smithsonian Open Access (CC0)',
    }
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
  async render_scene({ sceneId, view, time, width, supersample, wireframe, only, projection }: z.infer<typeof schemas.render_scene>) {
    const n = s().doc.nodes[sceneId]
    const image = await renderScene(sceneNode(sceneId), n.w, n.h, view ?? 'camera', time ?? 0, Math.min(4096, width ?? 768), {
      supersample,
      wireframe,
      only,
      ortho: projection === 'orthographic',
    })
    return { image, mediaType: 'image/png' }
  },
  async render_turntable({ sceneId, count, object, elevation, zoom, time, only }: z.infer<typeof schemas.render_turntable>) {
    const n = s().doc.nodes[sceneId]
    const scene = sceneNode(sceneId)
    const steps = Math.max(4, Math.min(12, Math.round(count ?? 8)))
    const views = await Promise.all(
      Array.from({ length: steps }, async (_, i) => {
        const azimuth = Math.round((360 * i) / steps)
        return {
          label: `${azimuth}°`,
          camera: await lookCamera(scene, n.w / Math.max(n.h, 1), { object, azimuth, elevation: elevation ?? 15, zoom }),
        }
      }),
    )
    const image = await renderViews(scene, n.w, n.h, views, time ?? 0, { only })
    return {
      image,
      mediaType: 'image/png',
      note: 'Angles are degrees around the subject: 0° is the front, 90° the right side, 180° the back, 270° the left.',
    }
  },
  async subdivide_mesh({ sceneId, id, levels }: z.infer<typeof schemas.subdivide_mesh>) {
    const scene = structuredClone(sceneNode(sceneId))
    const o = meshObject(scene, id)
    o.mesh = subdivideMesh(o.mesh!, levels ?? 1)
    saveScene(sceneId, scene)
    return { id, ...meshStats(o.mesh) }
  },
  async sculpt_mesh({ sceneId, id, strokes }: z.infer<typeof schemas.sculpt_mesh>) {
    const scene = structuredClone(sceneNode(sceneId))
    const o = meshObject(scene, id)
    // Strokes are given in world space; the mesh lives in the object's own space.
    const inv = worldMatrix(scene, o).invert()
    const k = Math.cbrt(Math.abs(new THREE.Matrix4().copy(inv).determinant())) || 1
    o.mesh = sculptMesh(
      o.mesh!,
      strokes.map((st) => {
        const c = new THREE.Vector3(...(st.at as Vec3)).applyMatrix4(inv)
        return { brush: st.brush, center: [c.x, c.y, c.z] as [number, number, number], radius: st.radius * k, strength: st.strength }
      }),
    )
    saveScene(sceneId, scene)
    return { id, strokes: strokes.length, ...meshStats(o.mesh) }
  },
  async paint_mesh({ sceneId, id, ops }: z.infer<typeof schemas.paint_mesh>) {
    const scene = structuredClone(sceneNode(sceneId))
    const o = meshObject(scene, id)
    const inv = worldMatrix(scene, o).invert()
    const k = Math.cbrt(Math.abs(new THREE.Matrix4().copy(inv).determinant())) || 1
    const local = (v: number[]) => {
      const c = new THREE.Vector3(...(v as Vec3)).applyMatrix4(inv)
      return [c.x, c.y, c.z] as [number, number, number]
    }
    const mapped: PaintOp[] = ops.map((op) => {
      if (op.kind === 'brush') return { ...op, center: local(op.at), radius: op.radius * k }
      if (op.kind === 'patches')
        return {
          ...op,
          scale: op.scale === undefined ? undefined : op.scale * k,
          region: op.region && { center: local(op.region.at), radius: op.region.radius * k },
          yRange: op.yRange as [number, number] | undefined,
        }
      return { ...op, scale: op.scale === undefined ? undefined : op.scale * k }
    })
    o.mesh = paintMesh(o.mesh!, new THREE.Color(o.material?.color ?? DEFAULT_MATERIAL.color), mapped)
    o.material = { ...DEFAULT_MATERIAL, ...o.material, vertexColors: true }
    saveScene(sceneId, scene)
    return {
      id,
      painted: ops.length,
      vertices: o.mesh.positions.length / 3,
      note: 'Painted as vertex colours; the detail is as fine as the vertex density (subdivide_mesh for sharper edges).',
    }
  },
  set_fur({ sceneId, id, remove, length, layers, density, tipColor }: z.infer<typeof schemas.set_fur>) {
    const scene = structuredClone(sceneNode(sceneId))
    const o = scene.objects.find((x) => x.id === id)
    if (!o || o.kind !== 'mesh') throw new Error(`No mesh object ${id} in this scene`)
    if (remove) delete o.fur
    else
      o.fur = {
        length: length ?? o.fur?.length ?? 0.015,
        layers: layers ?? o.fur?.layers ?? 10,
        density: density ?? o.fur?.density ?? 40,
        ...((tipColor ?? o.fur?.tipColor) && { tipColor: tipColor ?? o.fur?.tipColor }),
      }
    saveScene(sceneId, scene)
    return {
      id,
      fur: o.fur ?? null,
      note: 'Fur is drawn as shells over the surface. For a soft coat also set material sheen and a low specularIntensity.',
    }
  },
  async set_lighting({ sceneId, preset, subject, intensity, replace }: z.infer<typeof schemas.set_lighting>) {
    const scene = structuredClone(sceneNode(sceneId))
    const bounds = await measureScene(scene, objectBounds)
    const all = new THREE.Box3()
    for (const [oid, b] of bounds) if (!subject || oid === subject) all.union(b)
    if (all.isEmpty()) all.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1))
    const sphere = all.getBoundingSphere(new THREE.Sphere())
    const c = sphere.center,
      d = Math.max(sphere.radius * 3, 3),
      m = intensity ?? 1
    if (replace !== false) scene.objects = scene.objects.filter((o) => o.kind !== 'light')
    const rig = (name: string, light: Light3D, dir: Vec3, near = false) => {
      // Directional lights aim at the origin, so only the direction matters; spots and points sit around the subject.
      const pos: Vec3 = near ? [c.x + dir[0] * d, c.y + dir[1] * d, c.z + dir[2] * d] : [dir[0] * d, dir[1] * d, dir[2] * d]
      scene.objects.push({
        id: `light-${uid().slice(0, 6)}`,
        name,
        kind: 'light',
        parent: null,
        position: pos.map((v) => Math.round(v * 100) / 100) as Vec3,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        light: { ...light, intensity: light.intensity * m },
      })
    }
    const base = { castShadow: false }
    if (preset === 'three-point') {
      rig('Key light', { type: 'directional', color: '#fff1e0', intensity: 2.4, castShadow: true, size: 5 }, [0.7, 0.9, 1])
      rig('Fill light', { type: 'directional', color: '#d6e4ff', intensity: 0.7, ...base, size: 6 }, [-1, 0.35, 0.8])
      rig('Rim light', { type: 'directional', color: '#ffffff', intensity: 1.6, ...base }, [-0.4, 0.7, -1])
      rig('Ambient', { type: 'hemisphere', color: '#e8eefc', groundColor: '#3a3a44', intensity: 0.25, ...base }, [0, 1, 0])
    } else if (preset === 'soft-studio') {
      rig('Soft key', { type: 'directional', color: '#fff7ee', intensity: 2.2, castShadow: true, size: 10 }, [0.3, 1, 0.9])
      rig('Hemisphere', { type: 'hemisphere', color: '#ffffff', groundColor: '#666670', intensity: 0.7, ...base }, [0, 1, 0])
      rig('Low fill', { type: 'directional', color: '#e0e8ff', intensity: 0.5, ...base, size: 8 }, [-0.6, 0.2, 1])
    } else if (preset === 'dramatic') {
      rig('Hard key', { type: 'directional', color: '#ffe9cf', intensity: 3.4, castShadow: true, size: 0.5 }, [1, 0.6, 0.5])
      rig('Rim light', { type: 'directional', color: '#9bb8ff', intensity: 2.4, ...base }, [-0.8, 0.5, -1])
      rig('Ambient', { type: 'hemisphere', color: '#27304a', groundColor: '#0b0b10', intensity: 0.2, ...base }, [0, 1, 0])
      scene.envIntensity = 0.15
    } else {
      rig('Top softbox', { type: 'directional', color: '#ffffff', intensity: 2.6, castShadow: true, size: 8 }, [0.1, 1, 0.4])
      rig('Left fill', { type: 'directional', color: '#f1f5ff', intensity: 0.9, ...base, size: 6 }, [-1, 0.4, 0.5])
      rig('Right fill', { type: 'directional', color: '#fff6ea', intensity: 0.9, ...base, size: 6 }, [1, 0.4, 0.5])
      rig('Rim light', { type: 'directional', color: '#ffffff', intensity: 1.4, ...base }, [0, 0.6, -1])
    }
    scene.shadows = true
    saveScene(sceneId, scene)
    return {
      preset,
      lights: scene.objects.filter((o) => o.kind === 'light').map((o) => o.name),
      note: 'Check it with render_scene or render_views; tune individual lights with update_objects, exposure with set_scene.',
    }
  },
  add_character({ sceneId, id, name, position, facing, ...look }: z.infer<typeof schemas.add_character>) {
    const scene = structuredClone(sceneNode(sceneId))
    let cid = id?.trim() || `person-${uid().slice(0, 4)}`
    while (scene.objects.some((o) => o.id === cid || o.id.startsWith(`${cid}-`))) cid = `${cid}-${uid().slice(0, 3)}`
    const defined = Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined))
    const parts = buildCharacter(
      cid,
      name ?? cid,
      { ...DEFAULT_LOOK, ...defined },
      [position?.[0] ?? 0, scene.ground.y, position?.[1] ?? 0],
      facing ?? 0,
    )
    scene.objects.push(...parts)
    saveScene(sceneId, scene)
    return {
      characterId: cid,
      parts: parts.length,
      joints: 'hips, spine, neck, shoulder-l/r, elbow-l/r, leg-l/r, knee-l/r (ids prefixed with the character id)',
    }
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
      const keys = [...(tr.append ? (o.keyframes ?? []) : []), ...(tr.keyframes as Keyframe3D[])].sort((a, b) => a.t - b.t)
      o.keyframes = keys.length ? keys : undefined
    }
    if (camera) scene.cameraKeys = camera.length ? ([...camera].sort((a, b) => a.t - b.t) as Scene3D['cameraKeys']) : undefined
    if (duration !== undefined) scene.duration = duration || undefined
    saveScene(sceneId, scene)
    return { duration: sceneDuration(scene) }
  },
  async render_views({ sceneId, views, time }: z.infer<typeof schemas.render_views>) {
    const n = s().doc.nodes[sceneId]
    const image = await renderViews(sceneNode(sceneId), n.w, n.h, views ?? ALL_ANGLES.slice(0, 6), time ?? 0)
    return { image, mediaType: 'image/png' }
  },
  async snapshot_view({ sceneId, label, camera, look, time, reset }: z.infer<typeof schemas.snapshot_view>) {
    const n = s().doc.nodes[sceneId]
    const scene = sceneNode(sceneId)
    if (reset) clearSnapshot(sceneId, label)
    const before = getSnapshot(sceneId, label)
    const w = n.w,
      h = n.h
    let cam: Scene3D['camera']
    if (camera) cam = { position: camera.position as Vec3, target: camera.target as Vec3, fov: camera.fov ?? scene.camera.fov }
    else if (!look && before) cam = before.camera
    else {
      cam = await lookCamera(scene, w / Math.max(h, 1), look)
    }
    const image = await renderScene(scene, w, h, cam, time ?? 0)
    setSnapshot(sceneId, label, { image, camera: cam, time: time ?? 0 })
    if (!before)
      return {
        image,
        mediaType: 'image/png',
        saved: `Baseline "${label}" saved. After you change the scene, call snapshot_view again with the same label to compare.`,
        camera: cam,
      }
    const cmp = await compareImages(before.image, image)
    return {
      image: cmp.image,
      mediaType: 'image/png',
      compared: `before | after | changes for "${label}"`,
      changedPercent: cmp.changedPercent,
      changedRegion: cmp.changedRegion,
      camera: cam,
    }
  },
  async join_meshes({ sceneId, ids, name, removeOriginals }: z.infer<typeof schemas.join_meshes>) {
    const scene = structuredClone(sceneNode(sceneId))
    const pieces = await piecesFor(scene, ids)
    const data = joinPieces(pieces)
    const id = addMeshObject(scene, data, name ?? 'Joined mesh', pieces[0].color)
    retire(scene, ids, removeOriginals)
    saveScene(sceneId, scene)
    return {
      id,
      ...meshStats(data),
      note: 'Parts are one mesh object now but stay separate shells; use fuse_objects to make them one continuous surface.',
    }
  },
  async fuse_objects({ sceneId, ids, operation, resolution, smooth, name, removeOriginals }: z.infer<typeof schemas.fuse_objects>) {
    const scene = structuredClone(sceneNode(sceneId))
    const op = operation ?? 'union'
    if (op !== 'union' && ids.length < 2) throw new Error(`${op} needs at least two objects`)
    const operands = await Promise.all(ids.map((i) => piecesFor(scene, [i])))
    const data = voxelMesh(operands, op, {
      resolution: Math.max(16, Math.min(128, Math.round(resolution ?? 64))),
      smooth: Math.max(0, Math.min(4, smooth ?? 1)),
    })
    const id = addMeshObject(
      scene,
      data,
      name ?? (op === 'union' ? 'Fused mesh' : `${op[0].toUpperCase()}${op.slice(1)} mesh`),
      operands[0][0].color,
    )
    retire(scene, ids, removeOriginals)
    saveScene(sceneId, scene)
    return {
      id,
      operation: op,
      ...meshStats(data),
      note: 'One continuous surface. Check it from several angles with render_views; smooth_mesh rounds it further.',
    }
  },
  async smooth_mesh({ sceneId, id, iterations, strength }: z.infer<typeof schemas.smooth_mesh>) {
    const scene = structuredClone(sceneNode(sceneId))
    const o = meshObject(scene, id)
    o.mesh = smoothMesh(o.mesh!, Math.max(1, Math.min(20, Math.round(iterations ?? 3))), Math.max(0, Math.min(1, strength ?? 0.5)))
    saveScene(sceneId, scene)
    return { id, ...meshStats(o.mesh) }
  },
  async clean_mesh({ sceneId, id, weldDistance }: z.infer<typeof schemas.clean_mesh>) {
    const scene = structuredClone(sceneNode(sceneId))
    const o = meshObject(scene, id)
    const p = o.mesh!.positions
    let extent = 0
    for (let a = 0; a < 3; a++) {
      let lo = Infinity,
        hi = -Infinity
      for (let i = a; i < p.length; i += 3) {
        lo = Math.min(lo, p[i])
        hi = Math.max(hi, p[i])
      }
      extent = Math.max(extent, hi - lo)
    }
    const result = cleanMesh(o.mesh!, weldDistance ?? Math.max(extent * 0.001, 1e-5))
    o.mesh = result.mesh
    saveScene(sceneId, scene)
    return {
      id,
      weldedVertices: result.welded,
      removedDegenerate: result.degenerate,
      removedDuplicate: result.duplicate,
      ...meshStats(result.mesh),
    }
  },
  async export_mesh({ sceneId, format }: z.infer<typeof schemas.export_mesh>) {
    sceneNode(sceneId)
    return exportScene(format, sceneId)
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
    const w = width ?? (height ? Math.round((height * n.w) / n.h) : n.w),
      h = height ?? Math.round((w * n.h) / n.w)
    const image = await renderScene(sceneNode(sceneId), w, h, view ?? 'camera', time ?? 0, 4096)
    const blob = await (await fetch(`data:image/png;base64,${image}`)).blob()
    const name = `${n.name} ${time ? `${time}s` : 'still'}.png`
    const nodeId = await placeOutput(sceneId, blob, name, 'image')
    if (download) downloadBlob(blob, name)
    return { image, mediaType: 'image/png', imageNodeId: nodeId }
  },
  async record_video({ sceneId, duration, fps, view, width, height, download }: z.infer<typeof schemas.record_video>) {
    const n = s().doc.nodes[sceneId]
    const w = width ?? (height ? Math.round((height * n.w) / n.h) : n.w),
      h = height ?? Math.round((w * n.h) / n.w)
    const toastId = toast.loading('Recording video…')
    try {
      const v = await recordScene(sceneNode(sceneId), w, h, {
        duration,
        fps,
        view: view ?? 'camera',
        max: 1920,
        onProgress: (f) => toast.loading(`Recording video… ${Math.round(f * 100)}%`, { id: toastId }),
      })
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

/** Records each tool call as a labelled undo step ("Crop image"), so the history list says what changed. */
function withHistoryLabels<T extends Record<string, (...args: never[]) => unknown>>(fns: T): T {
  const wrapped = Object.fromEntries(
    Object.entries(fns).map(([name, fn]) => [
      name,
      (...args: unknown[]) => {
        const label = name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
        const clear = () => useS3D.setState({ nextLabel: null })
        useS3D.setState({ nextLabel: label })
        const out = (fn as (...a: unknown[]) => unknown)(...args)
        if (out instanceof Promise) return out.finally(clear)
        clear()
        return out
      },
    ]),
  )
  return wrapped as unknown as T
}

export const impl = withHistoryLabels(implFns)

export const DESCRIPTIONS: Record<keyof typeof impl, string> = {
  verify_design:
    'Check scenes and screens for problems: 3D objects sinking into the ground, outside the camera, zero-size, unlit scenes; 2D children spilling out of frames, empty or overlapping text. Returns ok, issues to fix (3D issues carry sceneId + object id) and warnings that may be intentional.',
  create_scene:
    'Create a 3D scene viewport and build its objects in one call (meshes, groups with children, lights, GLB models). Objects without a y position rest on the ground; the camera frames everything unless given. Returns the sceneId and object ids.',
  add_objects: 'Add objects (or a nested group) to an existing 3D scene.',
  update_objects: 'Change 3D objects by id: geometry, params, position, rotation, scale, material, light, animation, parent group.',
  delete_objects: 'Delete 3D objects (groups take their children).',
  set_scene: 'Change scene background, environment, ground, shadows or camera; frame re-aims the camera to show every object.',
  get_scene:
    'Read a 3D scene: settings, camera and every object with its world-space bounds (worldMin/worldMax), to reason about placement and contact.',
  search_3d_models:
    'Search the internet (Smithsonian open-access 3D collection) for real scanned 3D models. Returns ids, titles and thumbnail images.',
  ask_user:
    'Open a large centred chooser in front of the user and WAIT for their decision. Use it only to let them pick between 3D model search results (pass thumbs as images). For other questions use ask_questions. Returns { chosen: [option ids], message? } or { dismissed: true }.',
  import_3d_model: 'Download a model found with search_3d_models and add it to a scene (sceneId) or as a new scene.',
  render_scene:
    'Render the scene to an image and look at it (optionally at a timeline time). Use it to judge proportions, composition, colour and lighting from the camera or a preset view. Options: width up to 4096 and supersample for fine detail, wireframe to see the mesh, only to isolate objects, orthographic projection.',
  add_character:
    'Add a rigged person (head, hair, torso, arms, legs, shoes with joint pivots) standing at [x, z]. Set shirt/pants/skin/hair colours, height and build. Returns the characterId for animate_character.',
  animate_character:
    'Make a character act over time: walk/run to a point, turn, sit on a seat of given height, stand up, idle, wave, jump. Actions play in order and chain after earlier ones; the timeline grows to fit.',
  set_keyframes:
    'Keyframe any object over time (position, rotation degrees, scale, visible at t seconds) — doors opening, cars driving, things appearing — plus an optional camera path and the timeline duration. For endless rotation use update_objects animate spin instead.',
  render_views:
    'Render the scene from several angles (front, side, back, left, top, iso) in ONE labelled contact sheet. A model that looks right from the camera can be wrong from behind or above (missing back, floating parts, gaps, parts poking through), so check every side with this, not only render_scene.',
  snapshot_view:
    'Take a picture from a chosen viewpoint (an exact camera, or an object seen from an azimuth/elevation) under a label, and COMPARE it with the last picture of that label: you get before | after | what changed (red) and how much changed. Take one before a change, change the scene, take it again with the same label (the camera is reused) to see whether your edit did what you meant from that angle.',
  join_meshes:
    "Combine several objects (or groups) into ONE mesh object, keeping each part's colour as vertex colours. The parts stay separate shells; use fuse_objects to make a single connected surface.",
  fuse_objects:
    'Rebuild objects as ONE continuous surface by voxel remeshing: union fuses overlapping parts (legs into a body) with no seams, subtract cuts the other objects out of the first, intersect keeps the overlap. Colours carry over (later objects paint over earlier ones). Smoothing rounds the joints; raise resolution for fine detail. Works on closed shapes (box, sphere, capsule, cylinder…), not on open surfaces such as planes.',
  smooth_mesh: 'Smooth a joined or fused mesh (Taubin smoothing: rounds muscles and joints without shrinking it).',
  clean_mesh: 'Clean a joined or fused mesh: weld vertices that nearly touch and remove degenerate and duplicate triangles.',
  export_mesh: 'Download the scene as a 3D file: glb (colours, materials, lights), obj or stl (geometry only, for printing).',
  render_turntable:
    'Render the subject from 4-12 angles around it (degrees from the front) in one contact sheet: a turntable check that nothing is wrong from any side.',
  subdivide_mesh:
    'Subdivide a joined/fused mesh: four times the triangles per level and a rounder surface, so faceting disappears and there is detail to sculpt and paint.',
  sculpt_mesh:
    'Sculpt a mesh object with brush strokes at world positions: inflate/deflate (volume, muscle, wrinkles), smooth, pinch, crease (grooves, eyelids, nostrils). Subdivide first; strokes only move existing vertices.',
  paint_mesh:
    'Paint colours onto a mesh object: round brush strokes, irregular patches (cow markings, camouflage) with coverage/scale/seed, and subtle variation for dirt and imperfections. Detail follows vertex density.',
  set_fur:
    'Add short fur to a mesh object, drawn as shells: length, layers, density, tip colour. Pair it with material sheen and a low specularIntensity for a soft coat.',
  set_lighting:
    "Set up a lighting rig around the subject: three-point (warm soft key, cool fill, rim), soft-studio, dramatic or product. Replaces existing lights unless told not to. Light softness comes from each light's size.",
  render_timeline:
    'Render several moments of the animation in one contact sheet image to check the motion (positions, poses, contact with seats, framing) before recording.',
  capture_image:
    'Capture a still image of the scene at a time and view (any size up to 4096 px), save it as an image on the canvas beside the scene, optionally download it. Returns the image to look at.',
  record_video:
    'Record the scene animation (looping motion, keyframes, characters, camera path) to a video file, placed as a video node beside the scene and optionally downloaded. Usually records faster than the clip plays (hardware encoding).',
  get_document:
    'Read the current page as a node tree (ids, types, names, positions relative to parent, sizes, fills, text) plus the selection.',
  create_nodes:
    'Create nested nodes inside a parent (frame id) or on the page. Coordinates are relative to the parent. Children of auto-layout frames are positioned automatically.',
  update_nodes: 'Change properties of existing nodes by id.',
  delete_nodes: 'Delete nodes (and their children) by id.',
  create_screen:
    'Create a top-level screen frame (preset device size) placed to the right of existing frames, with optional children. Use once per screen/variation.',
  create_page: 'Create a new page and switch to it.',
  select_nodes: 'Select nodes on the canvas by id.',
  remove_background:
    'Remove the background of image nodes: detects the subject and makes everything else transparent (runs in the browser, the first use downloads a model). Keeps the original so restore: true undoes it. Works on any photo; no need to see the picture.',
  adjust_image:
    'Non-destructively adjust images or videos (Photoshop-style adjustment layer): preset looks, brightness, contrast, saturation, temperature, hue, blur, grayscale, sepia, invert. Does not alter the source file.',
  place_image:
    'Place a picture on the page or in a frame from a URL or data: URL (Photoshop File > Place). It becomes an image node you can edit with the other image tools.',
  inspect_image:
    "Read an image's source size in pixels, its scale (design px per source pixel), adjustments, layer mask, original and active selection. Use it before any pixel-coordinate tool.",
  crop_image: 'Crop images to a rectangle in source pixels (Photoshop Crop tool). The original is kept for revert_image.',
  straighten_image: 'Rotate an image by degrees (positive counter-clockwise) and crop to the largest upright area (Photoshop Straighten).',
  resize_image:
    'Image Size. With resample (default) change the pixel count (smooth or nearest); with resample false keep the pixels and set the print size from resolution (ppi).',
  canvas_size:
    'Canvas Size: grow or shrink the image canvas with transparent space around it, placed by anchor. relative adds or removes pixels on each side.',
  paint_image:
    'Brush and eraser on pixels, or on the layer mask (target mask: opaque shows the image, transparent hides it). Strokes are lists of points in source pixels with a size, hardness and opacity. An erase stroke with key is the background eraser: it only removes pixels close to the sampled colour. Limited to the active selection.',
  clone_image:
    'Clone stamp: paint with pixels copied from a sample point (from) at the same offset. Points and from are in source pixels. Limited to the active selection.',
  heal_image:
    'Spot healing: remove small blemishes, scratches or spots by blending texture from a nearby matching area. Give each spot a centre and a diameter in source pixels.',
  fill_image:
    'Content-aware fill (smooth version): fill the selection from its surroundings to remove objects. Use the active selection from select_pixels, or pass one. Clean on plain backgrounds; use clone_image or heal_image for texture.',
  pick_color: 'Eyedropper: the colour at a source pixel as hex, with its alpha.',
  vibrance_image:
    'Vibrance: boost muted colours without over-saturating the bright ones (negative desaturates). Limited to the active selection.',
  revert_image: 'Undo all pixel edits and return to the original file, or remove only the layer mask with layerMask.',
  select_pixels:
    'Marquee, lasso, magic wand and quick selections in source pixels (quick is a wand with a larger tolerance). Modes replace, add, subtract, intersect, invert, deselect, or layerMask (reveal selection as the layer mask). refine grows or contracts the edge and feathers it (Select & Mask). The selection stays active for paint, clone, heal, fill and vibrance until deselected.',
  hue_saturation_image:
    'Hue/Saturation/Lightness on pixels: shift hue (degrees), change saturation and lightness (-100..100). Baked into the image (the original is kept for revert_image). Limited to the active selection.',
  add_shape:
    'Place a Photoshop-style custom shape (heart, arrow, cross, lightning, chevron, speech-bubble, star, burst) as an editable vector node with a fill colour.',
  arrange_nodes: 'Change the layer order: forward or backward one step, or to the front or back of the stack.',
  group_nodes: 'Group the nodes (Ctrl/Cmd+G), or ungroup the given groups with ungroup: true.',
  get_history: 'Read the undo and redo history depth (how many steps can be undone or redone).',
  set_colors:
    'Set the foreground and background colours (hex), or swap them. Call with no arguments to read them. Brush, shape and fill tools use the foreground colour by default.',
  list_swatches: 'List the swatch palette: a set of common colours to pick from for set_colors.',
  undo: 'Undo the last edit (Ctrl/Cmd+Z).',
  redo: 'Redo the last undone edit.',
  set_view: 'Set the zoom (1 = 100%) or zoom to fit the selection or page.',
  export_image: 'Export nodes as a file: png, jpg, svg or pdf, at a pixel scale. Downloads the file.',
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
- ask_user is for picking between model results with pictures. For any other choice that belongs to the user (style, size, which variant, missing details) use ask_questions instead of guessing.

Workflow for 3D:
- Build the whole object or scene in ONE create_scene call with nested groups. Then call render_scene once and look at it, then render_views to check EVERY side (front, side, back, left, top): something right from one angle can be wrong from another. Fix proportions, gaps, floating or missing parts, colours and framing with update_objects / add_objects / set_scene.
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

Photos (pixel editing, Photoshop-style):
- Image nodes can be placed (place_image), cropped, straightened, resized, canvas-resized, adjusted (adjust_image, vibrance_image), background-removed, painted (paint_image: brush and eraser, or the layer mask), cloned (clone_image), healed (heal_image) and filled (fill_image).
- Pixel tools take source-pixel coordinates: call inspect_image first to get the size and the scale between pixels and design px.
- Make a selection with select_pixels (rect, ellipse, lasso or magic wand); paint, clone, heal, fill and vibrance then only change the selected area until deselect.
- Every pixel edit keeps the original file, so revert_image undoes them. Use pick_color for the eyedropper and export_image to save a PNG, JPG, SVG or PDF.

Always:
- Call get_document first when the user refers to "this"/the selection or to existing work.
- Verification is part of the work: after building or editing, call verify_design on what you touched, fix every issue it reports, and verify again until ok. Warnings may be intentional; fix the ones that are mistakes.
- For tasks with several steps keep a to-do list with update_todos and do not stop until every item is completed and verified.
- Never repeat a call that already succeeded.
- After building, finish with a 1-2 sentence summary of what you made. Do not output JSON or code to the user.`
