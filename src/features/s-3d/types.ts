import type { ChatToolStep } from '@/features/note/db/types'

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
  material?: Material3D
  light?: Light3D
  /** model objects: a `s3d-file:` ref or URL to a GLB/GLTF. */
  src?: string
  castShadow?: boolean
  animate?: { kind: 'spin' | 'float' | 'pulse' | 'orbit'; speed: number }
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
  createdAt: number
}

export interface AgentChat {
  id: string
  docId: string
  title: string
  messages: AgentMessage[]
  updatedAt: number
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
