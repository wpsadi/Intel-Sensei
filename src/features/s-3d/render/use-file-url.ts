import { useEffect, useState } from 'react'

import { isFileRef, resolveFile } from '../files'

/** Resolves a `s3d-file:` ref (or plain URL) to a loadable URL. */
export function useFileUrl(src: string) {
  const [url, setUrl] = useState(() => (src && !isFileRef(src) ? src : ''))
  const [prevSrc, setPrevSrc] = useState(src)
  if (src !== prevSrc) {
    setPrevSrc(src)
    if (!src) setUrl('')
  }
  useEffect(() => {
    let alive = true
    if (src)
      void resolveFile(src).then((u) => {
        if (alive) setUrl(u)
      })
    return () => {
      alive = false
    }
  }, [src])
  return url
}
