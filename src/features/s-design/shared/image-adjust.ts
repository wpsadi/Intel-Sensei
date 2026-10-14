import type { ImageAdjust } from '@/features/s-3d/types'

/** One-click looks for images, shared by the S-Design inspector and the image editor widget. */
export const ADJUST_PRESETS: Record<string, ImageAdjust> = {
  Original: {},
  Vivid: { saturation: 40, contrast: 15 },
  'Black & white': { grayscale: 100, contrast: 10 },
  Vintage: { sepia: 50, contrast: -10, brightness: 5 },
  Warm: { temperature: 40, saturation: 10 },
  Cool: { temperature: -40 },
  Faded: { contrast: -25, brightness: 10, saturation: -20 },
  Dramatic: { contrast: 40, saturation: -15, brightness: -10 },
}

/** The adjustment sliders, in display order. */
export const ADJUST_SLIDERS: { key: Exclude<keyof ImageAdjust, 'invert'>; label: string; min: number; max: number; suffix?: string }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, suffix: '°' },
  { key: 'blur', label: 'Blur', min: 0, max: 40, suffix: 'px' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, suffix: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, suffix: '%' },
]
