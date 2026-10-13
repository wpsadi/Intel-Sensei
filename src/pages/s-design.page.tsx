import { useLayoutEffect } from 'react'
import { CanvasSkeleton } from '@/components/s-3d/canvas-skeleton'
import { DesignCanvas } from '@/features/s-design/canvas/canvas'
import { DesignDock } from '@/features/s-design/dock'
import { S3DDialogs } from '@/features/s-3d/dialogs'
import { PlayMode } from '@/features/s-design/play/play-mode'
import { SceneEditor } from '@/features/s-3d/scene-editor/scene-editor'
import { S3DTools } from '@/features/s-3d/webmcp/s3d-tools'
import { Toaster } from '@/components/ui/sonner'
import { useS3D } from '@/features/s-3d/store'

/** S-Design: the 2D design canvas (frames, shapes, text, prototyping). 3D shape nodes open their scene in place. */
function SDesignPage() {
  const ready = useS3D((s) => s.ready && s.service === 'design')
  const mode = useS3D((s) => s.mode)
  const sceneOpen = useS3D((s) => !!s.sceneEdit)
  // Layout effect: the load starts before the first paint, so the skeleton is replaced as soon as the document is ready.
  useLayoutEffect(() => {
    void useS3D.getState().init('design')
  }, [])
  if (!ready) return <CanvasSkeleton variant="design" />
  return (
    <div className="relative flex-1">
      <div className="absolute inset-0">
        <DesignCanvas />
        <SceneEditor />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className={sceneOpen ? 'hidden' : 'pointer-events-auto'}>
          <DesignDock />
        </div>
      </div>
      {mode === 'play' && <PlayMode />}
      <S3DDialogs />
      <S3DTools />
      <Toaster />
    </div>
  )
}

export default SDesignPage
