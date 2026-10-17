import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { getDrawContext } from '@/features/s-draw/bridge'
import { DrawSkeleton } from '@/features/s-draw/components/draw-skeleton'
import { DrawWorkspace } from '@/features/s-draw/components/draw-workspace'
import { SenseiWidget } from '@/features/s-draw/components/sensei-widget'
import { resolveDrawFileId } from '@/features/s-draw/s-draw.db'
import { DrawTools } from '@/features/s-draw/webmcp/draw-tools'

export default function SDrawPage() {
  const [params, setParams] = useSearchParams()
  const fileId = params.get('fileId')
  const chatId = params.get('chatId')
  const [error, setError] = useState('')
  useEffect(() => {
    if (fileId) return
    let current = true
    void resolveDrawFileId()
      .then((id) => {
        if (current)
          setParams(
            (previous) => {
              const next = new URLSearchParams(previous)
              next.set('fileId', id)
              return next
            },
            { replace: true },
          )
      })
      .catch((error: unknown) => current && setError(String(error)))
    return () => {
      current = false
    }
  }, [fileId, setParams])
  if (!fileId && !error) return <DrawSkeleton />
  if (!fileId)
    return (
      <div className="s-draw-loading" role="status">
        {error}
      </div>
    )
  const selectChat = (id: string | null) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (id) next.set('chatId', id)
      else next.delete('chatId')
      return next
    })
  return (
    <DrawWorkspace key={fileId} fileId={fileId}>
      <DrawTools />
      <SenseiWidget fileId={fileId} chatId={chatId} onChatChange={selectChat} context={getDrawContext} title="SDraw workspace" />
    </DrawWorkspace>
  )
}
