import type { ImageAdjust } from '../types'

/** CSS filter string for an image adjustment; undefined when neutral. */
export function adjustFilter(a?: ImageAdjust) {
  if (!a) return undefined
  const f: string[] = []
  if (a.brightness) f.push(`brightness(${1 + a.brightness / 100})`)
  if (a.contrast) f.push(`contrast(${1 + a.contrast / 100})`)
  if (a.saturation) f.push(`saturate(${1 + a.saturation / 100})`)
  if (a.temperature) f.push(`sepia(${Math.abs(a.temperature) / 250}) hue-rotate(${a.temperature > 0 ? -10 : 170}deg)`)
  if (a.hue) f.push(`hue-rotate(${a.hue}deg)`)
  if (a.grayscale) f.push(`grayscale(${a.grayscale / 100})`)
  if (a.sepia) f.push(`sepia(${a.sepia / 100})`)
  if (a.invert) f.push('invert(1)')
  if (a.blur) f.push(`blur(${a.blur}px)`)
  return f.join(' ') || undefined
}
