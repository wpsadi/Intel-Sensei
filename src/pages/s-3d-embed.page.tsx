import { useEffect, useState } from 'react'
import { Player } from '@/features/s-design/play/play-mode'
import { decodeDoc } from '@/features/s-3d/export/share'
import type { Doc } from '@/features/s-3d/types'

/** Read-only player for a published S3D document carried in the URL hash. */
function S3DEmbedPage() {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState('')
  const params = new URLSearchParams(location.search)

  useEffect(() => {
    const data = location.hash.slice(1)
    if (!data) return setError('This link has no design in it.')
    decodeDoc(data).then(setDoc, () => setError('This link is broken or incomplete.'))
  }, [])

  if (error) return <div className="grid h-svh place-items-center bg-neutral-950 text-sm text-white/70">{error}</div>
  if (!doc) return <div className="grid h-svh place-items-center bg-neutral-950 text-sm text-white/50">Loading…</div>
  return (
    <div className="h-svh bg-neutral-950">
      <Player doc={doc} startPageId={params.get('page') ?? undefined} hideUi={params.get('hideUi') === '1'} interactive={params.get('interactive') !== '0'} />
    </div>
  )
}

export default S3DEmbedPage
