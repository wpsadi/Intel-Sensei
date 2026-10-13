import { readFile, storeFile } from './files'
import { useS3D } from './store'

type Matter = { model: (input: unknown) => Promise<{ output: { 0: { mul: (n: number) => { to: (t: string) => unknown } } } }>; processor: (img: unknown) => Promise<{ pixel_values: unknown }>; lib: typeof import('@huggingface/transformers') }
let matter: Promise<Matter> | null = null

/** MODNet portrait/object matting, run in the browser. The model is downloaded once and cached by the browser. */
function loadMatter() {
  matter ??= import('@huggingface/transformers').then(async (lib) => {
    const [model, processor] = await Promise.all([lib.AutoModel.from_pretrained('Xenova/modnet', { dtype: 'fp32' }), lib.AutoProcessor.from_pretrained('Xenova/modnet')])
    return { model, processor, lib } as unknown as Matter
  })
  matter.catch(() => (matter = null))
  return matter
}

async function cutOut(blob: Blob): Promise<Blob> {
  const { model, processor, lib } = await loadMatter()
  const url = URL.createObjectURL(blob)
  try {
    const image = await lib.RawImage.fromURL(url)
    const { pixel_values } = await processor(image)
    const { output } = await model({ input: pixel_values })
    const mask = await lib.RawImage.fromTensor(output[0].mul(255).to('uint8') as never).resize(image.width, image.height)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')!
    const bitmap = await createImageBitmap(blob)
    ctx.drawImage(bitmap, 0, 0, image.width, image.height)
    const px = ctx.getImageData(0, 0, image.width, image.height)
    for (let i = 0; i < mask.data.length; i++) px.data[i * 4 + 3] = mask.data[i]
    ctx.putImageData(px, 0, 0)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the cut-out'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Replaces the source of image nodes with a transparent-background PNG, keeping the original so it can be restored. */
export async function removeBackground(ids: string[]) {
  const st = useS3D.getState
  const done: string[] = []
  for (const id of ids) {
    const n = st().doc.nodes[id]
    if (n?.type !== 'image') continue
    const blob = await readFile(n.src)
    if (!blob) throw new Error(`Could not read the image for "${n.name}"`)
    const out = await cutOut(blob)
    const src = await storeFile(out, `${n.name}-cutout.png`, st().doc.id)
    st().updateNodes([id], { src, origSrc: n.origSrc ?? n.src })
    done.push(id)
  }
  return done
}

export function restoreBackground(ids: string[]) {
  const st = useS3D.getState
  const restored = ids.filter((id) => st().doc.nodes[id]?.origSrc)
  for (const id of restored) st().updateNodes([id], (n) => { n.src = n.origSrc!; n.origSrc = undefined })
  return restored
}
