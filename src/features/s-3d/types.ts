import type { ChatPlan, ChatTodoList, ChatToolStep } from '@/features/note/db/types'

/** S3D document model. Every node lives in `Doc.nodes`; pages and containers keep ordered child id lists (back to front). */
export type NodeType =
  | 'frame'
  | 'section'
  | 'group'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'vector'
  | 'text'
  | 'image'
  | 'video'
  | 'shape3d'
  | 'model3d'
  | 'boolean'
  | 'comment'

export type Shape3D = 'cube' | 'sphere' | 'torus' | 'cylinder' | 'cone' | 'torusKnot'
export type Vec3 = [number, number, number]

export type Geometry3D =
  | 'box' | 'roundedBox' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'torus' | 'torusKnot'
  | 'plane' | 'circle' | 'ring' | 'icosahedron' | 'dodecahedron' | 'octahedron' | 'tetrahedron' | 'lathe' | 'extrude'
  | 'tube' | 'helix' | 'wave'
  /** Baked triangles in `Obj3D.mesh`: what joining and remeshing produce. */
  | 'mesh'


export type TexturePattern = 'checker' | 'stripes' | 'ridges' | 'dots' | 'grid' | 'bricks' | 'noise' | 'wood' | 'waves' | 'weave' | 'fur' | 'pores' | 'hide'

/** An indexed triangle mesh in the object's local space. `colors` are linear RGB per vertex. */
export interface MeshData3D {
  positions: number[]
  indices: number[]
  colors?: number[]
}

export interface Material3D {
  color: string
  metalness: number
  roughness: number
  emissive: string
  emissiveIntensity: number
  opacity: number
  /** Glass-like see-through (0..1). */
  transmission: number
  clearcoat: number
  wireframe: boolean
  flatShading: boolean
  /** Procedural surface pattern, tinted by `color`. Wins over `image`. */
  pattern?: TexturePattern
  /** A `s3d-file:` ref or URL for an image texture. */
  image?: string
  /** Texture repeats across the surface. Default 1. */
  patternScale?: number
  /** Relief depth (0..1) of the pattern or image: ridges, bumps, grooves. */
  bump?: number
  /** Use the mesh's per-vertex colours instead of `color` (joined or remeshed parts). */
  vertexColors?: boolean
  /** Soft fabric/fur-like highlight at grazing angles (0..1) and its tint. */
  sheen?: number
  sheenColor?: string
  /** Strength of the specular reflection (0..1, default 1); lower for skin and fur. */
  specularIntensity?: number
  /** Image maps (an `s3d-file:` ref or URL), tiled like the base texture. */
  normalImage?: string
  roughnessImage?: string
  aoImage?: string
  normalScale?: number
}

export interface Light3D {
  type: 'ambient' | 'hemisphere' | 'directional' | 'point' | 'spot'
  color: string
  intensity: number
  /** Hemisphere lights: the colour from below. */
  groundColor?: string
  /** Spot lights: cone angle in degrees. */
  angle?: number
  castShadow: boolean
  /** Soft shadow edge, 0 (hard) .. 10. A big soft key light uses a large size. */
  size?: number
}

/** Short fur drawn as shells over a mesh. */
export interface Fur3D {
  /** Strand length in scene units. */
  length: number
  /** Shells: more is denser and smoother, slower. 4..16. */
  layers: number
  /** Strands per unit of surface: higher is finer. */
  density: number
  /** Defaults to the material colour. */
  tipColor?: string
}

/** One object in a 3D scene. Objects are a flat list; `parent` points at a group object (or null for the scene root). */
export interface Obj3D {
  id: string
  name: string
  kind: 'mesh' | 'group' | 'light' | 'model'
  parent: string | null
  /** Scene units (1 ≈ 1 metre), y is up. */
  position: Vec3
  /** Degrees. */
  rotation: Vec3
  scale: Vec3
  visible: boolean
  geometry?: Geometry3D
  /** Geometry dimensions; which keys apply depends on the geometry (see GEOMETRY_PARAMS). */
  params?: Record<string, number | number[][]>
  /** geometry 'mesh': the baked triangles. */
  mesh?: MeshData3D
  fur?: Fur3D
  material?: Material3D
  light?: Light3D
  /** model objects: a `s3d-file:` ref or URL to a GLB/GLTF. */
  src?: string
  castShadow?: boolean
  /** Looping motion; spin turns around `axis` (default y). */
  animate?: { kind: 'spin' | 'float' | 'pulse' | 'orbit'; speed: number; axis?: 'x' | 'y' | 'z' }
  /** Timeline keyframes (local transform at time t seconds); channels left out of a key keep interpolating between the keys that set them. */
  keyframes?: Keyframe3D[]
}

export interface Keyframe3D {
  t: number
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  visible?: boolean
  /** Easing into this key from the previous one. Default ease-in-out. */
  ease?: 'linear' | 'ease-in-out'
}

export interface CameraKey3D {
  t: number
  position: Vec3
  target: Vec3
  fov?: number
}

export interface Scene3D {
  objects: Obj3D[]
  /** Null keeps the node transparent over the canvas. */
  background: string | null
  /** 'studio' adds soft image-based lighting and reflections. */
  environment: 'studio' | 'none'
  camera: { position: Vec3; target: Vec3; fov: number }
  ground: { visible: boolean; color: string; y: number }
  shadows: boolean
  /** Shadow map detail; higher is sharper and slower. */
  shadowQuality?: 'normal' | 'high' | 'ultra'
  /** Overall brightness multiplier, default 1. */
  exposure?: number
  /** Strength of the environment lighting and reflections, default 0.6. */
  envIntensity?: number
  /** Turns the environment around the vertical axis, degrees. */
  envRotation?: number
  toneMapping?: 'aces' | 'neutral' | 'linear' | 'none'
  /** Applied to still renders and captures: contrast/saturation 1 = unchanged, sharpen 0..1. */
  post?: { contrast?: number; saturation?: number; sharpen?: number }
  /** Timeline length in seconds; defaults to the last keyframe. */
  duration?: number
  /** Camera moves over the timeline; the static camera is used when empty. */
  cameraKeys?: CameraKey3D[]
}

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude'

export interface GradientStop {
  offset: number
  color: string
}

export type Fill =
  | { id: string; kind: 'solid'; color: string; opacity: number; visible: boolean }
  | { id: string; kind: 'linear' | 'radial'; angle: number; stops: GradientStop[]; opacity: number; visible: boolean }
  | { id: string; kind: 'image' | 'video'; src: string; fit: 'cover' | 'contain' | 'fill'; opacity: number; visible: boolean }
  /** Paints another frame's contents as this node's fill. */
  | { id: string; kind: 'frame'; frameId: string; opacity: number; visible: boolean }

export interface Stroke {
  id: string
  color: string
  opacity: number
  width: number
  align: 'inside' | 'center' | 'outside'
  dash: number
  visible: boolean
}

export type Effect =
  | { id: string; kind: 'drop-shadow' | 'inner-shadow'; x: number; y: number; blur: number; spread: number; color: string; visible: boolean }
  | { id: string; kind: 'layer-blur' | 'background-blur'; radius: number; visible: boolean }
  | { id: string; kind: 'glass'; blur: number; tint: string; visible: boolean }
  | { id: string; kind: 'noise'; amount: number; visible: boolean }
  | { id: string; kind: 'projection'; rotateX: number; rotateY: number; perspective: number; visible: boolean }

export interface AutoLayout {
  direction: 'horizontal' | 'vertical'
  gap: number
  padding: [number, number, number, number]
  align: 'start' | 'center' | 'end'
  justify: 'start' | 'center' | 'end' | 'space-between'
  wrap: boolean
}

export type Sizing = 'fixed' | 'hug' | 'fill'
export type ConstraintH = 'left' | 'right' | 'left-right' | 'center' | 'scale'
export type ConstraintV = 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale'

export interface TextStyle {
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  strike: boolean
  lineHeight: number
  letterSpacing: number
  align: 'left' | 'center' | 'right' | 'justify'
  verticalAlign: 'top' | 'middle' | 'bottom'
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  autoSize: 'fixed' | 'width' | 'height'
  /** Vertical type: characters run top to bottom. */
  vertical?: boolean
}

export interface Interaction {
  id: string
  trigger: 'click' | 'hover' | 'load' | 'key'
  key?: string
  action: 'go-to-frame' | 'go-to-page' | 'set-state' | 'toggle-visibility' | 'open-url' | 'animate'
  target?: string
  value?: string
  animation?: 'spin' | 'float' | 'pulse' | 'shake' | 'fade-in'
  duration: number
  easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring'
}

/** A named variant of a node; `overrides` are applied on top of the base props in play mode. */
export interface NodeState {
  id: string
  name: string
  overrides: Partial<Pick<SNode, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity' | 'fills' | 'visible' | 'radius'>>
}

export interface ExportSetting {
  id: string
  format: 'png' | 'svg' | 'pdf' | 'jpg'
  scale: number
  suffix: string
}

/** Non-destructive image adjustments, Photoshop-style adjustment layer on one image/video node. Every key is optional; missing means neutral. */
export interface ImageAdjust {
  /** -100..100 */
  brightness?: number
  contrast?: number
  saturation?: number
  /** Warm (+) / cool (-) -100..100 */
  temperature?: number
  /** Degrees, -180..180 */
  hue?: number
  /** Blur radius in px, 0..40 */
  blur?: number
  /** 0..100 */
  grayscale?: number
  sepia?: number
  invert?: boolean
}

export interface SNode {
  id: string
  type: NodeType
  name: string
  /** Page id for top-level nodes, otherwise the containing node's id. */
  parentId: string
  children: string[]
  /** Position relative to the parent node (or the page origin). */
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  blend: string
  visible: boolean
  locked: boolean
  expanded: boolean
  /** Frames: clip children to bounds. */
  clip: boolean
  /** Group: the first child is used as a mask for the rest. */
  mask: boolean
  aspectLocked: boolean
  radius: [number, number, number, number]
  fills: Fill[]
  strokes: Stroke[]
  effects: Effect[]
  autoLayout: AutoLayout | null
  sizing: { h: Sizing; v: Sizing }
  constraints: { h: ConstraintH; v: ConstraintV }
  /** Polygon / star */
  sides: number
  innerRatio: number
  /** Vector path in local (0..w, 0..h) coordinates, SVG path syntax. */
  path: string
  text: TextStyle | null
  /** image / video / model3d source: a `s3d-file:<id>` ref or URL. */
  src: string
  /** image / video: non-destructive adjustments. */
  adjust?: ImageAdjust
  /** image: the source before background removal or other pixel edits, so it can be restored. */
  origSrc?: string
  /** image: a PNG layer mask; its alpha shows (opaque) or hides (transparent) the image, like Photoshop's layer mask. */
  layerMask?: string
  shape3d: Shape3D
  modelColor: string
  /** shape3d nodes: a composed 3D scene; when set it replaces the single primitive. */
  scene?: Scene3D
  booleanOp: BooleanOp
  states: NodeState[]
  interactions: Interaction[]
  exports: ExportSetting[]
  /** Comment node author and resolved flag. */
  author?: string
  resolved?: boolean
  /** LWW clock for conflict-safe collaboration merges. */
  rev: number
  editedBy: string
}

export interface Page {
  id: string
  name: string
  children: string[]
  background: string
}

export interface Doc {
  id: string
  name: string
  pages: Page[]
  nodes: Record<string, SNode>
  /** Which service owns the file: S-Design (2D) or S3D. Missing means 'design' (files made before the split). */
  kind?: Service
  createdAt: number
  updatedAt: number
}

export type Service = 'design' | '3d'

export interface Version {
  id: string
  docId: string
  label: string
  createdAt: number
  doc: Doc
}

/** Metadata for a file whose bytes sit in the Cache Storage bucket. */
export interface FileMeta {
  id: string
  name: string
  type: string
  size: number
  kind: 'image' | 'video' | 'svg' | 'model' | 'project' | 'other'
  docId?: string
  addedAt: number
  lastOpenedAt: number
}

export interface AgentAttachment {
  ref: string
  name: string
  type: string
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachments?: AgentAttachment[]
  error?: string
  /** History index the AI edit starts at, so it can be undone. */
  changes?: number
  /** History length right after the AI edit; undo only applies while the history still ends there. */
  changesEnd?: number
  /** The agent's thought summary for this reply. */
  reasoning?: string
  /** Seconds the agent thought before its first words. */
  reasoningSeconds?: number
  /** The tool calls behind this reply. */
  steps?: ChatToolStep[]
  /** The plan the agent wrote in plan mode. */
  plan?: ChatPlan
  /** The to-do list the agent kept while working, as last updated. */
  todos?: ChatTodoList
  /** Elements the user @mentioned, resolved to ids; sent to the model but not shown. */
  context?: string
  /** Set when this reply ran as a /goal. */
  goal?: string
  /** Where a /goal run is: the worker is building, the verifier is checking, or it ended. */
  goalState?: 'working' | 'verifying' | 'achieved' | 'stopped'
  /** What the separate verifier concluded, one entry per check. */
  verification?: { round: number; achieved: boolean; summary: string; problems: string[] }[]
  /** Wall-clock seconds the whole reply took: thinking, tool calls, reviews and verification. */
  workedSeconds?: number
  /** Tokens in the context after the newest model call, and how often it was compacted. */
  contextTokens?: number
  compactions?: number
  /** The mode this reply ran in. */
  mode?: 'ask' | 'plan' | 'edit' | 'full'
  createdAt: number
}

export interface AgentChat {
  id: string
  docId: string
  title: string
  messages: AgentMessage[]
  updatedAt: number
  /** A manual compaction: messages up to and including `uptoId` reach the model only as this summary. */
  summary?: { text: string; uptoId: string }
}

export type Tool =
  | 'select'
  | 'hand'
  | 'frame'
  | 'section'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'pen'
  | 'text'
  | 'comment'
  | 'shape3d'
  | 'brush'
  | 'eraser'
  | 'clone'
  | 'heal'
  | 'marquee'
  | 'lasso'
  | 'wand'
  | 'quick'
  | 'crop'
  | 'eyedropper'
  | 'zoom'
