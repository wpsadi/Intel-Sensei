import { selectAncestry, selectChildren, useNoteStore } from '../note.store'
import { useEffect, useState } from 'react'
import { resolveMedia } from './media'
import { useShallow } from 'zustand/react/shallow'

/* Read hooks over the note store. `undefined` while loading. */

/** `undefined` while loading, `null` when the page does not exist. */
export const usePage = (id: string | undefined) =>
  useNoteStore((s) => (!s.ready ? undefined : id ? (s.pages[id] ?? null) : null))

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

export const useAncestry = (id: string | undefined) =>
  useNoteStore(useShallow((s) => (s.ready ? selectAncestry(s, id) : undefined)))

export const useDatabase = (id: string | undefined) =>
  useNoteStore((s) => (!s.ready ? undefined : id ? s.databases[id] : undefined))

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
  useEffect(() => {
    let alive = true
    if (src) resolveMedia(src).then((resolved) => alive && setUrl(resolved))
    else setUrl('')
    return () => {
      alive = false
    }
  }, [src])
  return url
}
