import type { NodeViewProps } from '@tiptap/react'
import { CheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useCopy } from '@/hooks/use-copy'

import { subscribe } from '../../../db/idb'
import { EMPTY_DOC, syncedRepo } from '../../../db/repo'
import { useNoteStore } from '../../../note.store'
import { NoteEditor } from '../../NoteEditor'
import { BlockFrame } from '../helpers'

/* ------------------------------- synced block ------------------------------ */

/** Every copy of a synced block edits the same record in the `synced` store. */
export function SyncedView({ node, selected }: NodeViewProps) {
  const syncId = node.attrs.syncId as string
  const [content, setContent] = useState<string>()
  const [revision, setRevision] = useState(0)
  const lastWrite = useRef('')
  const { copied, copy } = useCopy()

  useEffect(() => {
    const load = () =>
      syncedRepo.get(syncId).then((block) => {
        const next = block?.content ?? EMPTY_DOC
        // Ignore echoes of our own writes so the caret is not reset while typing.
        if (next === lastWrite.current) return
        setContent(next)
        setRevision((r) => r + 1)
      })
    load()
    return subscribe((store, id) => store === 'synced' && id === syncId && load())
  }, [syncId])

  return (
    <BlockFrame selected={selected} className="group/synced relative">
      <div className="rounded-md border-2 border-transparent px-1 group-hover/synced:border-orange-300/70">
        <div className="absolute -top-3 right-2 hidden items-center gap-1 rounded bg-orange-100 px-2 text-xs text-orange-700 group-hover/synced:flex dark:bg-orange-950 dark:text-orange-300">
          <RefreshCwIcon className="size-3" /> Synced
          <button
            type="button"
            title={copied ? 'Copied' : 'Copy synced block'}
            onClick={() => void copy(`snote-synced:${syncId}`)}
            className="ml-1 flex items-center gap-0.5"
          >
            {copied ? (
              <>
                <CheckIcon className="size-3" />
                Copied
              </>
            ) : (
              <CopyIcon className="size-3" />
            )}
          </button>
        </div>
        {content !== undefined && (
          <NoteEditor
            key={revision}
            content={content}
            nested
            onChange={(json) => {
              lastWrite.current = json
              useNoteStore.getState().putSynced(syncId, json)
            }}
          />
        )}
      </div>
    </BlockFrame>
  )
}
