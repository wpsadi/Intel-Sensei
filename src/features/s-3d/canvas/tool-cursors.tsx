import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BandageIcon, BoxSelectIcon, BrushIcon, CropIcon, EraserIcon, LassoIcon, PipetteIcon, StampIcon, WandIcon, WandSparklesIcon } from 'lucide-react'
import type { Tool } from '../types'

/** The Lucide icon of each pixel tool, with the hotspot (the point that clicks) in icon coordinates. */
const CURSORS: Partial<Record<Tool, { icon: ReactElement; hot: string }>> = {
  brush: { icon: <BrushIcon />, hot: '2 22' },
  eraser: { icon: <EraserIcon />, hot: '6 18' },
  clone: { icon: <StampIcon />, hot: '12 20' },
  heal: { icon: <BandageIcon />, hot: '12 12' },
  marquee: { icon: <BoxSelectIcon />, hot: '12 12' },
  lasso: { icon: <LassoIcon />, hot: '12 12' },
  wand: { icon: <WandIcon />, hot: '3 21' },
  quick: { icon: <WandSparklesIcon />, hot: '3 21' },
  crop: { icon: <CropIcon />, hot: '12 12' },
  eyedropper: { icon: <PipetteIcon />, hot: '3 21' },
}

/** Inner SVG of a Lucide icon, without its outer element, so the strokes can be styled per layer. */
const inner = (el: ReactElement) => renderToStaticMarkup(el).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

const cache = new Map<Tool, string>()

/** CSS cursor for a pixel tool: its icon with a white halo under a dark stroke, so it reads on any background. */
export function toolCursor(tool: Tool): string {
  const entry = CURSORS[tool]
  if (!entry) return 'crosshair'
  const known = cache.get(tool)
  if (known) return known
  const body = inner(entry.icon)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">`
    + `<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
    + `<g fill="none" stroke="#111111" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  const css = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${entry.hot}, crosshair`
  cache.set(tool, css)
  return css
}
