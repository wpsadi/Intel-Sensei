import { readFile, storeFile } from './files'
import { cutOutBackground } from './raster/matting'
import { useS3D } from './store'

/** Replaces the source of image nodes with a transparent-background PNG, keeping the original so it can be restored. */
export async function removeBackground(ids: string[]) {
  const st = useS3D.getState
  const done: string[] = []
  for (const id of ids) {
    const n = st().doc.nodes[id]
    if (n?.type !== 'image') continue
    const blob = await readFile(n.src)
    if (!blob) throw new Error(`Could not read the image for "${n.name}"`)
    const out = await cutOutBackground(blob)
    const src = await storeFile(out, `${n.name}-cutout.png`, st().doc.id)
    st().updateNodes([id], { src, origSrc: n.origSrc ?? n.src })
    done.push(id)
  }
  return done
}

export function restoreBackground(ids: string[]) {
  const st = useS3D.getState
  const restored = ids.filter((id) => st().doc.nodes[id]?.origSrc)
  for (const id of restored)
    st().updateNodes([id], (n) => {
      n.src = n.origSrc!
      n.origSrc = undefined
    })
  return restored
}
