import { describe, expect, it } from 'vitest'
import { type Pixels, backgroundEraseStroke, clipToMask, cloneStroke, combineMasks, densify, featherMask, fillMask, growMask, healSpot, hexRgb, hueSaturation, invertMask, maskSummary, paintStroke, pickColor, selectionMask, vibrance } from './pixels'

const blank = (width: number, height: number, rgba: [number, number, number, number] = [0, 0, 0, 0]): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i)
  return { width, height, data }
}
const at = (px: Pixels, x: number, y: number) => Array.from(px.data.slice((y * px.width + x) * 4, (y * px.width + x) * 4 + 4))

describe('brush and eraser', () => {
  it('paints the colour under the stroke and leaves the rest transparent', () => {
    const px = blank(40, 40)
    paintStroke(px, [[20, 20]], { size: 10, hardness: 1, opacity: 1 }, [255, 0, 0])
    expect(at(px, 20, 20)).toEqual([255, 0, 0, 255])
    expect(at(px, 0, 0)[3]).toBe(0)
  })

  it('erases alpha without touching colour where the stroke passes', () => {
    const px = blank(40, 40, [10, 20, 30, 255])
    paintStroke(px, [[20, 20]], { size: 10, hardness: 1, opacity: 1 })
    expect(at(px, 20, 20)[3]).toBe(0)
    expect(at(px, 0, 0)).toEqual([10, 20, 30, 255])
  })

  it('spaces stamps evenly along a path', () => {
    expect(densify([[0, 0], [10, 0]], 2)).toHaveLength(6)
    expect(densify([[5, 5]], 2)).toEqual([[5, 5]])
  })
})

describe('clone stamp', () => {
  it('copies the sample area at the same offset as the stroke', () => {
    const px = blank(40, 40, [0, 0, 0, 255])
    // A red block at (5..9, 5..9) is the source; the stroke starts at (25, 25) with the sample at (7, 7).
    for (let y = 5; y < 10; y++) for (let x = 5; x < 10; x++) px.data.set([255, 0, 0, 255], (y * 40 + x) * 4)
    const source = { width: 40, height: 40, data: px.data.slice() }
    cloneStroke(px, source, [[25, 25]], [7, 7], { size: 4, hardness: 1, opacity: 1 })
    expect(at(px, 25, 25)).toEqual([255, 0, 0, 255])
  })
})

describe('spot healing', () => {
  it('removes a red spot on a grey surface, leaving grey', () => {
    const px = blank(60, 60, [128, 128, 128, 255])
    for (let y = 28; y < 33; y++) for (let x = 28; x < 33; x++) px.data.set([255, 0, 0, 255], (y * 60 + x) * 4)
    healSpot(px, 30.5, 30.5, 3)
    const [r, g, b] = at(px, 30, 30)
    expect(Math.abs(r - 128)).toBeLessThan(4)
    expect(Math.abs(g - 128)).toBeLessThan(4)
    expect(Math.abs(b - 128)).toBeLessThan(4)
  })
})

describe('selections', () => {
  it('rect selects the pixels inside its bounds', () => {
    const px = blank(10, 10)
    const mask = selectionMask(px, { type: 'rect', x: 2, y: 2, w: 4, h: 3 })
    expect(maskSummary(mask)).toEqual({ pixels: 12, bounds: { x: 2, y: 2, w: 4, h: 3 } })
  })

  it('ellipse covers about pi/4 of its box', () => {
    const px = blank(40, 40)
    const { pixels } = maskSummary(selectionMask(px, { type: 'ellipse', x: 0, y: 0, w: 40, h: 40 }))
    expect(Math.abs(pixels / 1600 - Math.PI / 4)).toBeLessThan(0.02)
  })

  it('magic wand contiguous stops at a boundary; global takes every matching pixel', () => {
    const px = blank(10, 4, [255, 255, 255, 255])
    // A black column splits the image in two; the seed sits on the left.
    for (let y = 0; y < 4; y++) px.data.set([0, 0, 0, 255], (y * 10 + 5) * 4)
    const contiguous = maskSummary(selectionMask(px, { type: 'wand', x: 0, y: 0, tolerance: 32, contiguous: true }))
    const global = maskSummary(selectionMask(px, { type: 'wand', x: 0, y: 0, tolerance: 32, contiguous: false }))
    expect(contiguous.pixels).toBe(20)
    expect(global.pixels).toBe(36)
  })

  it('lasso fills the polygon interior', () => {
    const px = blank(20, 20)
    const { pixels } = maskSummary(selectionMask(px, { type: 'lasso', points: [[0, 0], [20, 0], [0, 20]] }))
    expect(Math.abs(pixels / 400 - 0.5)).toBeLessThan(0.05)
  })

  it('combines and inverts selections', () => {
    const px = blank(10, 10)
    const a = selectionMask(px, { type: 'rect', x: 0, y: 0, w: 5, h: 10 })
    const b = selectionMask(px, { type: 'rect', x: 0, y: 0, w: 10, h: 5 })
    expect(maskSummary(combineMasks({ ...a, data: a.data.slice() }, b, 'add')).pixels).toBe(75)
    expect(maskSummary(combineMasks({ ...a, data: a.data.slice() }, b, 'intersect')).pixels).toBe(25)
    expect(maskSummary(invertMask({ ...a, data: a.data.slice() })).pixels).toBe(50)
  })

  it('clipToMask keeps original pixels outside the selection', () => {
    const original = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])
    const edited = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])
    clipToMask(original, edited, { width: 2, height: 1, data: new Float32Array([1, 0]) })
    expect(Array.from(edited.slice(0, 4))).toEqual([255, 255, 255, 255])
    expect(Array.from(edited.slice(4, 8))).toEqual([0, 0, 0, 255])
  })
})

describe('fill, vibrance and colour', () => {
  it('fills a selected hole from a uniform surround', () => {
    const px = blank(30, 30, [90, 140, 200, 255])
    const mask = selectionMask(px, { type: 'rect', x: 10, y: 10, w: 8, h: 8 })
    for (let p = 0; p < mask.data.length; p++) if (mask.data[p]) px.data.set([255, 0, 255, 255], p * 4)
    fillMask(px, mask)
    const [r, g, b] = at(px, 14, 14)
    expect(Math.abs(r - 90)).toBeLessThan(3)
    expect(Math.abs(g - 140)).toBeLessThan(3)
    expect(Math.abs(b - 200)).toBeLessThan(3)
  })

  it('vibrance -100 desaturates to grey; +100 pushes a muted colour apart', () => {
    const grey = blank(1, 1, [200, 100, 150, 255])
    vibrance(grey, -100)
    expect(at(grey, 0, 0)[0]).toBe(at(grey, 0, 0)[1])

    const muted = blank(1, 1, [140, 120, 110, 255])
    vibrance(muted, 100)
    const [r, , b] = at(muted, 0, 0)
    expect(r - b).toBeGreaterThan(140 - 110)
  })

  it('reads a pixel as hex and alpha', () => {
    const px = blank(2, 2, [255, 128, 0, 255])
    expect(pickColor(px, 1, 1)).toEqual({ hex: '#ff8000', alpha: 1 })
    expect(() => pickColor(px, 5, 0)).toThrow(/outside/)
  })

  it('parses hex colours', () => {
    expect(hexRgb('#1e293b')).toEqual([30, 41, 59])
    expect(hexRgb('fff')).toEqual([255, 255, 255])
    expect(() => hexRgb('red')).toThrow(/hex/)
  })
})

describe('select and mask refinement', () => {
  it('grows a single pixel into its four neighbours and contracts it back to nothing', () => {
    const px = blank(9, 9)
    const mask = selectionMask(px, { type: 'rect', x: 4, y: 4, w: 1, h: 1 })
    expect(maskSummary(growMask({ ...mask, data: mask.data.slice() }, 1)).pixels).toBe(5)
    expect(maskSummary(growMask({ ...mask, data: mask.data.slice() }, -1)).pixels).toBe(0)
  })

  it('feathers a hard edge into fractional coverage across the boundary', () => {
    const px = blank(40, 10)
    const mask = featherMask(selectionMask(px, { type: 'rect', x: 0, y: 0, w: 20, h: 10 }), 4)
    const edge = mask.data[5 * 40 + 20]
    expect(edge).toBeGreaterThan(0.05)
    expect(edge).toBeLessThan(0.95)
    expect(mask.data[5 * 40 + 2]).toBeGreaterThan(0.95)
  })
})

describe('hue, saturation and lightness', () => {
  it('saturation -100 turns a colour grey; lightness +100 turns it white', () => {
    const grey = blank(1, 1, [200, 80, 40, 255])
    hueSaturation(grey, 0, -100, 0)
    expect(Math.abs(at(grey, 0, 0)[0] - at(grey, 0, 0)[2])).toBeLessThan(2)
    const white = blank(1, 1, [200, 80, 40, 255])
    hueSaturation(white, 0, 0, 100)
    expect(at(white, 0, 0).slice(0, 3)).toEqual([255, 255, 255])
  })

  it('hue 180 turns red into cyan', () => {
    const px = blank(1, 1, [255, 0, 0, 255])
    hueSaturation(px, 180, 0, 0)
    const [r, g, b] = at(px, 0, 0)
    expect(r).toBeLessThan(5)
    expect(g).toBeGreaterThan(250)
    expect(b).toBeGreaterThan(250)
  })
})

describe('background eraser', () => {
  it('removes the sampled background colour and keeps other colours', () => {
    const px = blank(20, 20, [0, 200, 0, 255])
    for (let x = 0; x < 20; x++) px.data.set([200, 0, 0, 255], (10 * 20 + x) * 4)
    backgroundEraseStroke(px, [[10, 10]], { size: 20, hardness: 1, opacity: 1 }, [0, 200, 0], 32)
    expect(at(px, 10, 5)[3]).toBe(0)
    expect(at(px, 10, 10)[3]).toBe(255)
    expect(at(px, 5, 5)[3]).toBe(0)
  })
})
