import { useEffect, useLayoutEffect } from 'react'

import { CanvasSkeleton } from '@/components/s-3d/canvas-skeleton'
import { Toaster } from '@/components/ui/sonner'
import { S3DDialogs } from '@/features/s-3d/dialogs'
import { ScenePlay } from '@/features/s-3d/play/scene-play'
import { openSceneEditor } from '@/features/s-3d/scene-editor/edit'
import { SceneEditor } from '@/features/s-3d/scene-editor/scene-editor'
import { currentPage, useS3D } from '@/features/s-3d/store'
import { S3DTools } from '@/features/s-3d/webmcp/s3d-tools'

/** The node that holds a page's 3D scene (the newest, so a scene the agent added wins); created on first visit so every S3D page is a scene. */
function ensureSceneNode() {
  const st = useS3D.getState()
  const page = currentPage(st)
  const existing = [...page.children].reverse().find((id) => st.doc.nodes[id]?.type === 'shape3d')
  if (existing) return existing
  return st.addNode('shape3d', { name: 'Scene', x: 0, y: 0, w: 1280, h: 720 }).id
}

/** S3D: a 3D-first editor. The viewport fills the centre; the sidebars show the scene outliner and inspector. */
function S3DPage() {
  const ready = useS3D((s) => s.ready && s.service === '3d')
  const mode = useS3D((s) => s.mode)
  const pageId = useS3D((s) => s.pageId)
  const docId = useS3D((s) => s.doc.id)
  const sceneOpen = useS3D((s) => !!s.sceneEdit)

  // Layout effect: the load starts before the first paint, so the skeleton is replaced as soon as the document is ready.
  useLayoutEffect(() => {
    void useS3D.getState().init('3d')
  }, [])

  // Keep the page's scene open: switching pages or files closes it, so reopen it.
  useEffect(() => {
    if (ready && !sceneOpen) openSceneEditor(ensureSceneNode())
  }, [ready, sceneOpen, pageId, docId])

  if (!ready) return <CanvasSkeleton variant="3d" />
  return (
    <div className="relative flex-1">
      <div className="absolute inset-0">
        <SceneEditor embedded />
      </div>
      {mode === 'play' && <ScenePlay />}
      <S3DDialogs />
      <S3DTools />
      <Toaster />
    </div>
  )
}

export default S3DPage
