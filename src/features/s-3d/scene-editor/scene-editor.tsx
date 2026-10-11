import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { ArrowLeftIcon, BoxIcon, CameraIcon, FocusIcon, Move3dIcon, PlusIcon, Rotate3dIcon, Scale3dIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { eventKey } from '../commands'
import { GEOMETRY_PARAMS, animate, applyLook, buildScene, disposeTree, fitCamera, sceneOf } from '../render/scene3d'
import { useS3D } from '../store'
import { GLBoundary } from '../render/three-view'
import type { Geometry3D, Light3D, Scene3D, Vec3 } from '../types'
import { addObject, closeSceneEditor, deleteObject, duplicateObject, editObject, editScene, selectObject, setGizmo } from './edit'

const r3 = (v: number) => Math.round(v * 1000) / 1000

/** Lets the toolbar, outside the Canvas, read and move the editor camera. */
interface View {
  camera?: THREE.PerspectiveCamera
  controls?: { target: THREE.Vector3; update(): void }
  root?: THREE.Group
}

/** Small yellow handles so lights, which have no surface, can be clicked and dragged. */
function addLightHandles(root: THREE.Object3D) {
  const lights: THREE.Object3D[] = []
  root.traverse((o) => { if (o.userData.kind === 'light') lights.push(o) })
  for (const l of lights) {
    const handle = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: '#facc15', wireframe: true }))
    handle.castShadow = false
    handle.userData = { pick: l.userData.id, helper: true }
    l.add(handle)
  }
}

/** The id chain from the clicked mesh up to the scene root, outermost first. */
function pickChain(o: THREE.Object3D | null) {
  const chain: string[] = []
  for (; o; o = o.parent) {
    const id = (o.userData.pick ?? o.userData.id) as string | undefined
    if (id && chain[0] !== id) chain.unshift(id)
  }
  return chain
}

function EditorScene({ scene, view, startTarget }: { scene: Scene3D; view: React.RefObject<View>; startTarget: Vec3 }) {
  const { gl, scene: target, camera, controls } = useThree()
  const edit = useS3D((s) => s.sceneEdit)!
  const [root, setRoot] = useState<THREE.Group | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    let alive = true
    let built: THREE.Group | null = null
    void buildScene(scene).then((r) => {
      if (!alive) return disposeTree(r)
      addLightHandles(r)
      built = r
      setRoot(r)
    })
    return () => {
      alive = false
      if (built) disposeTree(built)
    }
  }, [scene])

  useEffect(() => applyLook(target, { ...scene, background: scene.background ?? '#1c1c20' }, gl), [scene, gl, target])
  useEffect(() => {
    view.current.camera = camera as THREE.PerspectiveCamera
    view.current.controls = controls as unknown as View['controls']
    view.current.root = root ?? undefined
  }, [camera, controls, root, view])

  const selectedObj = useMemo(() => {
    let found: THREE.Object3D | undefined
    root?.traverse((o) => { if (!o.userData.helper && o.userData.id === edit.selected) found = o })
    return found
  }, [root, edit.selected])

  const outline = useMemo(() => (selectedObj ? new THREE.BoxHelper(selectedObj, '#3b82f6') : null), [selectedObj])
  // Motion plays while editing; it pauses during a gizmo drag so the drag edits the saved pose.
  const time = useRef(0)
  useFrame((_, dt) => {
    if (root && !dragging.current) {
      time.current += dt
      animate(root, time.current)
    }
    outline?.update()
  })
  const toBasePose = (o: THREE.Object3D) => {
    const base = o.userData.base as { position: Vec3; rotation: Vec3; scale: Vec3 } | undefined
    if (!base || (!o.userData.animate && !o.userData.keyframes)) return
    o.position.set(...base.position)
    o.rotation.set(...(base.rotation.map((d) => THREE.MathUtils.degToRad(d)) as Vec3))
    o.scale.set(...base.scale)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // A drag that orbited the camera is not a click.
    if (e.delta > 4 || dragging.current) return
    e.stopPropagation()
    if (e.object.userData.ground) return selectObject(null)
    const chain = pickChain(e.object)
    // First click picks the outermost group; clicking again inside a selected group goes one level deeper.
    const at = edit.selected ? chain.indexOf(edit.selected) : -1
    selectObject(chain[at >= 0 && at < chain.length - 1 ? at + 1 : at >= 0 ? at : 0] ?? null)
  }

  /** Writes the gizmo's result back as the object's local transform. */
  const commit = () => {
    const o = selectedObj
    if (!o) return
    const deg = (v: number) => r3(THREE.MathUtils.radToDeg(v))
    editObject(o.userData.id, (x) => {
      x.position = [r3(o.position.x), r3(o.position.y), r3(o.position.z)]
      x.rotation = [deg(o.rotation.x), deg(o.rotation.y), deg(o.rotation.z)]
      x.scale = [r3(o.scale.x), r3(o.scale.y), r3(o.scale.z)]
    })
  }

  return (
    <>
      {root && <primitive object={root} onClick={onClick} />}
      {outline && <primitive object={outline} />}
      <Grid position={[0, scene.ground.y + 0.002, 0]} infiniteGrid cellSize={0.1} sectionSize={1} cellColor="#6b7280" sectionColor="#9ca3af" cellThickness={0.5} sectionThickness={1} fadeDistance={25} fadeStrength={1.5} />
      {selectedObj && (
        <TransformControls
          object={selectedObj}
          mode={edit.gizmo}
          size={0.8}
          onMouseDown={() => {
            dragging.current = true
            toBasePose(selectedObj)
          }}
          onMouseUp={() => {
            commit()
            // The click that ends a drag must not change the selection.
            setTimeout(() => { dragging.current = false }, 0)
          }}
        />
      )}
      <OrbitControls makeDefault target={startTarget} enableDamping dampingFactor={0.12} />
    </>
  )
}

const ADD_SHAPES: Geometry3D[] = ['box', 'roundedBox', 'sphere', 'cylinder', 'cone', 'capsule', 'torus', 'torusKnot', 'plane', 'ring', 'icosahedron', 'dodecahedron', 'octahedron', 'tetrahedron', 'lathe', 'extrude']
const ADD_LIGHTS: Light3D['type'][] = ['directional', 'point', 'spot', 'hemisphere', 'ambient']
const label = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

/**
 * Spline-style full-screen editor for one 3D scene: orbit freely, click objects, move/rotate/scale them with a gizmo.
 * `embedded` is the S3D service, where the scene is the whole file and there is no canvas to go back to.
 */
export function SceneEditor({ embedded = false }: { embedded?: boolean }) {
  const edit = useS3D((s) => s.sceneEdit)
  const node = useS3D((s) => (s.sceneEdit ? s.doc.nodes[s.sceneEdit.nodeId] : undefined))
  const scene = useMemo(() => (node ? sceneOf(node) : null), [node])
  const view = useRef<View>({})
  // The editor camera starts at the scene camera and is independent of it afterwards.
  const initial = useMemo(() => scene?.camera, [edit?.nodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!edit) return
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    const onKey = (e: KeyboardEvent) => {
      if (editable(e.target)) return
      const st = useS3D.getState()
      const sel = st.sceneEdit?.selected
      const key = eventKey(e)
      const run = (fn: () => void) => { e.preventDefault(); fn() }
      if (key === 'w' || key === 'g') run(() => setGizmo('translate'))
      else if (key === 'e' || key === 'r') run(() => setGizmo(key === 'e' ? 'rotate' : 'scale'))
      else if (key === 's') run(() => setGizmo('scale'))
      else if (key === 'f') run(() => frame(sel))
      else if ((key === 'delete' || key === 'backspace') && sel) run(() => deleteObject(sel))
      else if (key === 'mod+d' && sel) run(() => duplicateObject(sel))
      else if (key === 'mod+z') run(() => st.undo())
      else if (key === 'mod+shift+z' || key === 'mod+y') run(() => st.redo())
      else if (key === 'escape') run(() => (sel ? selectObject(null) : !embedded && closeSceneEditor()))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit, embedded])

  if (!edit || !node || !scene || !initial) return null

  /** Aims the editor camera at the selection, or at everything. */
  function frame(id?: string | null) {
    const { camera, controls, root } = view.current
    if (!camera || !controls || !root) return
    let subject: THREE.Object3D = root
    if (id) root.traverse((o) => { if (!o.userData.helper && o.userData.id === id) subject = o })
    const wrap = new THREE.Group()
    // fitCamera reads ids, so frame a stand-in that only holds the subject's bounds.
    const box = new THREE.Box3().setFromObject(subject)
    if (box.isEmpty()) return
    const stand = new THREE.Mesh(new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()))
    stand.position.copy(box.getCenter(new THREE.Vector3()))
    stand.userData.id = 'frame'
    wrap.add(stand)
    wrap.updateMatrixWorld(true)
    const dir = camera.position.clone().sub(controls.target)
    const c = fitCamera(wrap, camera.aspect, camera.fov, dir.toArray() as Vec3)
    camera.position.set(...c.position)
    controls.target.set(...c.target)
    controls.update()
    stand.geometry.dispose()
  }

  /** Makes what the editor camera sees the scene's camera on the canvas. */
  const applyView = () => {
    const { camera, controls } = view.current
    if (!camera || !controls) return
    editScene((s) => {
      s.camera = { position: camera.position.toArray().map(r3) as Vec3, target: controls.target.toArray().map(r3) as Vec3, fov: s.camera.fov }
    })
  }

  const gizmoBtn = (mode: 'translate' | 'rotate' | 'scale', icon: React.ReactNode, title: string) => (
    <Button variant="ghost" size="icon-sm" title={title} onClick={() => setGizmo(mode)} className={cn(edit.gizmo === mode && 'bg-accent text-foreground')}>{icon}</Button>
  )

  return (
    <div className="absolute inset-0 z-20 bg-[#1c1c20]" data-ui>
      <GLBoundary fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">3D needs WebGL, which this browser has turned off.</div>}>
      <Canvas shadows={scene.shadows ? 'soft' : false} camera={{ position: initial.position, fov: initial.fov, near: 0.01, far: 500 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }} dpr={[1, 2]} onPointerMissed={(e) => e.button === 0 && selectObject(null)}>
        <EditorScene scene={scene} view={view} startTarget={initial.target} />
      </Canvas>
      </GLBoundary>

      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur">
          {!embedded && (
            <>
              <Button variant="ghost" size="sm" onClick={closeSceneEditor} title="Back to canvas (Esc)"><ArrowLeftIcon /> {node.name}</Button>
              <div className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          {gizmoBtn('translate', <Move3dIcon />, 'Move (W)')}
          {gizmoBtn('rotate', <Rotate3dIcon />, 'Rotate (E)')}
          {gizmoBtn('scale', <Scale3dIcon />, 'Scale (R)')}
          <div className="mx-1 h-5 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" title="Add object" />}><PlusIcon /> Add</DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Shapes</DropdownMenuLabel>
                {ADD_SHAPES.filter((g) => g in GEOMETRY_PARAMS).map((g) => <DropdownMenuItem key={g} onClick={() => addObject(g)}><BoxIcon /> {label(g)}</DropdownMenuItem>)}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Lights</DropdownMenuLabel>
                {ADD_LIGHTS.map((l) => <DropdownMenuItem key={l} onClick={() => addObject(l)}>{label(l)} light</DropdownMenuItem>)}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => addObject('group')}>Empty group</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-sm" title="Frame selection (F)" onClick={() => frame(edit.selected)}><FocusIcon /></Button>
          <Button variant="ghost" size="icon-sm" title="Use this view as the scene camera" onClick={applyView}><CameraIcon /></Button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
        Drag to orbit · Right-drag to pan · Scroll to zoom · Click to select · W/E/R move/rotate/scale · F frame · ⌘D duplicate · Del delete · Esc {embedded ? 'deselect' : 'back'}
      </div>
    </div>
  )
}
