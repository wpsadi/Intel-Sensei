import { useState } from 'react'
import { BoxIcon, EyeIcon, EyeOffIcon, FolderIcon, LightbulbIcon, PackageIcon } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Check, ColorField, NumberField, Section, Sel, TextField } from '../inspector/fields'
import { DEFAULT_MATERIAL, GEOMETRY_PARAMS, MATERIAL_PRESETS, sceneOf } from '../render/scene3d'
import { useS3D } from '../store'
import type { Geometry3D, Light3D, Material3D, Obj3D, Scene3D, Vec3 } from '../types'
import { editObject, editScene, selectObject } from './edit'

function useOpenScene() {
  const edit = useS3D((s) => s.sceneEdit)
  const node = useS3D((s) => (s.sceneEdit ? s.doc.nodes[s.sceneEdit.nodeId] : undefined))
  return { edit, scene: node ? sceneOf(node) : null }
}

const KIND_ICON = { mesh: BoxIcon, group: FolderIcon, light: LightbulbIcon, model: PackageIcon }

/** Left sidebar while the scene editor is open: the scene's objects as a tree. */
export function SceneOutliner() {
  const { edit, scene } = useOpenScene()
  const [renaming, setRenaming] = useState<string | null>(null)
  if (!edit || !scene) return null
  const rows: { o: Obj3D; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const o of scene.objects.filter((x) => x.parent === parent)) {
      rows.push({ o, depth })
      walk(o.id, depth + 1)
    }
  }
  walk(null, 0)
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Scene objects</div>
      {!rows.length && <div className="px-3 py-2 text-xs text-muted-foreground">Empty scene. Use Add in the toolbar.</div>}
      {rows.map(({ o, depth }) => {
        const Icon = KIND_ICON[o.kind]
        return (
          <div
            key={o.id}
            onClick={() => selectObject(o.id)}
            onDoubleClick={() => setRenaming(o.id)}
            className={cn('group flex h-7 cursor-default items-center gap-1.5 pr-2 text-xs hover:bg-accent/60', edit.selected === o.id && 'bg-primary/15 text-foreground', !o.visible && 'opacity-50')}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            <Icon className={cn('size-3.5 shrink-0', o.kind === 'light' ? 'text-yellow-500' : 'text-violet-500')} />
            {renaming === o.id ? (
              <input
                autoFocus
                defaultValue={o.name}
                className="h-5 min-w-0 flex-1 rounded-sm border border-primary bg-background px-1 outline-none"
                onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v) editObject(o.id, (x) => { x.name = v }); setRenaming(null) }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }}
              />
            ) : <span className="min-w-0 flex-1 truncate">{o.name}</span>}
            <button
              type="button"
              title={o.visible ? 'Hide' : 'Show'}
              onClick={(e) => { e.stopPropagation(); editObject(o.id, (x) => { x.visible = !x.visible }) }}
              className={cn('text-muted-foreground hover:text-foreground', o.visible && 'opacity-0 group-hover:opacity-100')}
            >
              {o.visible ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
            </button>
          </div>
        )
      })}
    </ScrollArea>
  )
}

function Vec3Field({ title, value, step, onChange }: { title: string; value: Vec3; step: number; onChange: (v: Vec3) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <NumberField key={axis} label={axis} title={`${title} ${axis}`} step={step} value={value[i]} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)) as Vec3)} />
      ))}
    </div>
  )
}

const LABEL = 'text-[11px] text-muted-foreground'

function ObjectInspector({ o }: { o: Obj3D }) {
  const set = (recipe: (x: Obj3D) => void) => editObject(o.id, recipe)
  const mat = { ...DEFAULT_MATERIAL, ...o.material }
  const setMat = (patch: Partial<Material3D>) => set((x) => { x.material = { ...DEFAULT_MATERIAL, ...x.material, ...patch } })
  const geo = o.geometry ?? 'box'
  return (
    <>
      <Section title={o.kind === 'light' ? 'Light' : o.kind === 'group' ? 'Group' : o.kind === 'model' ? 'Model' : 'Object'}>
        <TextField value={o.name} onChange={(v) => set((x) => { x.name = v })} />
      </Section>
      <Section title="Transform">
        <div className={LABEL}>Position</div>
        <Vec3Field title="Position" step={0.05} value={o.position} onChange={(v) => set((x) => { x.position = v })} />
        <div className={LABEL}>Rotation</div>
        <Vec3Field title="Rotation" step={5} value={o.rotation} onChange={(v) => set((x) => { x.rotation = v })} />
        <div className={LABEL}>Scale</div>
        <Vec3Field title="Scale" step={0.05} value={o.scale} onChange={(v) => set((x) => { x.scale = v })} />
      </Section>
      {o.kind === 'mesh' && (
        <Section title="Geometry">
          <Sel<Geometry3D> value={geo} options={(Object.keys(GEOMETRY_PARAMS) as Geometry3D[]).map((g) => ({ value: g, label: g }))} onChange={(g) => set((x) => { x.geometry = g; x.params = {} })} />
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(GEOMETRY_PARAMS[geo]).map(([k, def]) => (
              <NumberField key={k} label={k.slice(0, 3)} title={k} step={['detail', 'p', 'q', 'segments'].includes(k) ? 1 : k === 'arc' ? 5 : 0.01} min={0}
                value={typeof o.params?.[k] === 'number' ? (o.params[k] as number) : def}
                onChange={(v) => set((x) => { x.params = { ...x.params, [k]: v } })} />
            ))}
          </div>
        </Section>
      )}
      {o.kind === 'mesh' && (
        <Section title="Material">
          <Sel<string> value="" options={[{ value: '', label: 'Apply preset…' }, ...Object.keys(MATERIAL_PRESETS).map((p) => ({ value: p, label: p }))]} onChange={(p) => p && setMat(MATERIAL_PRESETS[p])} />
          <ColorField color={mat.color} opacity={mat.opacity} onChange={(color) => setMat({ color })} onOpacity={(opacity) => setMat({ opacity })} />
          <div className="grid grid-cols-2 gap-1">
            <NumberField label="Met" title="Metalness" step={0.05} min={0} max={1} value={mat.metalness} onChange={(metalness) => setMat({ metalness })} />
            <NumberField label="Rgh" title="Roughness" step={0.05} min={0} max={1} value={mat.roughness} onChange={(roughness) => setMat({ roughness })} />
            <NumberField label="Gls" title="Glass (transmission)" step={0.05} min={0} max={1} value={mat.transmission} onChange={(transmission) => setMat({ transmission })} />
            <NumberField label="Coat" title="Clearcoat" step={0.05} min={0} max={1} value={mat.clearcoat} onChange={(clearcoat) => setMat({ clearcoat })} />
          </div>
          <div className={LABEL}>Glow</div>
          <ColorField color={mat.emissive} onChange={(emissive) => setMat({ emissive })} />
          <NumberField label="Int" title="Glow intensity" step={0.1} min={0} value={mat.emissiveIntensity} onChange={(emissiveIntensity) => setMat({ emissiveIntensity })} />
          <Check label="Wireframe" checked={mat.wireframe} onChange={(wireframe) => setMat({ wireframe })} />
          <Check label="Flat shading" checked={mat.flatShading} onChange={(flatShading) => setMat({ flatShading })} />
        </Section>
      )}
      {o.kind === 'light' && o.light && (
        <Section title="Light settings">
          <Sel<Light3D['type']> value={o.light.type} options={['directional', 'point', 'spot', 'hemisphere', 'ambient']} onChange={(type) => set((x) => { x.light = { ...x.light!, type } })} />
          <ColorField color={o.light.color} onChange={(color) => set((x) => { x.light = { ...x.light!, color } })} />
          <NumberField label="Int" title="Intensity" step={0.1} min={0} value={o.light.intensity} onChange={(intensity) => set((x) => { x.light = { ...x.light!, intensity } })} />
          {o.light.type === 'spot' && <NumberField label="Ang" title="Cone angle" step={1} min={1} max={89} value={o.light.angle ?? 30} onChange={(angle) => set((x) => { x.light = { ...x.light!, angle } })} />}
          <Check label="Cast shadows" checked={o.light.castShadow} onChange={(castShadow) => set((x) => { x.light = { ...x.light!, castShadow } })} />
        </Section>
      )}
      {o.kind !== 'light' && (
        <Section title="Animation">
          <Sel<string> value={o.animate?.kind ?? 'none'} options={['none', 'spin', 'float', 'pulse', 'orbit']} onChange={(k) => set((x) => { x.animate = k === 'none' ? undefined : { kind: k as NonNullable<Obj3D['animate']>['kind'], speed: x.animate?.speed ?? 1 } })} />
          {o.animate && <NumberField label="Spd" title="Speed" step={0.1} min={0} value={o.animate.speed} onChange={(speed) => set((x) => { x.animate = { ...x.animate!, speed } })} />}
          {o.animate?.kind === 'spin' && <Sel<string> value={o.animate.axis ?? 'y'} options={['x', 'y', 'z']} onChange={(axis) => set((x) => { x.animate = { ...x.animate!, axis: axis as 'x' | 'y' | 'z' } })} />}
          {o.kind === 'mesh' && <Check label="Cast shadow" checked={o.castShadow ?? true} onChange={(castShadow) => set((x) => { x.castShadow = castShadow })} />}
        </Section>
      )}
    </>
  )
}

function SceneSettings({ scene }: { scene: Scene3D }) {
  const set = (recipe: (s: Scene3D) => void) => editScene(recipe)
  return (
    <>
      <Section title="Scene">
        <Check label="Transparent background" checked={scene.background === null} onChange={(v) => set((s) => { s.background = v ? null : '#f1f5f9' })} />
        {scene.background !== null && <ColorField color={scene.background} onChange={(c) => set((s) => { s.background = c })} />}
        <Sel<Scene3D['environment']> value={scene.environment} options={[{ value: 'studio', label: 'Studio lighting' }, { value: 'none', label: 'No environment' }]} onChange={(environment) => set((s) => { s.environment = environment })} />
        <Check label="Shadows" checked={scene.shadows} onChange={(shadows) => set((s) => { s.shadows = shadows })} />
      </Section>
      <Section title="Ground">
        <Check label="Show ground" checked={scene.ground.visible} onChange={(visible) => set((s) => { s.ground.visible = visible })} />
        {scene.ground.visible && <ColorField color={scene.ground.color} onChange={(color) => set((s) => { s.ground.color = color })} />}
      </Section>
      <Section title="Camera">
        <NumberField label="FOV" title="Field of view" step={1} min={10} max={120} value={scene.camera.fov} onChange={(fov) => set((s) => { s.camera.fov = fov })} />
        <div className="text-[11px] text-muted-foreground">Orbit to a view you like, then use the camera button in the toolbar to make it the scene camera.</div>
      </Section>
    </>
  )
}

/** Right sidebar while the scene editor is open: the selected object, or the scene settings. */
export function SceneInspector() {
  const { edit, scene } = useOpenScene()
  if (!edit || !scene) return null
  const o = scene.objects.find((x) => x.id === edit.selected)
  return o ? <ObjectInspector key={o.id} o={o} /> : <SceneSettings scene={scene} />
}
