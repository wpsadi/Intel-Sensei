import { toast } from 'sonner'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { downloadBlob } from '../files'
import { buildScene, disposeTree, renderScene, sceneOf } from '../render/scene3d'
import { useS3D } from '../store'

export type SceneExport = 'glb' | 'obj' | 'stl' | 'png'

/** The scene being edited, or the first 3D scene on the current page. */
function openScene(sceneId?: string) {
  const { sceneEdit, doc, pageId } = useS3D.getState()
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
  const id = sceneId ?? sceneEdit?.nodeId ?? page?.children.find((c) => doc.nodes[c]?.type === 'shape3d')
  const node = id ? doc.nodes[id] : undefined
  return node ? { node, scene: sceneOf(node), name: doc.name } : null
}

/** Downloads the open 3D scene: a render as PNG, or the geometry as GLB (with materials and lights), OBJ or STL. */
export async function exportScene(format: SceneExport, sceneId?: string) {
  const open = openScene(sceneId)
  if (!open) {
    toast.error('There is no 3D scene to export')
    throw new Error('There is no 3D scene to export')
  }
  const { node, scene, name } = open
  const file = (ext: string) => `${(name || node.name || 'scene').replace(/[^\w-]+/g, '-')}.${ext}`
  const id = toast.loading(`Exporting ${format.toUpperCase()}…`)
  try {
    let blob: Blob
    if (format === 'png') {
      const w = Math.min(Math.round(node.w) || 1280, 4096), h = Math.min(Math.round(node.h) || 720, 4096)
      const base64 = await renderScene(scene, w, h, 'camera', 0, 4096)
      blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
    } else {
      const root = await buildScene(scene)
      try {
        if (format === 'glb') blob = new Blob([(await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer], { type: 'model/gltf-binary' })
        else if (format === 'obj') blob = new Blob([new OBJExporter().parse(root)], { type: 'text/plain' })
        else blob = new Blob([new STLExporter().parse(root, { binary: true }) as unknown as BlobPart], { type: 'model/stl' })
      } finally {
        disposeTree(root)
      }
    }
    downloadBlob(blob, file(format))
    toast.success('Exported', { id })
    return { file: file(format), bytes: blob.size }
  } catch (e) {
    toast.error(`Export failed: ${e instanceof Error ? e.message : e}`, { id })
    throw e
  }
}
