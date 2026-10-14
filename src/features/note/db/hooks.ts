import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { selectAncestry, selectChildren, useNoteStore } from '../note.store'
import { resolveMedia } from './media'

/* Read hooks over the note store. `undefined` while loading. */

/** `undefined` while loading, `null` when the page does not exist. */
export const usePage = (id: string | undefined) => useNoteStore((s) => (!s.ready ? undefined : id ? (s.pages[id] ?? null) : null))

/** `null` lists workspace roots; `undefined` skips the list. */
export const useChildPages = (parentId: string | null | undefined) =>
  useNoteStore(
    useShallow((s) => {
      if (!s.ready) return undefined
      if (parentId === undefined) return []
      return selectChildren(s, parentId)
    }),
  )

export const useAllPages = () => useNoteStore(useShallow((s) => (s.ready ? Object.values(s.pages) : undefined)))

export const useAncestry = (id: string | undefined) => useNoteStore(useShallow((s) => (s.ready ? selectAncestry(s, id) : undefined)))

export const useDatabase = (id: string | undefined) => useNoteStore((s) => (!s.ready ? undefined : id ? s.databases[id] : undefined))

export const useDatabases = () => useNoteStore(useShallow((s) => (s.ready ? Object.values(s.databases) : undefined)))

export const useRows = (databaseId: string | undefined) =>
  useNoteStore(useShallow((s) => (!s.ready ? undefined : databaseId ? selectChildren(s, databaseId) : [])))

export const useViews = (ownerId: string | undefined) =>
  useNoteStore(
    useShallow((s) => {
      if (!s.ready) return undefined
      if (!ownerId) return []
      return Object.values(s.views)
        .filter((view) => view.ownerId === ownerId)
        .sort((a, b) => a.order - b.order)
    }),
  )

export const usePeople = () => useNoteStore((s) => (s.ready ? s.people : undefined))

export const useSetting = (key: string) => useNoteStore((s) => (s.ready ? (s.settings[key] ?? '') : undefined))

export function useMediaUrl(src: string | undefined) {
  const [url, setUrl] = useState('')
  // Clearing the source clears the URL right away (during render, not in an effect); a new source keeps the
  // previous URL until it resolves.
  if (!src && url) setUrl('')
  useEffect(() => {
    if (!src) return
    let alive = true
    resolveMedia(src).then((resolved) => alive && setUrl(resolved))
    return () => {
      alive = false
    }
  }, [src])
  return src ? url : ''
}
