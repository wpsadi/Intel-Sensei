type Matter = {
  model: (input: unknown) => Promise<{ output: { 0: { mul: (n: number) => { to: (t: string) => unknown } } } }>
  processor: (img: unknown) => Promise<{ pixel_values: unknown }>
  lib: typeof import('@huggingface/transformers')
}
let matter: Promise<Matter> | null = null

/** MODNet portrait/object matting, run in the browser. The model is downloaded once and cached by the browser. */
function loadMatter() {
  matter ??= import('@huggingface/transformers').then(async (lib) => {
    const [model, processor] = await Promise.all([
      lib.AutoModel.from_pretrained('Xenova/modnet', { dtype: 'fp32' }),
      lib.AutoProcessor.from_pretrained('Xenova/modnet'),
    ])
    return { model, processor, lib } as unknown as Matter
  })
  matter.catch(() => (matter = null))
  return matter
}

/** Cuts the subject out of an image: the result is a PNG whose background is transparent. */
export async function cutOutBackground(blob: Blob): Promise<Blob> {
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
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the cut-out'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
