import { XIcon } from 'lucide-react'
import { Suspense, lazy, useEffect } from 'react'

import { Button } from '@/components/ui/button'

import { sceneOf } from '../render/scene3d'
import { useS3D } from '../store'

const ThreeView = lazy(() => import('../render/three-view'))

/**
 * S3D preview: the scene alone, full screen, over the menubar and both sidebars. Its animations play and the
 * viewer can orbit around it. Esc or the close button goes back to editing.
 */
export function ScenePlay() {
  const node = useS3D((s) => {
    const page = s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0]
    const id = s.sceneEdit?.nodeId ?? page?.children.find((c) => s.doc.nodes[c]?.type === 'shape3d')
    return id ? s.doc.nodes[id] : undefined
  })
  const close = () => useS3D.getState().set({ mode: 'edit' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const scene = node ? sceneOf(node) : null
  return (
    <div className="fixed inset-0 z-50" style={{ background: scene?.background ?? '#0b0b0f' }}>
      {scene && (
        <Suspense fallback={null}>
          <ThreeView kind="cube" color="#ffffff" interactive spin={false} rotation={0} scene={scene} />
        </Suspense>
      )}
      {!scene && <div className="grid h-full place-items-center text-sm text-white/60">There is no 3D scene to preview.</div>}
      <Button variant="secondary" size="icon-sm" className="absolute top-3 right-3" aria-label="Exit preview" onClick={close}>
        <XIcon />
      </Button>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/40 px-2 py-1 text-[11px] text-white/70">
        Drag to orbit · Scroll to zoom · Esc to exit
      </div>
    </div>
  )
}
