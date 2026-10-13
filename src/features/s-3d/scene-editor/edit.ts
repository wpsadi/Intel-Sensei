import { uid } from '../db'
import { DEFAULT_MATERIAL, GEOMETRY_PARAMS, sceneOf } from '../render/scene3d'
import { useS3D } from '../store'
import type { Geometry3D, Light3D, Obj3D, Scene3D } from '../types'

/** Actions the open scene editor registers, so menus outside it can drive the viewport. */
export const sceneActions: { frame?: (id: string | null) => void } = {}

type Gizmo = 'translate' | 'rotate' | 'scale'

export function openSceneEditor(nodeId: string) {
  useS3D.getState().set({ selection: [nodeId], editingTextId: null, sceneEdit: { nodeId, selected: null, gizmo: 'translate' } })
}

export const closeSceneEditor = () => useS3D.getState().set({ sceneEdit: null })

export function selectObject(selected: string | null) {
  const { sceneEdit, set } = useS3D.getState()
  if (sceneEdit) set({ sceneEdit: { ...sceneEdit, selected } })
}

export function setGizmo(gizmo: Gizmo) {
  const { sceneEdit, set } = useS3D.getState()
  if (sceneEdit) set({ sceneEdit: { ...sceneEdit, gizmo } })
}

/** The open scene, read live from the store. */
export function currentScene(): Scene3D | null {
  const { sceneEdit, doc } = useS3D.getState()
  const n = sceneEdit && doc.nodes[sceneEdit.nodeId]
  return n ? sceneOf(n) : null
}

/** Applies a change to the open scene as one undo step. */
export function editScene(recipe: (scene: Scene3D) => void) {
  const { sceneEdit, updateNodes } = useS3D.getState()
  if (!sceneEdit) return
  updateNodes([sceneEdit.nodeId], (n) => {
    if (!n.scene) n.scene = sceneOf(n)
    n.type = 'shape3d'
    recipe(n.scene)
  })
}

export function editObject(id: string, recipe: (o: Obj3D) => void) {
  editScene((scene) => {
    const o = scene.objects.find((x) => x.id === id)
    if (o) recipe(o)
  })
}

export function subtree(scene: Scene3D, id: string) {
  const out = new Set([id])
  for (let grew = true; grew; ) {
    grew = false
    for (const o of scene.objects) if (o.parent && out.has(o.parent) && !out.has(o.id)) { out.add(o.id); grew = true }
  }
  return out
}

const LIGHTS: Record<Light3D['type'], Partial<Light3D>> = {
  directional: { intensity: 2, castShadow: true },
  point: { intensity: 3, castShadow: true },
  spot: { intensity: 6, angle: 30, castShadow: true },
  ambient: { intensity: 0.4, castShadow: false },
  hemisphere: { intensity: 0.6, groundColor: '#94a3b8', castShadow: false },
}

/** Adds a primitive resting on the ground, or a light above the scene, and selects it. */
export function addObject(what: Geometry3D | Light3D['type'] | 'group') {
  const id = `${what}-${uid().slice(0, 6)}`
  editScene((scene) => {
    const base = { id, parent: null, rotation: [0, 0, 0], scale: [1, 1, 1], visible: true } as const
    const count = scene.objects.length
    const x = ((count % 5) - 2) * 0.3
    if (what === 'group') scene.objects.push({ ...base, name: 'Group', kind: 'group', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
    else if (what in LIGHTS) {
      const type = what as Light3D['type']
      scene.objects.push({ ...base, name: `${type[0].toUpperCase()}${type.slice(1)} light`, kind: 'light', position: [2, 4, 2], rotation: [0, 0, 0], scale: [1, 1, 1], light: { type, color: '#ffffff', intensity: 1, castShadow: false, ...LIGHTS[type] } })
    } else {
      const geometry = what as Geometry3D
      const p = GEOMETRY_PARAMS[geometry]
      // Rest the new shape on the ground using its default height.
      const h = p.height ?? (p.radius ? p.radius * 2 : p.length ? p.length + 2 * (p.radius ?? 0) : 1)
      const flat = geometry === 'plane' || geometry === 'circle' || geometry === 'ring' || geometry === 'wave'
      scene.objects.push({
        ...base, name: geometry[0].toUpperCase() + geometry.slice(1), kind: 'mesh', geometry, params: {},
        position: [x, scene.ground.y + (flat ? 0.01 : h / 2), 0], rotation: flat ? [-90, 0, 0] : [0, 0, 0], scale: [1, 1, 1],
        material: { ...DEFAULT_MATERIAL, color: '#a5b4fc' },
      })
    }
  })
  selectObject(id)
}

export function deleteObject(id: string) {
  editScene((scene) => {
    const gone = subtree(scene, id)
    scene.objects = scene.objects.filter((o) => !gone.has(o.id))
  })
  selectObject(null)
}

/** Copies an object with its children, nudged sideways so the copy is visible. */
export function duplicateObject(id: string) {
  const scene = currentScene()
  if (!scene) return
  const ids = subtree(scene, id)
  const map = new Map([...ids].map((x) => [x, `${x.replace(/-[a-z0-9]{6}$/, '')}-${uid().slice(0, 6)}`]))
  editScene((s) => {
    for (const o of s.objects.filter((x) => ids.has(x.id))) {
      const copy: Obj3D = structuredClone(o)
      copy.id = map.get(o.id)!
      copy.parent = o.id === id ? o.parent : map.get(o.parent!)!
      if (o.id === id) {
        copy.name = `${o.name} copy`
        copy.position = [o.position[0] + 0.3, o.position[1], o.position[2]]
      }
      s.objects.push(copy)
    }
  })
  selectObject(map.get(id)!)
}
